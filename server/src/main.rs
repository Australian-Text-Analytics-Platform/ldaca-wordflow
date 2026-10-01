#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
use axum::{
    body::Body,
    extract::{Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use clap::Parser;
use rust_embed::Embed;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use wordflow_server::{Host, config::Config};

#[derive(Embed)]
#[folder = "../frontend/build/"]
struct Assets;
#[derive(Clone)]
struct Ui {
    base: Arc<str>,
}
async fn asset(State(ui): State<Ui>, request: Request) -> Response {
    let path = request.uri().path().trim_start_matches('/');
    let name = if path.is_empty() { "index.html" } else { path };
    let Some(file) = Assets::get(name) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if name == "index.html" {
        let config = serde_json::json!({"public_base_path":ui.base.as_ref()})
            .to_string()
            .replace('<', "\\u003c");
        let injection = format!(
            "<head><base href=\"{}\"><script id=\"wordflow-server-config\" type=\"application/json\">{config}</script>",
            ui.base
        );
        let html = String::from_utf8_lossy(&file.data).replacen("<head>", &injection, 1);
        return (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "no-store"),
            ],
            html,
        )
            .into_response();
    }
    let content_type = mime_guess::from_path(name)
        .first_or_octet_stream()
        .to_string();
    let cache = if name.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, cache.to_owned()),
        ],
        Body::from(file.data.into_owned()),
    )
        .into_response()
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut config = Config::parse();
    config.validate_mode()?;
    if config.probe_network {
        return probe_network().await;
    }
    let _worker_lock = if let Some(root) = &config.worker_root {
        if root != std::path::Path::new("/wordflow") {
            return Err("Worker storage must be mounted at /wordflow".into());
        }
        if let Some(path) = &config.icu_path {
            let path = std::fs::canonicalize(path)?;
            if !path.starts_with("/wordflow") && !path.starts_with("/opt/wordflow/resources") {
                return Err("Worker resource overrides must be inside mounted storage or packaged resources".into());
            }
        }
        wordflow_storage::private_directory(&root.join("local/runtime"))?;
        let lock = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("local/runtime/worker.lock"))?;
        fs2::FileExt::try_lock_exclusive(&lock)?;
        Some(lock)
    } else {
        None
    };
    let _gateway_lock = if config.mode == wordflow_server::config::Mode::MultiUser {
        let root = config.directory()?.join(".system");
        wordflow_storage::private_directory(&root)?;
        let lock = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("gateway.lock"))?;
        fs2::FileExt::try_lock_exclusive(&lock)?;
        Some(lock)
    } else {
        None
    };
    let logs = config.worker_root.as_ref().map(|root| root.join("logs"));
    let writer: Box<dyn Fn() -> Box<dyn std::io::Write + Send> + Send + Sync> =
        if let Some(logs) = logs {
            wordflow_storage::private_directory(&logs)?;
            let file = Arc::new(
                std::fs::OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open(logs.join("worker.log"))?,
            );
            Box::new(move || Box::new(file.clone()))
        } else {
            Box::new(|| Box::new(std::io::stderr()))
        };
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_ansi(false)
        .with_writer(writer)
        .init();
    #[cfg(unix)]
    if let Some(socket) = &config.worker_socket {
        return serve_worker(&config, socket).await;
    }
    #[cfg(not(unix))]
    if config.worker_socket.is_some() {
        return Err("Workers require Unix sockets".into());
    }
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    config.bind = listener.local_addr()?;
    let mut origins = config
        .allowed_origin
        .iter()
        .map(|v| v.parse())
        .collect::<Result<Vec<_>, _>>()?;
    if let Ok(extra) = std::env::var("CORS_ALLOWED_ORIGINS") {
        for value in serde_json::from_str::<Vec<String>>(&extra)? {
            origins.push(value.parse()?);
        }
    }
    for origin in [
        format!("http://{}", config.bind),
        format!("http://localhost:{}", config.bind.port()),
    ] {
        origins.push(origin.parse()?);
    }
    let shutdown = CancellationToken::new();
    let gateway = if config.mode == wordflow_server::config::Mode::MultiUser {
        Some(wordflow_server::workers::Gateway {
            auth: wordflow_server::auth::Auth::new(&config).await?,
            workers: wordflow_server::workers::Workers::new(&config).await?,
        })
    } else {
        None
    };
    let host = if gateway.is_none() {
        Some(Host::new(&config, origins, shutdown.clone()).await?)
    } else {
        None
    };
    let ui = Ui {
        base: config.base_path()?.into(),
    };
    let static_routes = axum::Router::new().fallback(get(asset)).with_state(ui);
    let app = if let Some(gateway) = &gateway {
        gateway.router().merge(static_routes)
    } else if let Some(host) = &host {
        host.router().merge(static_routes)
    } else {
        return Err("Host configuration failed".into());
    };
    tracing::info!(address=%config.bind,data_dir=%config.directory()?.display(),"Wordflow server ready");
    let stop = shutdown.clone();
    let signals = tokio::spawn(async move {
        if let Err(error) = signal().await {
            tracing::error!(%error,"Shutdown signal failed");
        }
        stop.cancel();
    });
    let server =
        axum::serve(listener, app).with_graceful_shutdown(shutdown.clone().cancelled_owned());
    let serving = async { server.await };
    tokio::pin!(serving);
    let result = tokio::select! {
        result=&mut serving=>result,
        _ = shutdown.cancelled() => {
            if let Some(gateway) = &gateway { gateway.workers.shutdown().await?; }
            if let Some(host) = &host { host.close().await?; }
            serving.await
        }
    };
    shutdown.cancel();
    if let Some(host) = &host {
        host.close().await?;
    }
    if let Some(gateway) = &gateway {
        gateway.workers.shutdown().await?;
    }
    signals.abort();
    result?;
    Ok(())
}
async fn signal() -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! {r=tokio::signal::ctrl_c()=>r,_=term.recv()=>Ok(())}
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c().await
    }
}

