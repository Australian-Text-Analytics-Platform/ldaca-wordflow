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
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();
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
    let host = Host::new(&config, origins, shutdown.clone()).await?;
    let ui = Ui {
        base: config.base_path()?.into(),
    };
    let static_routes = axum::Router::new().fallback(get(asset)).with_state(ui);
    let app = host.router().merge(static_routes);
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
        _=shutdown.cancelled()=>{host.close().await?;serving.await}
    };
    shutdown.cancel();
    host.close().await?;
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
