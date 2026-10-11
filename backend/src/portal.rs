//! Host-owned Portal credentials. Reads return metadata, never credential bytes.
use crate::{
    Error,
    ai::{
        CredentialMode, CredentialUpdate,
        credentials::{OsSecrets, Secrets},
    },
    error::Result,
};
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Metadata {
    mode: CredentialMode,
}
impl Default for Metadata {
    fn default() -> Self {
        Self {
            mode: CredentialMode::None,
        }
    }
}
#[derive(Serialize, utoipa::ToSchema)]
pub struct PortalInfo {
    pub credential_mode: CredentialMode,
    pub has_credential: bool,
    pub credential_error: Option<String>,
}
struct Host {
    path: Option<PathBuf>,
    secrets: Arc<dyn Secrets>,
    browser_owned: bool,
    state: Mutex<Option<(Metadata, Option<String>)>>,
}
#[derive(Clone)]
pub struct PortalConfiguration(Arc<Host>);
impl PortalConfiguration {
    pub fn new(identity: &str, path: PathBuf) -> Self {
        Self::configured(
            Some(path),
            Arc::new(OsSecrets {
                namespace: format!("{identity}.portal"),
            }),
            false,
        )
    }
    pub fn browser_owned(path: PathBuf) -> Self {
        Self::configured(Some(path), Arc::new(crate::ai::Unavailable), true)
    }
    pub fn session_only() -> Self {
        Self::configured(None, Arc::new(crate::ai::Unavailable), false)
    }
    fn configured(path: Option<PathBuf>, secrets: Arc<dyn Secrets>, browser_owned: bool) -> Self {
        Self(Arc::new(Host {
            path,
            secrets,
            browser_owned,
            state: Mutex::new(None),
        }))
    }
    async fn access<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Host, &mut Metadata, &mut Option<String>) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let host = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = host
                .state
                .lock()
                .map_err(|_| Error::new("worker_failed", "Portal configuration lock failed"))?;
            if state.is_none() {
                let metadata = match &host.path {
                    Some(path) => match std::fs::read(path) {
                        Ok(bytes) => serde_json::from_slice(&bytes)?,
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Metadata::default(),
                        Err(e) => return Err(e.into()),
                    },
                    None => Metadata::default(),
                };
                *state = Some((metadata, None));
            }
            let (metadata, session) = state
                .as_mut()
                .ok_or_else(|| Error::new("worker_failed", "Portal configuration unavailable"))?;
            work(&host, metadata, session)
        })
        .await?
    }
    pub async fn info(&self) -> Result<PortalInfo> {
        self.access(|host, metadata, session| {
            let credential = match metadata.mode {
                CredentialMode::Session => Ok(session.clone()),
                CredentialMode::Remembered if !host.browser_owned => host.secrets.get("token"),
                _ => Ok(None),
            };
            Ok(PortalInfo {
                credential_mode: metadata.mode,
                has_credential: credential.as_ref().is_ok_and(|v| v.is_some()),
                credential_error: credential.err().map(|e| e.message),
            })
        })
        .await
    }
    pub async fn update(&self, update: CredentialUpdate) -> Result<PortalInfo> {
        self.access(move |host, metadata, session| {
            let mode = match &update {
                CredentialUpdate::Keep => return Ok(()),
                CredentialUpdate::Browser if host.browser_owned => CredentialMode::Browser,
                CredentialUpdate::Session { key } if !host.browser_owned => {
                    crate::ai::validate_key(key)?;
                    CredentialMode::Session
                }
                CredentialUpdate::Remember { key } if !host.browser_owned => {
                    crate::ai::validate_key(key)?;
                    CredentialMode::Remembered
                }
                CredentialUpdate::Remove => CredentialMode::None,
                _ => {
                    return Err(Error::invalid(
                        "This credential storage choice is unavailable on this host",
                    ));
                }
            };
            // Remembered keys are changed through the same redacting OS adapter as AI keys.
            let previous = if metadata.mode == CredentialMode::Remembered {
                host.secrets.get("token")?
            } else {
                None
            };
            match &update {
                CredentialUpdate::Remember { key } => host.secrets.set("token", key)?,
                _ if metadata.mode == CredentialMode::Remembered => host.secrets.remove("token")?,
                _ => {}
            }
            // Session-only tokens disappear at shutdown, so they have no durable configured status.
            let durable = Metadata {
                mode: if mode == CredentialMode::Session {
                    CredentialMode::None
                } else {
                    mode
                },
            };
            if let Some(path) = &host.path
                && let Err(error) = wordflow_storage::write_json(path, &durable)
            {
                if let Some(key) = previous {
                    host.secrets.set("token", &key)?;
                } else if mode == CredentialMode::Remembered {
                    host.secrets.remove("token")?;
                }
                return Err(error.into());
            }
            *session = match update {
                CredentialUpdate::Session { key } => Some(key),
                _ => None,
            };
            metadata.mode = mode;
            Ok(())
        })
        .await?;
        self.info().await
    }
    pub async fn resolve(
        &self,
        explicit: Option<&str>,
        headers: &axum::http::HeaderMap,
    ) -> Result<Option<String>> {
        if let Some(token) = explicit {
            crate::ai::validate_key(token)?;
            return Ok(Some(token.to_owned()));
        }
        if let Some(token) = headers.get("x-wordflow-portal-token") {
            let token = token
                .to_str()
                .map_err(|_| Error::invalid("Invalid Portal token"))?;
            crate::ai::validate_key(token)?;
            return Ok(Some(token.to_owned()));
        }
        self.access(|host, metadata, session| match metadata.mode {
            CredentialMode::Session if !host.browser_owned => Ok(session.clone()),
            CredentialMode::Remembered if !host.browser_owned => host.secrets.get("token"),
            _ => Ok(None),
        })
        .await
    }
    pub fn router(&self) -> axum::Router {
        contract().split_for_parts().0.with_state(self.clone())
    }
}
pub(crate) fn contract() -> utoipa_axum::router::OpenApiRouter<PortalConfiguration> {
    utoipa_axum::router::OpenApiRouter::new().routes(utoipa_axum::routes!(get, update))
}
#[utoipa::path(get, path = "/api/portal/credential", operation_id = "portal_credential_get", tag = "settings", responses((status = 200, body = PortalInfo), (status = 400, body = crate::ErrorEnvelope)))]
async fn get(State(portal): State<PortalConfiguration>) -> Result<Json<PortalInfo>> {
    Ok(Json(portal.info().await?))
}
#[utoipa::path(post, path = "/api/portal/credential", operation_id = "portal_credential_update", tag = "settings", request_body = CredentialUpdate, responses((status = 200, body = PortalInfo), (status = 400, body = crate::ErrorEnvelope)))]
async fn update(
    State(portal): State<PortalConfiguration>,
    input: std::result::Result<Json<CredentialUpdate>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<PortalInfo>> {
    Ok(Json(
        portal
            .update(
                input
                    .map_err(|_| Error::invalid("Invalid Portal credential update"))?
                    .0,
            )
            .await?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;
    use std::collections::BTreeMap;
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
    #[tokio::test]
    async fn session_lifetime_metadata_redaction_and_operation_precedence() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("portal.json");
        let secrets = Arc::<MemorySecrets>::default();
        let host = PortalConfiguration::configured(Some(path.clone()), secrets.clone(), false);
        host.update(CredentialUpdate::Session {
            key: "synthetic-session".into(),
        })
        .await
        .unwrap();
        assert_eq!(
            host.resolve(None, &HeaderMap::new())
                .await
                .unwrap()
                .as_deref(),
            Some("synthetic-session")
        );
        assert!(
            !serde_json::to_string(&host.info().await.unwrap())
                .unwrap()
                .contains("synthetic-session")
        );
        assert!(
            !std::fs::read_to_string(&path)
                .unwrap()
                .contains("synthetic-session")
        );
        let restarted = PortalConfiguration::configured(Some(path.clone()), secrets, false);
        assert!(!restarted.info().await.unwrap().has_credential);
        let headers = HeaderMap::from_iter([(
            "x-wordflow-portal-token".parse().unwrap(),
            "synthetic-header".parse().unwrap(),
        )]);
        assert_eq!(
            host.resolve(None, &headers).await.unwrap().as_deref(),
            Some("synthetic-header")
        );
        assert_eq!(
            host.resolve(Some("synthetic-body"), &headers)
                .await
                .unwrap()
                .as_deref(),
            Some("synthetic-body")
        );
        host.update(CredentialUpdate::Remove).await.unwrap();
        assert_eq!(host.resolve(None, &HeaderMap::new()).await.unwrap(), None);
    }
    #[tokio::test]
    async fn remembered_replacement_removal_and_metadata_failure_rollback() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("portal.json");
        let secrets = Arc::<MemorySecrets>::default();
        let host = PortalConfiguration::configured(Some(path.clone()), secrets.clone(), false);
        host.update(CredentialUpdate::Remember {
            key: "synthetic-one".into(),
        })
        .await
        .unwrap();
        host.update(CredentialUpdate::Remember {
            key: "synthetic-two".into(),
        })
        .await
        .unwrap();
        assert_eq!(
            host.resolve(None, &HeaderMap::new())
                .await
                .unwrap()
                .as_deref(),
            Some("synthetic-two")
        );
        assert!(
            !std::fs::read_to_string(&path)
                .unwrap()
                .contains("synthetic")
        );
        std::fs::remove_file(&path).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(
            host.update(CredentialUpdate::Remember {
                key: "synthetic-failed".into()
            })
            .await
            .is_err()
        );
        assert_eq!(
            secrets.get("token").unwrap().as_deref(),
            Some("synthetic-two")
        );
        std::fs::remove_dir(&path).unwrap();
        host.update(CredentialUpdate::Remove).await.unwrap();
        assert_eq!(secrets.get("token").unwrap(), None);
    }
    #[tokio::test]
    async fn workers_accept_only_metadata_and_never_retain_operation_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let alice = PortalConfiguration::browser_owned(dir.path().join("alice.json"));
        let bob = PortalConfiguration::browser_owned(dir.path().join("bob.json"));
        assert!(
            alice
                .update(CredentialUpdate::Remember {
                    key: "synthetic-rejected".into()
                })
                .await
                .is_err()
        );
        alice.update(CredentialUpdate::Browser).await.unwrap();
        let headers = HeaderMap::from_iter([(
            "x-wordflow-portal-token".parse().unwrap(),
            "synthetic-alice".parse().unwrap(),
        )]);
        assert_eq!(
            alice.resolve(None, &headers).await.unwrap().as_deref(),
            Some("synthetic-alice")
        );
        assert_eq!(alice.resolve(None, &HeaderMap::new()).await.unwrap(), None);
        assert_eq!(bob.resolve(None, &HeaderMap::new()).await.unwrap(), None);
        assert!(
            !std::fs::read_to_string(dir.path().join("alice.json"))
                .unwrap()
                .contains("synthetic")
        );
    }
    #[tokio::test]
    async fn unavailable_store_does_not_fall_back_or_persist_a_secret() {
        let host = PortalConfiguration::session_only();
        let error = host
            .update(CredentialUpdate::Remember {
                key: "synthetic-secret".into(),
            })
            .await
            .err()
            .unwrap();
        assert!(!error.message.contains("synthetic-secret"));
        assert_eq!(host.resolve(None, &HeaderMap::new()).await.unwrap(), None);
    }
}