#[cfg(unix)]
async fn serve_worker(
    config: &Config,
    socket: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::os::unix::fs::PermissionsExt;
    if socket != std::path::Path::new("/wordflow/local/runtime/api.sock") {
        return Err("Invalid worker socket path".into());
    }
    if socket.exists() {
        std::fs::remove_file(socket)?;
    }
    let listener = tokio::net::UnixListener::bind(socket)?;
    std::fs::set_permissions(socket, std::fs::Permissions::from_mode(0o600))?;
    let shutdown = CancellationToken::new();
    let origins = config
        .allowed_origin
        .iter()
        .map(|v| v.parse())
        .collect::<Result<Vec<_>, _>>()?;
    let host = Host::new(config, origins, shutdown.clone()).await?;
    let stop = shutdown.clone();
    let signals = tokio::spawn(async move {
        let _ = signal().await;
        stop.cancel();
    });
    let serving = axum::serve(listener, host.router())
        .with_graceful_shutdown(shutdown.clone().cancelled_owned());
    let result = async { serving.await };
    tokio::pin!(result);
    let result = tokio::select! { result=&mut result=>result, _=shutdown.cancelled()=>{host.close().await?;result.await} };
    host.close().await?;
    signals.abort();
    std::fs::remove_file(socket)?;
    result?;
    Ok(())
}
async fn probe_network() -> Result<(), Box<dyn std::error::Error>> {
    // A reachable protected endpoint means the operator's egress policy is absent or ineffective.
    for address in [
        "169.254.169.254:80",
        "169.254.170.2:80",
        "10.0.2.2:443",
        "192.168.65.2:443",
        "[fd00:ec2::254]:80",
    ] {
        if matches!(
            tokio::time::timeout(
                std::time::Duration::from_secs(2),
                tokio::net::TcpStream::connect(address)
            )
            .await,
            Ok(Ok(_))
        ) {
            return Err("Worker egress reached a protected network".into());
        }
    }
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?
        .get("https://huggingface.co")
        .send()
        .await?;
    Ok(())
}
