//! Gateway-only identities and sessions. Provider keys never enter this database.
use crate::{Result, config::Config};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Redirect, Response},
};
use openidconnect::{
    AccessTokenHash, AuthorizationCode, ClientId, ClientSecret, CsrfToken, EndpointMaybeSet,
    EndpointNotSet, EndpointSet, IssuerUrl, Nonce, OAuth2TokenResponse, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenResponse,
    core::{CoreAuthenticationFlow, CoreClient, CoreJsonWebKeySet, CoreProviderMetadata},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;
use wordflow_backend::Error;

type Client = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;
const SESSION_SECONDS: i64 = 24 * 60 * 60;
#[derive(Clone, Serialize, utoipa::ToSchema)]
pub struct Account {
    pub id: String,
    pub name: Option<String>,
    pub browser_credentials: bool,
}
struct Login {
    provider: String,
    nonce: Nonce,
    verifier: PkceCodeVerifier,
    binding: Vec<u8>,
    expires: Instant,
}
struct Provider {
    client: Client,
    metadata: CoreProviderMetadata,
    id: ClientId,
    secret: ClientSecret,
    redirect: RedirectUrl,
}
impl Provider {
    fn new(
        metadata: CoreProviderMetadata,
        id: ClientId,
        secret: ClientSecret,
        redirect: RedirectUrl,
    ) -> Self {
        let client =
            CoreClient::from_provider_metadata(metadata.clone(), id.clone(), Some(secret.clone()))
                .set_redirect_uri(redirect.clone());
        Self {
            client,
            metadata,
            id,
            secret,
            redirect,
        }
    }
}
struct Inner {
    database: Arc<Mutex<Connection>>,
    providers: BTreeMap<String, Provider>,
    transactions: AsyncMutex<BTreeMap<String, Login>>,
    sessions_changed: tokio::sync::watch::Sender<u64>,
    http: openidconnect::reqwest::Client,
    origin: String,
    public_url: String,
    path: String,
}
#[derive(Clone)]
pub struct Auth(Arc<Inner>);
fn denied() -> Error {
    Error::new("authentication_required", "Sign in to continue")
}
fn login_failed() -> Error {
    Error::new(
        "login_failed",
        "Sign-in could not be verified. Start a new sign-in.",
    )
}
fn database_error(_: rusqlite::Error) -> Error {
    Error::new(
        "authentication_store_failed",
        "Authentication storage failed",
    )
}
fn now() -> Result<i64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| login_failed())?
        .as_secs() as i64)
}
fn hash(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}
fn random() -> String {
    CsrfToken::new_random().secret().to_owned()
}
fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|v| {
            v.trim()
                .split_once('=')
                .filter(|(key, _)| *key == name)
                .map(|(_, value)| value.to_owned())
        })
}
impl Auth {
    pub async fn new(config: &Config) -> Result<Self> {
        let public_url = config
            .public_url
            .as_ref()
            .ok_or_else(|| Error::invalid("Multi-user mode requires WORDFLOW_PUBLIC_URL"))?;
        let public =
            reqwest::Url::parse(public_url).map_err(|_| Error::invalid("Invalid public URL"))?;
        let path = config.base_path()?;
        if public.scheme() != "https"
            || public.host_str().is_none()
            || !public.username().is_empty()
            || public.password().is_some()
            || public.query().is_some()
            || public.fragment().is_some()
            || public.path() != path
        {
            return Err(Error::invalid(
                "Public URL must be HTTPS and its path must match the deployment base path",
            ));
        }
        let http = openidconnect::reqwest::Client::builder()
            .redirect(openidconnect::reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| login_failed())?;
        let mut providers = BTreeMap::new();
        for (name, issuer, prefix) in [
            ("google", "https://accounts.google.com", "WORDFLOW_GOOGLE"),
            ("cilogon", "https://cilogon.org", "WORDFLOW_CILOGON"),
        ] {
            let id = std::env::var(format!("{prefix}_CLIENT_ID"))
                .map_err(|_| Error::invalid(format!("Missing {prefix}_CLIENT_ID")))?;
            let secret = std::env::var(format!("{prefix}_CLIENT_SECRET"))
                .map_err(|_| Error::invalid(format!("Missing {prefix}_CLIENT_SECRET")))?;
            if id.is_empty() || secret.is_empty() {
                return Err(Error::invalid(
                    "Both OIDC providers need nonempty client credentials",
                ));
            }
            let metadata = CoreProviderMetadata::discover_async(
                IssuerUrl::new(issuer.into()).map_err(|_| login_failed())?,
                &http,
            )
            .await
            .map_err(|_| login_failed())?;
            let client = Provider::new(
                metadata,
                ClientId::new(id),
                ClientSecret::new(secret),
                RedirectUrl::new(format!("{public_url}api/auth/{name}/callback"))
                    .map_err(|_| login_failed())?,
            );
            providers.insert(name.into(), client);
        }
        let directory = config.directory()?.join(".system");
        wordflow_storage::private_directory(&directory)?;
        let database =
            tokio::task::spawn_blocking(move || open_database(&directory.join("auth.sqlite3")))
                .await??;
        Ok(Self(Arc::new(Inner {
            database: Arc::new(Mutex::new(database)),
            providers,
            transactions: AsyncMutex::new(BTreeMap::new()),
            sessions_changed: tokio::sync::watch::channel(0).0,
            http,
            origin: public.origin().ascii_serialization(),
            public_url: public_url.clone(),
            path,
        })))
    }
    async fn database<T: Send + 'static>(
        &self,
        work: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let db = self.0.database.clone();
        tokio::task::spawn_blocking(move || {
            work(
                &mut *db
                    .lock()
                    .map_err(|_| database_error(rusqlite::Error::InvalidQuery))?,
            )
        })
        .await?
    }
    pub async fn authenticate(&self, headers: &HeaderMap) -> Result<Account> {
        self.session(headers).await.map(|(account, _)| account)
    }
    pub(crate) fn session_changes(&self) -> tokio::sync::watch::Receiver<u64> {
        self.0.sessions_changed.subscribe()
    }
    pub(crate) async fn session(&self, headers: &HeaderMap) -> Result<(Account, Duration)> {
        let token = hash(&cookie(headers, "wordflow_session").ok_or_else(denied)?);
        let time = now()?;
        let (account, expires) = self.database(move |db| db.query_row("SELECT a.id, a.name, s.expires FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?1 AND s.expires>?2", params![token,time], |row| Ok((Account { id: row.get(0)?, name: row.get(1)?, browser_credentials: true },row.get::<_,i64>(2)?))).optional().map_err(database_error)?.ok_or_else(denied)).await?;
        Ok((
            account,
            Duration::from_secs(u64::try_from(expires - time).map_err(|_| denied())?),
        ))
    }
    pub async fn mutation(&self, headers: &HeaderMap) -> Result<()> {
        if headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) != Some(&self.0.origin) {
            return Err(Error::new("origin_not_allowed", "Origin is not allowed"));
        }
        let token = hash(&cookie(headers, "wordflow_session").ok_or_else(denied)?);
        let csrf = hash(
            headers
                .get("x-wordflow-csrf")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| Error::new("csrf_rejected", "Reload this page before retrying"))?,
        );
        let time = now()?;
        self.database(move |db| {
            let expected: Option<Vec<u8>> = db
                .query_row(
                    "SELECT csrf_hash FROM sessions WHERE token_hash=?1 AND expires>?2",
                    params![token, time],
                    |row| row.get(0),
                )
                .optional()
                .map_err(database_error)?;
            if expected.as_deref() != Some(csrf.as_slice()) {
                return Err(Error::new(
                    "csrf_rejected",
                    "Reload this page before retrying",
                ));
            }
            Ok(())
        })
        .await
    }
    fn set_cookie(
        &self,
        response: &mut Response,
        name: &str,
        value: &str,
        age: i64,
        http_only: bool,
    ) -> Result<()> {
        let cookie = format!(
            "{name}={value}; Path={}; Max-Age={age}; Secure; SameSite=Lax{}",
            self.0.path,
            if http_only { "; HttpOnly" } else { "" }
        );
        response.headers_mut().append(
            header::SET_COOKIE,
            cookie.parse().map_err(|_| login_failed())?,
        );
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            "no-store".parse().map_err(|_| login_failed())?,
        );
        Ok(())
    }
    pub fn router(&self) -> axum::Router {
        axum::Router::new()
            .route("/api/account", axum::routing::get(account))
            .route("/api/auth/logout", axum::routing::post(logout))
            .route("/api/auth/{provider}/login", axum::routing::get(login))
            .route(
                "/api/auth/{provider}/callback",
                axum::routing::get(callback),
            )
            .with_state(self.clone())
    }
}
fn open_database(path: &std::path::Path) -> Result<Connection> {
    let db = Connection::open(path).map_err(database_error)?;
    db.busy_timeout(Duration::from_secs(5))
        .map_err(database_error)?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(database_error)?;
    if ![0, 1].contains(&version) {
        return Err(Error::invalid("Unsupported authentication database schema"));
    }
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, name TEXT, UNIQUE(issuer,subject)); CREATE TABLE IF NOT EXISTS sessions(token_hash BLOB PRIMARY KEY, csrf_hash BLOB NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL); PRAGMA user_version=1;").map_err(database_error)?;
    Ok(db)
}
#[utoipa::path(get,path="/api/account",operation_id="account",responses((status=200,body=Account),(status=401,body=wordflow_backend::ErrorEnvelope)))]
async fn account(State(auth): State<Auth>, headers: HeaderMap) -> Result<Json<Account>> {
    Ok(Json(auth.authenticate(&headers).await?))
}
#[utoipa::path(post,path="/api/auth/logout",operation_id="logout",responses((status=204,description="Presented session revoked"),(status=403,body=wordflow_backend::ErrorEnvelope)))]
async fn logout(State(auth): State<Auth>, headers: HeaderMap) -> Result<Response> {
    auth.mutation(&headers).await?;
    let token = hash(&cookie(&headers, "wordflow_session").ok_or_else(denied)?);
    auth.database(move |db| {
        db.execute("DELETE FROM sessions WHERE token_hash=?1", [token])
            .map_err(database_error)?;
        Ok(())
    })
    .await?;
    auth.0
        .sessions_changed
        .send_modify(|revision| *revision += 1);
    let mut response = axum::http::StatusCode::NO_CONTENT.into_response();
    auth.set_cookie(&mut response, "wordflow_session", "", 0, true)?;
    auth.set_cookie(&mut response, "wordflow_csrf", "", 0, false)?;
    Ok(response)
}
async fn login(State(auth): State<Auth>, Path(provider): Path<String>) -> Result<Response> {
    let client = &auth
        .0
        .providers
        .get(&provider)
        .ok_or_else(login_failed)?
        .client;
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, state, nonce) = client
        .authorize_url(
            CoreAuthenticationFlow::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("email".into()))
        .add_scope(Scope::new("profile".into()))
        .set_pkce_challenge(challenge)
        .url();
    let binding = random();
    let key = state.secret().clone();
    let mut transactions = auth.0.transactions.lock().await;
    transactions.retain(|_, login| login.expires > Instant::now());
    if transactions.len() >= 1024 {
        return Err(Error::new("login_busy", "Try signing in again shortly"));
    }
    transactions.insert(
        key.clone(),
        Login {
            provider,
            verifier,
            nonce,
            binding: hash(&binding),
            expires: Instant::now() + Duration::from_secs(600),
        },
    );
    let mut response = Redirect::to(url.as_str()).into_response();
    auth.set_cookie(
        &mut response,
        &format!("wordflow_login_{key}"),
        &binding,
        600,
        true,
    )?;
    Ok(response)
}
#[derive(Deserialize)]
struct Callback {
    state: String,
    code: Option<String>,
}
async fn callback(
    State(auth): State<Auth>,
    Path(provider): Path<String>,
    Query(query): Query<Callback>,
    headers: HeaderMap,
) -> Result<Response> {
    // Consume before contacting the provider; invalid and replayed callbacks cannot retry this transaction.
    let login = auth
        .0
        .transactions
        .lock()
        .await
        .remove(&query.state)
        .ok_or_else(login_failed)?;
    if login.provider != provider
        || login.expires <= Instant::now()
        || cookie(&headers, &format!("wordflow_login_{}", query.state)).map(|v| hash(&v))
            != Some(login.binding)
    {
        return Err(login_failed());
    }
    let configured = auth.0.providers.get(&provider).ok_or_else(login_failed)?;
    let token = configured
        .client
        .exchange_code(AuthorizationCode::new(query.code.ok_or_else(login_failed)?))
        .map_err(|_| login_failed())?
        .set_pkce_verifier(login.verifier)
        .request_async(&auth.0.http)
        .await
        .map_err(|_| login_failed())?;
    let id_token = token.id_token().ok_or_else(login_failed)?;
    // Fetch the provider's current keys for each completed login so rotation needs no gateway restart.
    let keys = CoreJsonWebKeySet::fetch_async(configured.metadata.jwks_uri(), &auth.0.http)
        .await
        .map_err(|_| login_failed())?;
    let client = CoreClient::from_provider_metadata(
        configured.metadata.clone().set_jwks(keys),
        configured.id.clone(),
        Some(configured.secret.clone()),
    )
    .set_redirect_uri(configured.redirect.clone());
    let verifier = client.id_token_verifier();
    let claims = id_token
        .claims(&verifier, &login.nonce)
        .map_err(|_| login_failed())?;
    if let Some(expected) = claims.access_token_hash() {
        let actual = AccessTokenHash::from_token(
            token.access_token(),
            id_token.signing_alg().map_err(|_| login_failed())?,
            id_token
                .signing_key(&verifier)
                .map_err(|_| login_failed())?,
        )
        .map_err(|_| login_failed())?;
        if &actual != expected {
            return Err(login_failed());
        }
    }
    let issuer = claims.issuer().as_str().to_owned();
    let subject = claims.subject().as_str().to_owned();
    let name = claims
        .name()
        .and_then(|name| name.get(None))
        .map(|name| name.as_str().to_owned());
    let session = random();
    let csrf = random();
    let session_hash = hash(&session);
    let csrf_hash = hash(&csrf);
    let time = now()?;
    auth.database(move |db| {
        let transaction = db.transaction().map_err(database_error)?;
        let id: Option<String> = transaction.query_row("SELECT id FROM accounts WHERE issuer=?1 AND subject=?2", params![issuer,subject], |row| row.get(0)).optional().map_err(database_error)?;
        let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
        transaction.execute("INSERT INTO accounts(id,issuer,subject,name) VALUES(?1,?2,?3,?4) ON CONFLICT(issuer,subject) DO UPDATE SET name=excluded.name", params![id,issuer,subject,name]).map_err(database_error)?;
        transaction.execute("DELETE FROM sessions WHERE expires<=?1", [time]).map_err(database_error)?;
        transaction.execute("INSERT INTO sessions(token_hash,csrf_hash,account_id,expires) VALUES(?1,?2,?3,?4)", params![session_hash,csrf_hash,id,time+SESSION_SECONDS]).map_err(database_error)?;
        transaction.commit().map_err(database_error)?; Ok(())
    }).await?;
    let mut response = Redirect::to(&auth.0.public_url).into_response();
    auth.set_cookie(
        &mut response,
        "wordflow_session",
        &session,
        SESSION_SECONDS,
        true,
    )?;
    auth.set_cookie(
        &mut response,
        "wordflow_csrf",
        &csrf,
        SESSION_SECONDS,
        false,
    )?;
    auth.set_cookie(
        &mut response,
        &format!("wordflow_login_{}", query.state),
        "",
        0,
        true,
    )?;
    Ok(response)
}

