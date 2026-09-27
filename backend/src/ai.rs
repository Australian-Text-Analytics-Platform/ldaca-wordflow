//! Host-owned provider configuration. Project files contain configuration IDs, never secrets.
mod apple;
mod credentials;
pub(crate) mod http;
pub mod inference;
use crate::{Error, error::Result};
use credentials::{OsSecrets, Secrets};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Openai,
    Openrouter,
    Anthropic,
    Google,
    Custom,
    Apple,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CredentialMode {
    #[default]
    None,
    Session,
    Remembered,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Connection {
    pub id: Uuid,
    pub revision: Uuid,
    pub name: String,
    pub provider: Provider,
    pub endpoint: Option<String>,
    pub credential_mode: CredentialMode,
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ConnectionInfo {
    #[serde(flatten)]
    #[schema(schema_with = flattened_schema)]
    pub connection: Connection,
    pub has_credential: bool,
    #[schema(required = true)]
    pub credential_error: Option<Error>,
    pub built_in: bool,
}
// Deliberately no Debug or Serialize: inbound keys must not enter logs or response bodies.
#[derive(Default, Deserialize, utoipa::ToSchema)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum CredentialUpdate {
    #[default]
    Keep,
    Session {
        key: String,
    },
    Remember {
        key: String,
    },
    Remove,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateConnection {
    pub name: String,
    pub provider: Provider,
    pub endpoint: Option<String>,
    #[serde(default)]
    pub credential: CredentialUpdate,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateConnection {
    pub name: String,
    #[serde(default)]
    pub credential: CredentialUpdate,
}
#[derive(Default)]
struct State {
    connections: Option<BTreeMap<Uuid, Connection>>,
    sessions: BTreeMap<Uuid, String>,
}
struct Host {
    path: Option<PathBuf>,
    secrets: Box<dyn Secrets>,
    state: Mutex<State>,
    models: tokio::sync::Mutex<BTreeMap<Uuid, (Uuid, Vec<String>)>>,
}
/// Clone once per project runtime. Hosts provide their own identity and safe configuration path.
/// Construction performs no I/O. All filesystem/keyring work runs on blocking worker threads.
#[derive(Clone)]
pub struct AiConfiguration(Arc<Host>);
impl AiConfiguration {
    pub fn new(identity: &str, path: PathBuf) -> Self {
        Self(Arc::new(Host {
            path: Some(path),
            secrets: Box::new(OsSecrets {
                namespace: format!("{identity}.ai.providers"),
            }),
            state: Mutex::new(State::default()),
            models: tokio::sync::Mutex::new(BTreeMap::new()),
        }))
    }
    /// Unconfigured runtimes can use explicitly session-only keys, but cannot remember credentials.
    pub fn session_only() -> Self {
        struct Unavailable;
        impl Secrets for Unavailable {
            fn get(&self, _: &str) -> Result<Option<String>> {
                Err(Error::new(
                    "credential_store_unavailable",
                    "This host has not configured a credential store",
                ))
            }
            fn set(&self, id: &str, _: &str) -> Result<()> {
                self.get(id).map(|_| ())
            }
            fn remove(&self, id: &str) -> Result<()> {
                self.get(id).map(|_| ())
            }
        }
        Self(Arc::new(Host {
            path: None,
            secrets: Box::new(Unavailable),
            state: Mutex::new(State::default()),
            models: tokio::sync::Mutex::new(BTreeMap::new()),
        }))
    }
    async fn access<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Host, &mut State) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let host = self.0.clone();
        tokio::task::spawn_blocking(move || {
            // Serializes entry mutations and metadata persistence, including requests from other windows.
            let mut state = host
                .state
                .lock()
                .map_err(|_| Error::new("worker_failed", "Provider configuration lock poisoned"))?;
            if state.connections.is_none() {
                let rows: Vec<Connection> = match &host.path {
                    Some(path) => match std::fs::read(path) {
                        Ok(bytes) => serde_json::from_slice(&bytes)?,
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
                        Err(error) => return Err(error.into()),
                    },
                    None => Vec::new(),
                };
                let mut connections = BTreeMap::new();
                for row in rows {
                    validate_name(&row.name)?;
                    validate_endpoint(row.provider, row.endpoint.as_deref())?;
                    if connections.insert(row.id, row).is_some() {
                        return Err(Error::invalid("Duplicate provider configuration ID"));
                    }
                }
                state.connections = Some(connections);
            }
            work(&host, &mut state)
        })
        .await?
    }
    pub async fn list(&self) -> Result<Vec<ConnectionInfo>> {
        self.access(|host, state| {
            let rows = connections(state)?
                .values()
                .map(|row| info(host, state, row.clone()))
                .collect::<Vec<_>>();
            #[cfg(target_os = "macos")]
            let rows = {
                let mut rows = rows;
                rows.insert(0, apple::info());
                rows
            };
            Ok(rows)
        })
        .await
    }
    pub async fn create(&self, request: CreateConnection) -> Result<ConnectionInfo> {
        self.access(move |host, state| {
            if request.provider == Provider::Apple {
                return Err(Error::invalid(
                    "Use the built-in Apple Foundation Models connection",
                ));
            }
            validate_name(&request.name)?;
            validate_endpoint(request.provider, request.endpoint.as_deref())?;
            let mut row = Connection {
                id: Uuid::new_v4(),
                revision: Uuid::new_v4(),
                name: request.name.trim().into(),
                provider: request.provider,
                endpoint: request.endpoint.map(|s| s.trim_end_matches('/').into()),
                credential_mode: CredentialMode::None,
            };
            change_credential(host, state, &mut row, request.credential)?;
            let mut next = connections(state)?.clone();
            next.insert(row.id, row.clone());
            if let Err(error) = persist(host, &next) {
                state.sessions.remove(&row.id);
                if row.credential_mode == CredentialMode::Remembered {
                    let _ = host.secrets.remove(&row.id.to_string());
                }
                return Err(error);
            }
            state.connections = Some(next);
            Ok(info(host, state, row))
        })
        .await
    }
    pub async fn update(&self, id: Uuid, request: UpdateConnection) -> Result<ConnectionInfo> {
        self.access(move |host, state| {
            validate_name(&request.name)?;
            let original = connection(state, id)?;
            let changing = !matches!(request.credential, CredentialUpdate::Keep);
            let previous = changing
                .then(|| credential(host, state, &original))
                .transpose()?;
            let mut row = original.clone();
            row.name = request.name.trim().into();
            row.revision = Uuid::new_v4();
            change_credential(host, state, &mut row, request.credential)?;
            let mut next = connections(state)?.clone();
            next.insert(id, row.clone());
            if let Err(error) = persist(host, &next) {
                if let Some(previous) = previous {
                    restore_credential(host, state, &original, &row, previous)?;
                }
                return Err(error);
            }
            state.connections = Some(next);
            Ok(info(host, state, row))
        })
        .await
    }
    pub async fn remove(&self, id: Uuid) -> Result<()> {
        self.access(move |host, state| {
            let row = connection(state, id)?;
            let previous = credential(host, state, &row)?;
            if row.credential_mode == CredentialMode::Remembered {
                host.secrets.remove(&id.to_string())?;
            }
            let mut next = connections(state)?.clone();
            next.remove(&id);
            if let Err(error) = persist(host, &next) {
                restore_credential(host, state, &row, &row, previous)?;
                return Err(error);
            }
            state.connections = Some(next);
            state.sessions.remove(&id);
            Ok(())
        })
        .await
    }
    pub(crate) async fn resolve(&self, id: Uuid) -> Result<(Connection, Option<String>)> {
        if id == apple::ID {
            tokio::task::spawn_blocking(apple::availability).await??;
            return Ok((apple::connection(), None));
        }
        self.access(move |host, state| {
            let row = connection(state, id)?;
            let key = credential(host, state, &row)?;
            if row.provider != Provider::Custom && key.is_none() {
                return Err(Error::new(
                    "provider_credential_required",
                    "This provider connection needs an API key",
                ));
            }
            Ok((row, key))
        })
        .await
    }
}
fn connections(state: &State) -> Result<&BTreeMap<Uuid, Connection>> {
    state
        .connections
        .as_ref()
        .ok_or_else(|| Error::new("worker_failed", "Provider configuration is not loaded"))
}
fn connection(state: &State, id: Uuid) -> Result<Connection> {
    connections(state)?.get(&id).cloned().ok_or_else(|| {
        Error::new(
            "provider_not_found",
            "The selected provider connection no longer exists",
        )
    })
}
fn credential(host: &Host, state: &State, row: &Connection) -> Result<Option<String>> {
    match row.credential_mode {
        CredentialMode::None => Ok(None),
        CredentialMode::Session => Ok(state.sessions.get(&row.id).cloned()),
        CredentialMode::Remembered => host.secrets.get(&row.id.to_string()),
    }
}
fn info(host: &Host, state: &State, row: Connection) -> ConnectionInfo {
    let credential = credential(host, state, &row);
    ConnectionInfo {
        connection: row,
        has_credential: credential.as_ref().is_ok_and(Option::is_some),
        credential_error: credential.err(),
        built_in: false,
    }
}
fn validate_name(name: &str) -> Result<()> {
    if name.trim().is_empty() {
        return Err(Error::invalid("Enter a provider connection name"));
    }
    Ok(())
}
fn validate_endpoint(provider: Provider, endpoint: Option<&str>) -> Result<()> {
    if provider != Provider::Custom {
        if endpoint.is_some() {
            return Err(Error::invalid("Only Custom connections accept an endpoint"));
        }
        return Ok(());
    }
    let url =
        reqwest::Url::parse(endpoint.ok_or_else(|| Error::invalid("Enter a Custom API endpoint"))?)
            .map_err(|_| Error::invalid("Enter a valid Custom API endpoint"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::invalid(
            "Custom endpoints must be HTTP(S) URLs without embedded credentials, query strings or fragments",
        ));
    }
    Ok(())
}
fn change_credential(
    host: &Host,
    state: &mut State,
    row: &mut Connection,
    update: CredentialUpdate,
) -> Result<()> {
    let id = row.id.to_string();
    match update {
        CredentialUpdate::Keep => {}
        CredentialUpdate::Remember { key } => {
            validate_key(&key)?;
            host.secrets.set(&id, &key)?;
            state.sessions.remove(&row.id);
            row.credential_mode = CredentialMode::Remembered;
        }
        CredentialUpdate::Session { key } => {
            validate_key(&key)?;
            if row.credential_mode == CredentialMode::Remembered {
                host.secrets.remove(&id)?;
            }
            state.sessions.insert(row.id, key);
            row.credential_mode = CredentialMode::Session;
        }
        CredentialUpdate::Remove => {
            if row.credential_mode == CredentialMode::Remembered {
                host.secrets.remove(&id)?;
            }
            state.sessions.remove(&row.id);
            row.credential_mode = CredentialMode::None;
        }
    }
    Ok(())
}
// Filesystem and OS credential stores cannot share a transaction. Restore the prior
// credential if committing safe connection metadata fails; never serialize it to disk.
fn restore_credential(
    host: &Host,
    state: &mut State,
    old: &Connection,
    new: &Connection,
    key: Option<String>,
) -> Result<()> {
    let id = old.id.to_string();
    if old.credential_mode == CredentialMode::Remembered {
        match &key {
            Some(key) => host.secrets.set(&id, key)?,
            None => host.secrets.remove(&id)?,
        }
    } else if new.credential_mode == CredentialMode::Remembered {
        host.secrets.remove(&id)?;
    }
    state.sessions.remove(&old.id);
    if old.credential_mode == CredentialMode::Session
        && let Some(key) = key
    {
        state.sessions.insert(old.id, key);
    }
    Ok(())
}
fn validate_key(key: &str) -> Result<()> {
    if key.trim().is_empty() {
        Err(Error::invalid("Enter a nonblank API key, or choose Remove"))
    } else {
        Ok(())
    }
}
fn persist(host: &Host, rows: &BTreeMap<Uuid, Connection>) -> Result<()> {
    if let Some(path) = &host.path {
        let parent = path
            .parent()
            .ok_or_else(|| Error::invalid("Provider configuration path has no parent"))?;
        std::fs::create_dir_all(parent)?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        serde_json::to_writer(&mut temporary, &rows.values().collect::<Vec<_>>())?;
        temporary.flush()?;
        temporary.as_file().sync_all()?;
        temporary.persist(path).map_err(|e| Error::from(e.error))?;
    }
    Ok(())
}

fn flattened_schema() -> utoipa::openapi::RefOr<utoipa::openapi::Schema> {
    crate::openapi::flattened::<Connection>()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct MemorySecrets(Mutex<BTreeMap<String, String>>);
    impl Secrets for MemorySecrets {
        fn get(&self, id: &str) -> Result<Option<String>> {
            Ok(self.0.lock().unwrap().get(id).cloned())
        }
        fn set(&self, id: &str, value: &str) -> Result<()> {
            self.0.lock().unwrap().insert(id.into(), value.into());
            Ok(())
        }
        fn remove(&self, id: &str) -> Result<()> {
            self.0.lock().unwrap().remove(id);
            Ok(())
        }
    }
    fn configured(path: PathBuf) -> AiConfiguration {
        AiConfiguration(Arc::new(Host {
            path: Some(path),
            secrets: Box::<MemorySecrets>::default(),
            state: Mutex::new(State::default()),
            models: tokio::sync::Mutex::new(BTreeMap::new()),
        }))
    }
    fn create(credential: CredentialUpdate) -> CreateConnection {
        CreateConnection {
            name: "Local research".into(),
            provider: Provider::Custom,
            endpoint: Some("http://127.0.0.1:8000/v1".into()),
            credential,
        }
    }
    #[tokio::test]
    async fn session_secrets_are_shared_between_windows_but_never_persisted_or_returned() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("connections.json");
        let host = configured(path.clone());
        let window = host.clone();
        let row = host
            .create(create(CredentialUpdate::Session {
                key: "session-super-secret".into(),
            }))
            .await
            .unwrap();
        assert!(row.has_credential);
        assert!(
            !serde_json::to_string(&row)
                .unwrap()
                .contains("session-super-secret")
        );
        assert!(
            !std::fs::read_to_string(&path)
                .unwrap()
                .contains("session-super-secret")
        );
        assert_eq!(
            window
                .resolve(row.connection.id)
                .await
                .unwrap()
                .1
                .as_deref(),
            Some("session-super-secret")
        );
        let reopened = configured(path);
        assert!(!reopened.list().await.unwrap()[0].has_credential);
        host.remove(row.connection.id).await.unwrap();
        assert_eq!(
            window.resolve(row.connection.id).await.unwrap_err().code,
            "provider_not_found"
        );
    }
    #[tokio::test]
    async fn remembered_keys_use_store_and_updates_cannot_change_endpoint_or_provider() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("connections.json");
        let host = configured(path.clone());
        let row = host
            .create(create(CredentialUpdate::Remember {
                key: "remembered-super-secret".into(),
            }))
            .await
            .unwrap();
        assert!(
            !std::fs::read_to_string(path)
                .unwrap()
                .contains("remembered-super-secret")
        );
        assert_eq!(
            host.0
                .secrets
                .get(&row.connection.id.to_string())
                .unwrap()
                .as_deref(),
            Some("remembered-super-secret")
        );
        let changed = host
            .update(
                row.connection.id,
                UpdateConnection {
                    name: "Renamed".into(),
                    credential: CredentialUpdate::Keep,
                },
            )
            .await
            .unwrap();
        assert_ne!(changed.connection.revision, row.connection.revision);
        assert_eq!(changed.connection.endpoint, row.connection.endpoint);
        assert!(
            serde_json::from_value::<UpdateConnection>(
                serde_json::json!({"name":"Other", "endpoint":"https://example.org"})
            )
            .is_err()
        );
        host.update(
            row.connection.id,
            UpdateConnection {
                name: "Renamed".into(),
                credential: CredentialUpdate::Remove,
            },
        )
        .await
        .unwrap();
        assert!(
            host.0
                .secrets
                .get(&row.connection.id.to_string())
                .unwrap()
                .is_none()
        );
    }
    #[tokio::test]
    async fn unavailable_store_never_falls_back_to_plaintext_or_implicit_session() {
        let host = AiConfiguration::session_only();
        assert_eq!(
            host.create(create(CredentialUpdate::Remember {
                key: "secret".into()
            }))
            .await
            .unwrap_err()
            .code,
            "credential_store_unavailable"
        );
        assert!(host.list().await.unwrap().iter().all(|row| row.built_in));
        let row = host
            .create(create(CredentialUpdate::Session {
                key: "secret".into(),
            }))
            .await
            .unwrap();
        assert!(row.has_credential);
    }
    #[tokio::test]
    async fn failed_metadata_commit_restores_remembered_and_session_credentials() {
        for mode in [CredentialMode::Remembered, CredentialMode::Session] {
            let temp = tempfile::tempdir().unwrap();
            let path = temp.path().join("connections.json");
            let host = configured(path.clone());
            let row = host
                .create(create(if mode == CredentialMode::Remembered {
                    CredentialUpdate::Remember {
                        key: "previous-key".into(),
                    }
                } else {
                    CredentialUpdate::Session {
                        key: "previous-key".into(),
                    }
                }))
                .await
                .unwrap();
            std::fs::remove_file(&path).unwrap();
            std::fs::create_dir(&path).unwrap(); // Force the final atomic metadata rename to fail.
            assert!(
                host.update(
                    row.connection.id,
                    UpdateConnection {
                        name: "Changed".into(),
                        credential: CredentialUpdate::Remember {
                            key: "replacement-key".into()
                        }
                    }
                )
                .await
                .is_err()
            );
            let (current, key) = host.resolve(row.connection.id).await.unwrap();
            assert_eq!(current.name, row.connection.name);
            assert_eq!(current.credential_mode, mode);
            assert_eq!(key.as_deref(), Some("previous-key"));
            assert!(host.remove(row.connection.id).await.is_err());
            assert_eq!(
                host.resolve(row.connection.id).await.unwrap().1.as_deref(),
                Some("previous-key")
            );
        }
    }
    #[test]
    fn endpoint_validation_rejects_embedded_secrets_and_non_http_schemes() {
        for endpoint in [
            "file:///tmp/test",
            "http://user:secret@localhost/v1",
            "https://localhost/v1?key=secret",
            "https://localhost/#secret",
        ] {
            assert!(validate_endpoint(Provider::Custom, Some(endpoint)).is_err());
        }
        assert!(validate_endpoint(Provider::Custom, Some("http://localhost:1234/v1")).is_ok());
        assert!(validate_endpoint(Provider::Openai, Some("https://localhost")).is_err());
    }
}
