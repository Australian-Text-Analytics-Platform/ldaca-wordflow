#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
use std::{error::Error, net::SocketAddr};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
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
    let config_directory = configuration_directory()?;
    let ai = wordflow_backend::AiConfiguration::new(
        "au.edu.ldaca.wordflow.server",
        config_directory.join("ai-providers.json"),
    );
    let project = wordflow_backend::ProjectRuntime::with_ai(shutdown.clone(), ai);
    project.set_icu_cache_directory(config_directory.join("cache/icu"))?;
    project.set_language_cache_directory(config_directory.join("cache/language"))?;
    if let Some(path) = std::env::var_os("WORDFLOW_ICU_PATH") {
        project.set_icu_path(path.into())?;
    }
    if let Some(cache) = std::env::var_os("WORDFLOW_EMBEDDING_CACHE")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("LOCALAPPDATA")
                .map(|path| std::path::PathBuf::from(path).join("Wordflow/embeddings.duckdb"))
        })
        .or_else(|| {
            std::env::var_os("HOME").map(|home| {
                std::path::PathBuf::from(home).join(".cache/wordflow/embeddings.duckdb")
            })
        })
    {
        project.set_embedding_cache_path(cache)?;
    }
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
    let mut server = tokio::spawn(wordflow_backend::serve(
        listener,
        origins,
        shutdown.clone(),
        project,
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

fn configuration_directory() -> Result<std::path::PathBuf, Box<dyn Error>> {
    use std::path::PathBuf;
    if let Some(path) = std::env::var_os("WORDFLOW_CONFIG_DIR") {
        return Ok(PathBuf::from(path));
    }
    #[cfg(target_os = "windows")]
    if let Some(path) = std::env::var_os("APPDATA") {
        return Ok(PathBuf::from(path).join("Wordflow"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(path) = std::env::var_os("XDG_CONFIG_HOME") {
            return Ok(PathBuf::from(path).join("wordflow"));
        }
        if let Some(path) = std::env::var_os("HOME") {
            return Ok(PathBuf::from(path).join(".config/wordflow"));
        }
    }
    Err("Set WORDFLOW_CONFIG_DIR to the server account's configuration directory".into())
}