pub fn contract() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(paths(account, logout))]
    struct Contract;
    <Contract as utoipa::OpenApi>::openapi()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::post,
    };
    use chrono::Utc;
    use openidconnect::{
        AccessToken, Audience, EmptyAdditionalClaims, PrivateSigningKey, StandardClaims,
        SubjectIdentifier,
        core::{
            CoreIdToken, CoreIdTokenClaims, CoreJsonWebKeySet, CoreJwsSigningAlgorithm,
            CoreRsaPrivateSigningKey,
        },
    };
    use rsa::pkcs1::EncodeRsaPrivateKey;
    use std::time::{Duration, Instant};
    use tower::ServiceExt;
    struct ProviderFixture {
        response: Mutex<serde_json::Value>,
        key: CoreRsaPrivateSigningKey,
        keys: Mutex<CoreJsonWebKeySet>,
    }
    #[derive(Clone, Copy)]
    enum InvalidToken {
        Nonce,
        Issuer,
        Audience,
        Expired,
        Signature,
        Rotated,
    }
    fn signing_key() -> CoreRsaPrivateSigningKey {
        let key = rsa::RsaPrivateKey::new(&mut rand08::rngs::OsRng, 2048)
            .unwrap()
            .to_pkcs1_pem(rsa::pkcs1::LineEnding::LF)
            .unwrap();
        CoreRsaPrivateSigningKey::from_pem(&key, None).unwrap()
    }
    async fn fixture() -> (
        tempfile::TempDir,
        Auth,
        Arc<ProviderFixture>,
        tokio::task::JoinHandle<()>,
    ) {
        // Ephemeral cryptographic fixtures exist only in memory and are never committed or logged.
        let key = signing_key();
        let keys = CoreJsonWebKeySet::new(vec![key.as_verification_key()]);
        let fixture = Arc::new(ProviderFixture {
            response: Mutex::new(serde_json::json!({})),
            key,
            keys: Mutex::new(keys),
        });
        let payload = fixture.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let key_payload = fixture.clone();
        let app = axum::Router::new()
            .route(
                "/token",
                post(move |body: String| {
                    let payload = payload.clone();
                    async move {
                        assert!(body.contains("code_verifier="));
                        Json(payload.response.lock().unwrap().clone())
                    }
                }),
            )
            .route(
                "/keys",
                axum::routing::get(move || {
                    let payload = key_payload.clone();
                    async move { Json(payload.keys.lock().unwrap().clone()) }
                }),
            );
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let mut providers = BTreeMap::new();
        for (name, issuer) in [
            ("google", "https://accounts.google.com"),
            ("cilogon", "https://cilogon.org"),
        ] {
            let metadata:CoreProviderMetadata=serde_json::from_value(serde_json::json!({"issuer":issuer,"authorization_endpoint":format!("{issuer}/authorize"),"token_endpoint":format!("{endpoint}/token"),"jwks_uri":format!("{endpoint}/keys"),"response_types_supported":["code"],"subject_types_supported":["public"],"id_token_signing_alg_values_supported":["RS256"]})).unwrap();
            let client = Provider::new(
                metadata.set_jwks(CoreJsonWebKeySet::new(vec![
                    fixture.key.as_verification_key(),
                ])),
                ClientId::new("test-client".into()),
                ClientSecret::new("test-secret".into()),
                RedirectUrl::new(format!(
                    "https://wordflow.example/prefix/api/auth/{name}/callback"
                ))
                .unwrap(),
            );
            providers.insert(name.into(), client);
        }
        let dir = tempfile::tempdir().unwrap();
        let auth = Auth(Arc::new(Inner {
            database: Arc::new(Mutex::new(
                open_database(&dir.path().join("auth.sqlite3")).unwrap(),
            )),
            providers,
            transactions: AsyncMutex::new(BTreeMap::new()),
            sessions_changed: tokio::sync::watch::channel(0).0,
            http: openidconnect::reqwest::Client::builder()
                .redirect(openidconnect::reqwest::redirect::Policy::none())
                .build()
                .unwrap(),
            origin: "https://wordflow.example".into(),
            public_url: "https://wordflow.example/prefix/".into(),
            path: "/prefix/".into(),
        }));
        (dir, auth, fixture, task)
    }
    fn headers(response: &Response) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let cookies = response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .map(|v| v.to_str().unwrap().split(';').next().unwrap())
            .collect::<Vec<_>>()
            .join("; ");
        headers.insert(header::COOKIE, cookies.parse().unwrap());
        headers
    }
    async fn signed_callback(
        auth: &Auth,
        provider: &str,
        fixture: &ProviderFixture,
        subject: &str,
        invalid: Option<InvalidToken>,
    ) -> (Response, HeaderMap, String) {
        let response = auth
            .router()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/auth/{provider}/login"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        let login_headers = headers(&response);
        let url =
            reqwest::Url::parse(response.headers()[header::LOCATION].to_str().unwrap()).unwrap();
        let query: BTreeMap<_, _> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(query["code_challenge_method"], "S256");
        let nonce = if matches!(invalid, Some(InvalidToken::Nonce)) {
            "wrong"
        } else {
            &query["nonce"]
        };
        let issuer = if matches!(invalid, Some(InvalidToken::Issuer)) {
            "https://untrusted.example"
        } else if provider == "google" {
            "https://accounts.google.com"
        } else {
            "https://cilogon.org"
        };
        let claims = CoreIdTokenClaims::new(
            IssuerUrl::new(issuer.into()).unwrap(),
            vec![Audience::new(
                if matches!(invalid, Some(InvalidToken::Audience)) {
                    "another-client".into()
                } else {
                    "test-client".into()
                },
            )],
            Utc::now()
                + chrono::Duration::minutes(if matches!(invalid, Some(InvalidToken::Expired)) {
                    -5
                } else {
                    5
                }),
            Utc::now(),
            StandardClaims::new(SubjectIdentifier::new(subject.into())),
            EmptyAdditionalClaims {},
        )
        .set_nonce(Some(Nonce::new(nonce.into())));
        let untrusted_key = matches!(
            invalid,
            Some(InvalidToken::Signature | InvalidToken::Rotated)
        )
        .then(signing_key);
        if matches!(invalid, Some(InvalidToken::Rotated)) {
            *fixture.keys.lock().unwrap() =
                CoreJsonWebKeySet::new(vec![untrusted_key.as_ref().unwrap().as_verification_key()]);
        }
        let token = CoreIdToken::new(
            claims,
            untrusted_key.as_ref().unwrap_or(&fixture.key),
            CoreJwsSigningAlgorithm::RsaSsaPkcs1V15Sha256,
            Some(&AccessToken::new("test-access".into())),
            None,
        )
        .unwrap();
        *fixture.response.lock().unwrap() = serde_json::json!({"access_token":"test-access","token_type":"Bearer","id_token":token.to_string()});
        let path = format!(
            "/api/auth/{provider}/callback?code=accepted&state={}",
            query["state"]
        );
        let mut request = Request::builder().uri(&path).body(Body::empty()).unwrap();
        *request.headers_mut() = login_headers.clone();
        let response = auth.router().oneshot(request).await.unwrap();
        (response, login_headers, path)
    }
    #[tokio::test]
    async fn both_providers_verify_pkce_nonce_and_partition_same_subject_without_optional_names() {
        let (_dir, auth, fixture, task) = fixture().await;
        let (google, _, _) = signed_callback(&auth, "google", &fixture, "same-subject", None).await;
        let (cilogon, _, _) =
            signed_callback(&auth, "cilogon", &fixture, "same-subject", None).await;
        assert_eq!(google.status(), StatusCode::SEE_OTHER);
        assert_eq!(cilogon.status(), StatusCode::SEE_OTHER);
        let a = auth.authenticate(&headers(&google)).await.unwrap();
        let b = auth.authenticate(&headers(&cilogon)).await.unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(b.name, None);
        let (again, _, _) = signed_callback(&auth, "google", &fixture, "same-subject", None).await;
        assert_eq!(auth.authenticate(&headers(&again)).await.unwrap().id, a.id);
        assert!(
            google
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .all(|v| v.to_str().unwrap().contains("Secure"))
        );
        task.abort();
    }
    #[tokio::test]
    async fn invalid_and_replayed_callbacks_csrf_logout_and_absolute_expiry_are_rejected() {
        let (_dir, auth, fixture, task) = fixture().await;
        let (invalid, _, _) = signed_callback(
            &auth,
            "google",
            &fixture,
            "invalid",
            Some(InvalidToken::Nonce),
        )
        .await;
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
        let (response, login_headers, path) =
            signed_callback(&auth, "google", &fixture, "valid", None).await;
        let mut replay = Request::builder().uri(path).body(Body::empty()).unwrap();
        *replay.headers_mut() = login_headers;
        assert_eq!(
            auth.router().oneshot(replay).await.unwrap().status(),
            StatusCode::BAD_REQUEST
        );
        let mut session = headers(&response);
        session.insert(header::ORIGIN, "https://wordflow.example".parse().unwrap());
        assert_eq!(
            auth.mutation(&session).await.unwrap_err().code,
            "csrf_rejected"
        );
        let csrf = cookie(&session, "wordflow_csrf").unwrap();
        session.insert("x-wordflow-csrf", csrf.parse().unwrap());
        auth.mutation(&session).await.unwrap();
        let mut wrong_origin = session.clone();
        wrong_origin.insert(header::ORIGIN, "https://other.example".parse().unwrap());
        assert_eq!(
            auth.mutation(&wrong_origin).await.unwrap_err().code,
            "origin_not_allowed"
        );
        let mut missing_origin = session.clone();
        missing_origin.remove(header::ORIGIN);
        assert!(auth.mutation(&missing_origin).await.is_err());
        let (other, _, _) = signed_callback(&auth, "google", &fixture, "valid", None).await;
        assert_eq!(
            logout(State(auth.clone()), session.clone())
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        assert!(auth.authenticate(&session).await.is_err());
        assert!(auth.authenticate(&headers(&other)).await.is_ok());
        auth.database(|db| {
            db.execute("UPDATE sessions SET expires=0", []).unwrap();
            Ok(())
        })
        .await
        .unwrap();
        assert!(auth.authenticate(&headers(&other)).await.is_err());
        let db = auth.0.database.lock().unwrap();
        let stored: Vec<u8> = db
            .query_row("SELECT token_hash FROM sessions LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(stored.len(), 32);
        task.abort();
    }
    #[tokio::test]
    async fn untrusted_issuer_audience_signature_and_expired_tokens_cannot_create_accounts() {
        let (_dir, auth, fixture, task) = fixture().await;
        for provider in ["google", "cilogon"] {
            for invalid in [
                InvalidToken::Issuer,
                InvalidToken::Audience,
                InvalidToken::Expired,
                InvalidToken::Signature,
            ] {
                let (response, _, _) =
                    signed_callback(&auth, provider, &fixture, "untrusted", Some(invalid)).await;
                assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            }
        }
        let count: i64 = auth
            .0
            .database
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM accounts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        task.abort();
    }
    #[tokio::test]
    async fn both_providers_accept_verified_key_rotation_without_gateway_restart() {
        let (_dir, auth, fixture, task) = fixture().await;
        for provider in ["google", "cilogon"] {
            let (response, _, _) = signed_callback(
                &auth,
                provider,
                &fixture,
                "rotated",
                Some(InvalidToken::Rotated),
            )
            .await;
            assert_eq!(response.status(), StatusCode::SEE_OTHER);
            assert!(auth.authenticate(&headers(&response)).await.is_ok());
        }
        task.abort();
    }
    #[tokio::test]
    async fn authenticated_streams_stop_on_revocation_and_expiry_but_other_devices_remain_connected()
     {
        use futures_util::{StreamExt, stream};
        let (_dir, auth, fixture, task) = fixture().await;
        let (first, _, _) = signed_callback(&auth, "google", &fixture, "stream-user", None).await;
        let (second, _, _) = signed_callback(&auth, "google", &fixture, "stream-user", None).await;
        let mut first_headers = headers(&first);
        let second_headers = headers(&second);
        let events =
            || stream::once(async { Ok::<_, std::io::Error>("event") }).chain(stream::pending());
        let first_stream = crate::workers::session_stream(
            auth.clone(),
            first_headers.clone(),
            auth.session(&first_headers).await.unwrap().1,
            auth.session_changes(),
            events(),
        );
        let second_stream = crate::workers::session_stream(
            auth.clone(),
            second_headers.clone(),
            auth.session(&second_headers).await.unwrap().1,
            auth.session_changes(),
            events(),
        );
        futures_util::pin_mut!(first_stream, second_stream);
        assert_eq!(first_stream.next().await.unwrap().unwrap(), "event");
        assert_eq!(second_stream.next().await.unwrap().unwrap(), "event");
        first_headers.insert(header::ORIGIN, "https://wordflow.example".parse().unwrap());
        first_headers.insert(
            "x-wordflow-csrf",
            cookie(&first_headers, "wordflow_csrf")
                .unwrap()
                .parse()
                .unwrap(),
        );
        logout(State(auth.clone()), first_headers).await.unwrap();
        assert!(
            tokio::time::timeout(Duration::from_secs(1), first_stream.next())
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(20), second_stream.next())
                .await
                .is_err()
        );
        let expired = crate::workers::session_stream(
            auth.clone(),
            second_headers,
            Duration::ZERO,
            auth.session_changes(),
            events(),
        );
        futures_util::pin_mut!(expired);
        assert!(expired.next().await.is_none());
        task.abort();
    }
    #[tokio::test]
    async fn expired_or_unbound_login_transactions_cannot_provision_accounts() {
        let (_dir, auth, _fixture, task) = fixture().await;
        for expired in [false, true] {
            let response = auth
                .router()
                .oneshot(
                    Request::builder()
                        .uri("/api/auth/cilogon/login")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            let url = reqwest::Url::parse(response.headers()[header::LOCATION].to_str().unwrap())
                .unwrap();
            let state = url
                .query_pairs()
                .find(|(key, _)| key == "state")
                .unwrap()
                .1
                .into_owned();
            if expired {
                auth.0
                    .transactions
                    .lock()
                    .await
                    .get_mut(&state)
                    .unwrap()
                    .expires = Instant::now() - Duration::from_secs(1);
            }
            let mut request = Request::builder()
                .uri(format!(
                    "/api/auth/cilogon/callback?state={state}&code=unused"
                ))
                .body(Body::empty())
                .unwrap();
            if expired {
                *request.headers_mut() = headers(&response);
            }
            assert_eq!(
                auth.router().oneshot(request).await.unwrap().status(),
                StatusCode::BAD_REQUEST
            );
            assert!(!auth.0.transactions.lock().await.contains_key(&state));
        }
        let count: i64 = auth
            .0
            .database
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM accounts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        task.abort();
    }
}
