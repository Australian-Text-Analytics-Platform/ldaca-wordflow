//! One rootless container per immutable account ID. Docker is gateway-only infrastructure.
use crate::{Result, config::Config};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{Stream, StreamExt};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::{process::Command, sync::Mutex};
use uuid::Uuid;
use wordflow_backend::Error;

#[derive(Clone)]
pub struct Workers(Arc<Inner>);
struct Inner {
    root: PathBuf,
    image: String,
    image_config: Value,
    identity: String,
    base: String,
    origin: String,
    namespace: String,
    limits: Limits,
    running: Mutex<BTreeMap<Uuid, Arc<tokio::sync::OnceCell<()>>>>,
    stopping: AtomicBool,
    admission: Mutex<()>,
}
#[derive(Clone)]
struct Limits {
    cpus: u64,
    memory: u64,
    pids: u64,
    active: usize,
}
/// Keep the safely resolved socket inode alive for every connection made by this client.
#[derive(Clone)]
pub struct WorkerClient {
    client: reqwest::Client,
    #[cfg(target_os = "linux")]
    _socket: Arc<std::fs::File>,
}
impl std::ops::Deref for WorkerClient {
    type Target = reqwest::Client;
    fn deref(&self) -> &Self::Target {
        &self.client
    }
}
#[cfg(target_os = "linux")]
fn connect_worker(root: &Path) -> Result<WorkerClient> {
    use rustix::fs::{Mode, OFlags, ResolveFlags, open, openat2};
    use std::os::{fd::AsRawFd, unix::fs::FileTypeExt};
    let directory = open(
        root,
        OFlags::PATH | OFlags::DIRECTORY | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    )
    .map_err(|_| failure("Cannot open the worker storage root"))?;
    let socket = openat2(
        directory,
        "local/runtime/api.sock",
        OFlags::PATH | OFlags::CLOEXEC,
        Mode::empty(),
        ResolveFlags::BENEATH | ResolveFlags::NO_SYMLINKS | ResolveFlags::NO_MAGICLINKS,
    )
    .map_err(|_| failure("Worker socket must remain inside its user root without symlinks"))?;
    let socket = Arc::new(std::fs::File::from(socket));
    if !socket.metadata()?.file_type().is_socket() {
        return Err(failure("Invalid worker socket"));
    }
    // The pinned inode closes the check/connect race, including renames after openat2.
    let client = reqwest::Client::builder()
        .unix_socket(format!("/proc/self/fd/{}", socket.as_raw_fd()))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| failure("Could not connect to the worker socket"))?;
    Ok(WorkerClient {
        client,
        _socket: socket,
    })
}
#[cfg(not(target_os = "linux"))]
fn connect_worker(_: &Path) -> Result<WorkerClient> {
    Err(failure("Multi-user workers require Linux"))
}
fn failure(message: &str) -> Error {
    Error::new("worker_unavailable", message)
}
async fn docker(args: &[String]) -> Result<String> {
    let result = Command::new("docker").args(args).output().await?;
    if !result.status.success() {
        return Err(failure(
            "Docker operation failed. Check the gateway service logs and deployment configuration.",
        ));
    }
    String::from_utf8(result.stdout).map_err(|_| failure("Invalid Docker response"))
}
fn argument(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_owned()).collect()
}
fn positive(name: &str) -> Result<u64> {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|v| *v > 0)
        .ok_or_else(|| Error::invalid(format!("Set a positive {name}")))
}
impl Workers {
    pub async fn new(config: &Config) -> Result<Self> {
        if !cfg!(target_os = "linux") {
            return Err(Error::invalid("Multi-user mode is supported only on Linux"));
        }
        verify_egress_receipt()?;
        let info: Value =
            serde_json::from_str(&docker(&argument(&["info", "--format", "{{json .}}"])).await?)?;
        if info["CgroupVersion"] != "2"
            || info["CgroupDriver"] != "systemd"
            || !info["SecurityOptions"].as_array().is_some_and(|v| {
                v.iter()
                    .any(|v| v.as_str().is_some_and(|v| v.contains("rootless")))
            })
            || !info["SecurityOptions"].as_array().is_some_and(|options| {
                options.iter().any(|option| {
                    option.as_str().is_some_and(|option| {
                        option.contains("name=seccomp") && option.contains("profile=builtin")
                    })
                })
            })
        {
            return Err(Error::invalid(
                "Workers require rootless Docker with default seccomp, cgroup v2 and systemd delegation",
            ));
        }
        let limits = Limits {
            cpus: positive("WORDFLOW_WORKER_CPUS")?,
            memory: positive("WORDFLOW_WORKER_MEMORY_BYTES")?,
            pids: positive("WORDFLOW_WORKER_PIDS")?,
            active: usize::try_from(positive("WORDFLOW_MAX_WORKERS")?)
                .map_err(|_| Error::invalid("Invalid worker limit"))?,
        };
        if limits.cpus.checked_mul(1_000_000_000).is_none() {
            return Err(Error::invalid("Worker CPU limit is too large"));
        }
        let image = std::env::var("WORDFLOW_WORKER_IMAGE").map_err(|_| {
            Error::invalid("Set WORDFLOW_WORKER_IMAGE to the installed fixed image")
        })?;
        let value: Value =
            serde_json::from_str(&docker(&argument(&["image", "inspect", &image])).await?)?;
        let image_config = value[0]["Config"].clone();
        let image = value[0]["Id"]
            .as_str()
            .filter(|id| id.starts_with("sha256:"))
            .ok_or_else(|| Error::invalid("Worker image must resolve to an immutable image ID"))?
            .to_owned();
        if value[0]["Config"]["Labels"]["org.wordflow.version"] != env!("CARGO_PKG_VERSION")
            || value[0]["Config"]["Labels"]["org.wordflow.protocol"]
                .as_str()
                .and_then(|value| value.parse::<u32>().ok())
                != Some(crate::WORKER_PROTOCOL)
        {
            return Err(Error::invalid(
                "Worker image version does not match the gateway",
            ));
        }
        let root = config.directory()?;
        wordflow_storage::private_directory(&root)?;
        let root = std::fs::canonicalize(root)?;
        if root.to_string_lossy().contains(',') {
            return Err(Error::invalid("Docker storage root cannot contain commas"));
        }
        let namespace = format!("{:x}", Sha256::digest(root.as_os_str().as_encoded_bytes()));
        let public = reqwest::Url::parse(
            config
                .public_url
                .as_deref()
                .ok_or_else(|| Error::invalid("Set the public URL"))?,
        )
        .map_err(|_| Error::invalid("Invalid public URL"))?;
        let manager = Self(Arc::new(Inner {
            root,
            image,
            image_config,
            identity: config.identity.clone(),
            base: config.base_path()?,
            origin: public.origin().ascii_serialization(),
            namespace: namespace[..16].to_owned(),
            limits,
            running: Mutex::new(BTreeMap::new()),
            stopping: AtomicBool::new(false),
            admission: Mutex::new(()),
        }));
        // Count running deployment containers so a gateway restart cannot bypass the active limit.
        let ids = docker(&argument(&[
            "ps",
            "-q",
            "--filter",
            &format!("label=org.wordflow.gateway={}", manager.0.namespace),
        ]))
        .await?;
        if ids.lines().count() > manager.0.limits.active {
            return Err(Error::invalid(
                "Existing workers exceed the configured active-worker limit",
            ));
        }
        Ok(manager)
    }
    fn name(&self, user: Uuid) -> String {
        format!("wordflow-{}-{user}", self.0.namespace)
    }
    pub async fn client(&self, user: Uuid) -> Result<WorkerClient> {
        if self.0.stopping.load(Ordering::Acquire) {
            return Err(failure("The gateway is shutting down"));
        }
        let slot = self.0.running.lock().await.entry(user).or_default().clone();
        slot.get_or_try_init(|| self.start(user)).await?;
        // Resolve anew for each request so an operator-restarted worker can replace its socket.
        connect_worker(&self.0.root.join(user.to_string()))
    }
    async fn start(&self, user: Uuid) -> Result<()> {
        // Per-user OnceCell serializes startup. The admission gate only covers Docker
        // provisioning, so another user's live requests do not wait for readiness.
        let provision = self.0.admission.lock().await;
        if self.0.stopping.load(Ordering::Acquire) {
            return Err(failure("The gateway is shutting down"));
        }
        let existing = docker(&argument(&[
            "ps",
            "-q",
            "--filter",
            &format!("label=org.wordflow.gateway={}", self.0.namespace),
        ]))
        .await?;
        let root = self.0.root.join(user.to_string());
        wordflow_storage::private_directory(&root)?;
        let name = self.name(user);
        let listed = docker(&argument(&[
            "ps",
            "-aq",
            "--filter",
            &format!("name=^{name}$"),
        ]))
        .await?;
        if listed.trim().is_empty() {
            if existing.lines().count() >= self.0.limits.active {
                return Err(failure(
                    "The active-worker limit has been reached. Ask the operator to free capacity.",
                ));
            }
            let network = self.name(user);
            let networks = docker(&argument(&[
                "network",
                "ls",
                "-q",
                "--filter",
                &format!("name=^{network}$"),
            ]))
            .await?;
            if networks.trim().is_empty() {
                docker(&argument(&[
                    "network",
                    "create",
                    "--driver",
                    "bridge",
                    "--opt",
                    "com.docker.network.bridge.enable_icc=false",
                    "--label",
                    &format!("org.wordflow.gateway={}", self.0.namespace),
                    &network,
                ]))
                .await?;
            }
            self.validate_network(user).await?;
            docker(&self.launch(user, &root)).await?;
        } else {
            let inspect: Value =
                serde_json::from_str(&docker(&argument(&["inspect", &name])).await?)?;
            self.validate(&inspect[0], user, &root)?;
            self.validate_network(user).await?;
            if inspect[0]["State"]["Running"] != true {
                if existing.lines().count() >= self.0.limits.active {
                    return Err(failure(
                        "The active-worker limit has been reached. Ask the operator to free capacity.",
                    ));
                }
                docker(&argument(&["start", &name])).await?;
            }
        }
        drop(provision);
        let mut healthy = false;
        for _ in 0..150 {
            if let Ok(client) = connect_worker(&root)
                && let Ok(response) = client
                    .get("http://worker/internal/worker")
                    .timeout(Duration::from_secs(1))
                    .send()
                    .await
            {
                let version: Value = response
                    .json()
                    .await
                    .map_err(|_| failure("Invalid worker readiness response"))?;
                if version["version"] != env!("CARGO_PKG_VERSION")
                    || version["protocol"] != crate::WORKER_PROTOCOL
                {
                    return Err(failure("Worker protocol version mismatch"));
                }
                healthy = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if !healthy {
            return Err(failure(
                "Worker failed to start or crashed. Reopen saved projects after the operator restarts it.",
            ));
        }
        let inspect: Value = serde_json::from_str(&docker(&argument(&["inspect", &name])).await?)?;
        self.validate(&inspect[0], user, &root)?;
        self.verify_limits(&name).await?;
        // This probe exercises traffic from the actual rootless worker network.
        docker(&argument(&[
            "exec",
            &name,
            "/usr/local/bin/wordflow-server",
            "--probe-network",
        ]))
        .await?;
        Ok(())
    }
    async fn validate_network(&self, user: Uuid) -> Result<()> {
        let network: Value = serde_json::from_str(
            &docker(&argument(&["network", "inspect", &self.name(user)])).await?,
        )?;
        if network[0]["Driver"] != "bridge"
            || network[0]["Options"]["com.docker.network.bridge.enable_icc"] != "false"
            || network[0]["Labels"]["org.wordflow.gateway"] != self.0.namespace
        {
            return Err(failure(
                "Worker network does not match the deployment isolation policy",
            ));
        }
        Ok(())
    }
    fn launch(&self, user: Uuid, root: &Path) -> Vec<String> {
        let mut args = argument(&[
            "run",
            "-d",
            "--name",
            &self.name(user),
            "--network",
            &self.name(user),
            "--ipc=private",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit",
            &self.0.limits.pids.to_string(),
            "--memory",
            &self.0.limits.memory.to_string(),
            "--memory-swap",
            &self.0.limits.memory.to_string(),
            "--cpus",
            &self.0.limits.cpus.to_string(),
            "--mount",
            &format!("type=bind,src={},dst=/wordflow", root.display()),
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=64m",
            "--tmpfs",
            "/run:rw,noexec,nosuid,size=4m",
            "--log-driver=none",
            "--label",
            &format!("org.wordflow.gateway={}", self.0.namespace),
            "--label",
            &format!("org.wordflow.user={user}"),
            "--label",
            &format!("org.wordflow.version={}", env!("CARGO_PKG_VERSION")),
        ]);
        args.extend(argument(&[
            &self.0.image,
            "--worker-root",
            "/wordflow",
            "--worker-socket",
            "/wordflow/local/runtime/api.sock",
            "--identity",
            &self.0.identity,
            "--public-base-path",
            &self.0.base,
            "--allowed-origin",
            &self.0.origin,
        ]));
        args
    }
    fn validate(&self, inspect: &Value, user: Uuid, root: &Path) -> Result<()> {
        let host = &inspect["HostConfig"];
        let mounts = inspect["Mounts"]
            .as_array()
            .ok_or_else(|| failure("Invalid worker mounts"))?;
        let bindings: Vec<_> = mounts
            .iter()
            .filter(|mount| mount["Type"] == "bind")
            .collect();
        if inspect["Config"]["Env"] != self.0.image_config["Env"]
            || inspect["Config"]["Entrypoint"] != self.0.image_config["Entrypoint"]
            || inspect["Config"]["User"] != self.0.image_config["User"]
            || host["NetworkMode"] != self.name(user)
            || host["IpcMode"] != "private"
            || !host["UTSMode"].as_str().is_none_or(str::is_empty)
            || !inspect["NetworkSettings"]["Networks"]
                .as_object()
                .is_some_and(|networks| {
                    networks.len() == 1 && networks.contains_key(&self.name(user))
                })
            || !host["PidMode"].as_str().is_none_or(str::is_empty)
            || !host["UsernsMode"].as_str().is_none_or(str::is_empty)
            || !host["CapAdd"].as_array().is_none_or(|v| v.is_empty())
            || inspect["Image"] != self.0.image
            || inspect["Config"]["Labels"]["org.wordflow.user"] != user.to_string()
            || host["ReadonlyRootfs"] != true
            || host["Privileged"] != false
            || host["Memory"].as_u64() != Some(self.0.limits.memory)
            || host["PidsLimit"].as_u64() != Some(self.0.limits.pids)
            || host["NanoCpus"].as_u64() != Some(self.0.limits.cpus * 1_000_000_000)
            || mounts.iter().any(|mount| {
                mount["Type"] != "bind"
                    && !(mount["Type"] == "tmpfs"
                        && matches!(mount["Destination"].as_str(), Some("/tmp" | "/run")))
            })
            || host["Tmpfs"]
                != serde_json::json!({"/tmp":"rw,noexec,nosuid,size=64m","/run":"rw,noexec,nosuid,size=4m"})
            || inspect["Config"]["Cmd"]
                != serde_json::json!([
                    "--worker-root",
                    "/wordflow",
                    "--worker-socket",
                    "/wordflow/local/runtime/api.sock",
                    "--identity",
                    self.0.identity,
                    "--public-base-path",
                    self.0.base,
                    "--allowed-origin",
                    self.0.origin
                ])
            || !host["Devices"].as_array().is_none_or(|v| v.is_empty())
            || host["MemorySwap"].as_u64() != Some(self.0.limits.memory)
            || bindings.len() != 1
            || bindings[0]["Source"] != root.to_string_lossy().as_ref()
            || bindings[0]["Destination"] != "/wordflow"
            || bindings[0]["RW"] != true
            || !host["PortBindings"]
                .as_object()
                .is_none_or(|p| p.is_empty())
            || host["CapDrop"] != serde_json::json!(["ALL"])
            || !host["SecurityOpt"].as_array().is_some_and(|opts| {
                opts.len() == 1
                    && (opts[0] == "no-new-privileges" || opts[0] == "no-new-privileges=true")
            })
        {
            return Err(failure(
                "Existing worker does not match the required isolation configuration. Stop it before restarting the gateway.",
            ));
        }
        Ok(())
    }
    async fn verify_limits(&self, name: &str) -> Result<()> {
        for (file, value) in [
            ("memory.max", self.0.limits.memory.to_string()),
            ("pids.max", self.0.limits.pids.to_string()),
        ] {
            let actual = docker(&argument(&[
                "exec",
                name,
                "cat",
                &format!("/sys/fs/cgroup/{file}"),
            ]))
            .await?;
            if actual.trim() != value {
                return Err(failure(
                    "Rootless Docker did not enforce the required cgroup limits",
                ));
            }
        }
        let cpu = docker(&argument(&["exec", name, "cat", "/sys/fs/cgroup/cpu.max"])).await?;
        let values: Vec<_> = cpu.split_whitespace().collect();
        let ratio = values
            .first()
            .and_then(|v| v.parse::<u64>().ok())
            .zip(values.get(1).and_then(|v| v.parse::<u64>().ok()));
        if !ratio.is_some_and(|(quota, period)| {
            period > 0 && self.0.limits.cpus.checked_mul(period) == Some(quota)
        }) {
            return Err(failure("Rootless Docker did not enforce the CPU limit"));
        }
        Ok(())
    }
    pub async fn shutdown(&self) -> Result<()> {
        self.0.stopping.store(true, Ordering::Release);
        // Wait for any in-flight startup before collecting every worker to terminate.
        let _provision = self.0.admission.lock().await;
        let ids = docker(&argument(&[
            "ps",
            "-q",
            "--filter",
            &format!("label=org.wordflow.gateway={}", self.0.namespace),
        ]))
        .await?;
        let mut failure = None;
        // Signal every worker before waiting, including when one Docker operation fails.
        for id in ids.lines() {
            if let Err(error) = docker(&argument(&["kill", "--signal=TERM", id])).await {
                failure.get_or_insert(error);
            }
        }
        for id in ids.lines() {
            if let Err(error) = docker(&argument(&["wait", id])).await {
                failure.get_or_insert(error);
            }
        }
        failure.map_or(Ok(()), Err)
    }
}
#[derive(Clone)]
pub struct Gateway {
    pub auth: crate::auth::Auth,
    pub workers: Workers,
}
impl Gateway {
    pub fn router(&self) -> axum::Router {
        axum::Router::new()
            .route("/api/{*path}", axum::routing::any(proxy))
            .route("/project/{*path}", axum::routing::any(proxy))
            .with_state(self.clone())
            .merge(self.auth.router())
    }
}
async fn proxy(State(gateway): State<Gateway>, mut request: Request) -> Result<Response> {
    if !request.uri().path().starts_with("/api/") && !request.uri().path().starts_with("/project/")
    {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let changes = gateway.auth.session_changes();
    let (user, remaining) = gateway.auth.session(request.headers()).await?;
    let mut session_headers = axum::http::HeaderMap::new();
    for cookie in request.headers().get_all(header::COOKIE) {
        session_headers.append(header::COOKIE, cookie.clone());
    }
    if !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) {
        gateway.auth.mutation(request.headers()).await?;
    }
    let id = Uuid::parse_str(&user.id).map_err(|_| failure("Invalid stored account identity"))?;
    let client = gateway.workers.client(id).await?;
    let uri = request
        .uri()
        .path_and_query()
        .map_or("/", |v| v.as_str())
        .to_owned();
    strip_hop_headers(request.headers_mut());
    request.headers_mut().remove(header::COOKIE);
    request.headers_mut().remove("x-wordflow-csrf");
    request.headers_mut().remove(header::AUTHORIZATION);
    let (parts, body) = request.into_parts();
    let response = client
        .request(parts.method, format!("http://worker{uri}"))
        .headers(parts.headers)
        .body(reqwest::Body::wrap_stream(body.into_data_stream()))
        .send()
        .await
        .map_err(|_| {
            failure("Your worker is unavailable. Reopen saved projects after it restarts.")
        })?;
    let status = response.status();
    let mut headers = response.headers().clone();
    strip_hop_headers(&mut headers);
    headers.remove(header::SET_COOKIE);
    let stream = session_stream(
        gateway.auth,
        session_headers,
        remaining,
        changes,
        response.bytes_stream(),
    );
    let mut result = (status, Body::from_stream(stream)).into_response();
    *result.headers_mut() = headers;
    result.headers_mut().insert(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    Ok(result)
}
/// Stop authenticated response streams on absolute expiry or revocation, without cancelling worker tasks.
pub(crate) fn session_stream<S: Stream + Send + 'static>(
    auth: crate::auth::Auth,
    headers: axum::http::HeaderMap,
    remaining: Duration,
    changes: tokio::sync::watch::Receiver<u64>,
    body: S,
) -> impl Stream<Item = S::Item> + Send
where
    S::Item: Send,
{
    let deadline = tokio::time::Instant::now() + remaining;
    futures_util::stream::unfold(
        (Box::pin(body), changes, deadline, auth, headers),
        |(mut body, mut changes, deadline, auth, headers)| async move {
            loop {
                if tokio::time::Instant::now() >= deadline {
                    return None;
                }
                tokio::select! {
                    biased;
                    _ = tokio::time::sleep_until(deadline) => return None,
                    changed = changes.changed() => {
                        if changed.is_err() || auth.authenticate(&headers).await.is_err() {return None;}
                    }
                    chunk = body.next() => {
                        if tokio::time::Instant::now() >= deadline {return None;}
                        return chunk.map(|chunk| (chunk, (body, changes, deadline, auth, headers)));
                    },
                }
            }
        },
    )
}
fn strip_hop_headers(headers: &mut axum::http::HeaderMap) {
    let connection = headers
        .get(header::CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    if let Some(connection) = connection {
        for name in connection.split(',') {
            headers.remove(name.trim());
        }
    }
    for name in [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
    ] {
        headers.remove(name);
    }
}

fn verify_egress_receipt() -> Result<()> {
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::MetadataExt;
        let status = std::fs::read_to_string("/proc/self/status")?;
        let uid = status
            .lines()
            .find(|line| line.starts_with("Uid:"))
            .and_then(|line| line.split_whitespace().nth(2))
            .and_then(|v| v.parse::<u32>().ok())
            .ok_or_else(|| Error::invalid("Cannot determine the gateway service UID"))?;
        if uid == 0 {
            return Err(Error::invalid("Use a dedicated nonroot service account"));
        }
        for path in ["/run/wordflow", "/run/wordflow/egress.json"] {
            let metadata = std::fs::symlink_metadata(path)?;
            if metadata.uid() != 0
                || metadata.mode() & 0o022 != 0
                || metadata.file_type().is_symlink()
            {
                return Err(Error::invalid(
                    "Egress verification receipt must be protected and owned by root",
                ));
            }
        }
        let receipt: Value = serde_json::from_slice(&std::fs::read("/run/wordflow/egress.json")?)?;
        if receipt["schemaVersion"] != 1
            || receipt["uid"].as_u64() != Some(u64::from(uid))
            || receipt["rulesSha256"]
                .as_str()
                .is_none_or(|v| v.len() != 64)
        {
            return Err(Error::invalid(
                "Install the rootless egress policy for this service UID before starting the gateway",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn socket_resolution_rejects_cross_user_links_and_pins_the_checked_inode() {
        use std::os::unix::fs::symlink;
        let first = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let mut servers = Vec::new();
        for (root, owner) in [(first.path(), "first"), (other.path(), "other")] {
            std::fs::create_dir_all(root.join("local/runtime")).unwrap();
            let listener =
                tokio::net::UnixListener::bind(root.join("local/runtime/api.sock")).unwrap();
            servers.push(tokio::spawn(async move {
                axum::serve(
                    listener,
                    axum::Router::new()
                        .route("/", axum::routing::get(move || async move { owner })),
                )
                .await
                .unwrap();
            }));
        }
        let client = connect_worker(first.path()).unwrap();
        std::fs::rename(
            first.path().join("local/runtime/api.sock"),
            first.path().join("local/runtime/checked.sock"),
        )
        .unwrap();
        symlink(
            other.path().join("local/runtime/api.sock"),
            first.path().join("local/runtime/api.sock"),
        )
        .unwrap();
        assert_eq!(
            client
                .get("http://worker/")
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap(),
            "first"
        );
        assert!(connect_worker(first.path()).is_err());
        std::fs::rename(
            first.path().join("local/runtime"),
            first.path().join("local/previous"),
        )
        .unwrap();
        symlink(
            other.path().join("local/runtime"),
            first.path().join("local/runtime"),
        )
        .unwrap();
        assert!(connect_worker(first.path()).is_err());
        std::fs::remove_file(first.path().join("local/runtime")).unwrap();
        std::fs::create_dir(first.path().join("local/runtime")).unwrap();
        std::fs::write(first.path().join("local/runtime/api.sock"), "regular file").unwrap();
        assert!(connect_worker(first.path()).is_err());
        for server in servers {
            server.abort();
        }
    }

    #[test]
    fn adoption_rejects_changed_mounts_namespaces_networks_resources_and_execution() {
        let user = Uuid::new_v4();
        let root = PathBuf::from("/isolated/user");
        let workers = Workers(Arc::new(Inner {
            root: PathBuf::from("/isolated"),
            image: "sha256:fixed-image".into(),
            image_config: json!({"Env":["PATH=/usr/bin"],"Entrypoint":["/usr/local/bin/wordflow-server"],"User":""}),
            identity: wordflow_storage::TEST_ID.into(),
            base: "/prefix/".into(),
            origin: "https://wordflow.example".into(),
            namespace: "fixture".into(),
            limits: Limits {
                cpus: 2,
                memory: 4096,
                pids: 64,
                active: 2,
            },
            running: Mutex::new(BTreeMap::new()),
            stopping: AtomicBool::new(false),
            admission: Mutex::new(()),
        }));
        let network = workers.name(user);
        let valid = json!({
            "Image":"sha256:fixed-image",
            "Config":{
                "Env":["PATH=/usr/bin"],"Entrypoint":["/usr/local/bin/wordflow-server"],"User":"",
                "Labels":{"org.wordflow.user":user.to_string()},
                "Cmd":["--worker-root","/wordflow","--worker-socket","/wordflow/local/runtime/api.sock","--identity",wordflow_storage::TEST_ID,"--public-base-path","/prefix/","--allowed-origin","https://wordflow.example"]
            },
            "HostConfig":{
                "NetworkMode":network,"IpcMode":"private","UTSMode":"","PidMode":"","UsernsMode":"","CapAdd":[],
                "ReadonlyRootfs":true,"Privileged":false,"Memory":4096,"MemorySwap":4096,"PidsLimit":64,"NanoCpus":2000000000_u64,
                "Tmpfs":{"/tmp":"rw,noexec,nosuid,size=64m","/run":"rw,noexec,nosuid,size=4m"},
                "Devices":[],"PortBindings":{},"CapDrop":["ALL"],"SecurityOpt":["no-new-privileges"]
            },
            "Mounts":[{"Type":"bind","Source":"/isolated/user","Destination":"/wordflow","RW":true}],
            "NetworkSettings":{"Networks":{(network):{}}}
        });
        workers.validate(&valid, user, &root).unwrap();
        for (path, value) in [
            ("/Config/Env", json!(["SECRET=unexpected"])),
            ("/Config/Entrypoint", json!(["/bin/sh"])),
            ("/Config/User", json!("unexpected")),
            ("/HostConfig/IpcMode", json!("host")),
            ("/HostConfig/PidMode", json!("host")),
            ("/HostConfig/ReadonlyRootfs", json!(false)),
            ("/HostConfig/Memory", json!(0)),
            ("/HostConfig/PidsLimit", json!(0)),
            ("/HostConfig/NanoCpus", json!(0)),
            ("/HostConfig/CapAdd", json!(["SYS_ADMIN"])),
            (
                "/HostConfig/SecurityOpt",
                json!(["no-new-privileges", "seccomp=unconfined"]),
            ),
            (
                "/HostConfig/PortBindings",
                json!({"8000/tcp":[{"HostPort":"8000"}]}),
            ),
            ("/Mounts/0/Source", json!("/other-user")),
            ("/NetworkSettings/Networks", json!({"unrelated":{}})),
        ] {
            let mut changed = valid.clone();
            *changed.pointer_mut(path).unwrap() = value;
            assert!(
                workers.validate(&changed, user, &root).is_err(),
                "accepted {path}"
            );
        }
        let mut changed = valid;
        changed["Mounts"]
            .as_array_mut()
            .unwrap()
            .push(json!({"Type":"bind","Source":"/run/user","Destination":"/host","RW":false}));
        assert!(workers.validate(&changed, user, &root).is_err());
    }
}
