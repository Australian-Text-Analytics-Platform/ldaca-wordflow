#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
use std::{error::Error, net::SocketAddr};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let identity = if std::env::var("WORDFLOW_APP_ID").as_deref() == Ok(wordflow_storage::TEST_ID) {
        wordflow_storage::TEST_ID
    } else {
        wordflow_storage::DEV_ID
    };
    let directories = wordflow_storage::AppDirectories::native(identity)?;
    directories.create()?;
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();
    let address: SocketAddr = match std::env::var("WORDFLOW_BIND_ADDR") {
        Ok(value) => value.parse()?,
        Err(std::env::VarError::NotPresent) => "127.0.0.1:8002".parse()?,
        Err(error) => return Err(error.into()),
    };
    let listener = TcpListener::bind(address).await?;
    tracing::info!(address = %listener.local_addr()?, "Wordflow server listening");
    let shutdown = CancellationToken::new();
    let config_directory = directories.config.clone();
    let ai = wordflow_backend::AiConfiguration::new(
        identity,
        config_directory.join("ai-providers.json"),
    );
    let project = wordflow_backend::ProjectRuntime::with_ai(shutdown.clone(), ai);
    project.set_storage(directories.clone())?;
    let preferences =
        wordflow_storage::http::PreferencesApi::new(&directories.config, shutdown.clone());
    if std::env::args().any(|arg| arg == "--untitled") {
        project.create(None).await?;
    }
    let origins: Vec<String> = serde_json::from_str(
        &std::env::var("CORS_ALLOWED_ORIGINS").unwrap_or_else(|_| "[]".into()),
    )?;
    let origins = origins
        .iter()
        .map(|value| value.parse())
        .collect::<Result<Vec<_>, _>>()?;
    let mut server = tokio::spawn(wordflow_backend::serve_with_host(
        listener,
        origins,
        shutdown.clone(),
        project,
        preferences.router(),
    ));
    let signal_result = tokio::select! {
        result = &mut server => { result??; return Ok(()); }
        result = shutdown_signal() => result,
    };
    shutdown.cancel();
    server.await??;
    signal_result?;
    tracing::info!("Wordflow server stopped");
    Ok(())
}

async fn shutdown_signal() -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! { result = tokio::signal::ctrl_c() => result, _ = terminate.recv() => Ok(()) }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await
}
