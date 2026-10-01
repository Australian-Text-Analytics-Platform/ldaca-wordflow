#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
use std::{error::Error, net::SocketAddr};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

fn main() -> Result<(), Box<dyn Error>> {
    // Configure model libraries before the async runtime creates any threads.
    let cache = cache_directory()?;
    unsafe {
        std::env::set_var("HF_HOME", cache.join("huggingface"));
        std::env::set_var("LINDERA_DICT_PATH", cache.join("lindera"));
        std::env::set_var("WORDFLOW_QUOTATION_CACHE", cache.join("udpipe"));
        std::env::remove_var("WORDFLOW_QUOTATION_MODEL");
        std::env::remove_var("WORDFLOW_ICU_PATH");
    }
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run(cache))
}

async fn run(cache: std::path::PathBuf) -> Result<(), Box<dyn Error>> {
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
        application_identity(),
        config_directory.join("ai-providers.json"),
    );
    let project = wordflow_backend::ProjectRuntime::with_ai(shutdown.clone(), ai);
    project.set_icu_cache_directory(cache.join("icu"))?;
    project.set_language_cache_directory(cache.join("language"))?;
    project.set_embedding_cache_path(cache.join("embeddings.duckdb"))?;
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
    if let Some(path) = std::env::var_os("WORDFLOW_CONFIG_DIR")
        .filter(|_| application_identity().ends_with(".test"))
    {
        return Ok(PathBuf::from(path));
    }
    #[cfg(target_os = "windows")]
    if let Some(path) = std::env::var_os("APPDATA") {
        return Ok(PathBuf::from(path).join(application_identity()));
    }
    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME") {
        return Ok(PathBuf::from(home)
            .join("Library/Application Support")
            .join(application_identity()));
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Some(path) = std::env::var_os("XDG_CONFIG_HOME") {
            return Ok(PathBuf::from(path).join(application_identity()));
        }
        if let Some(path) = std::env::var_os("HOME") {
            return Ok(PathBuf::from(path)
                .join(".config")
                .join(application_identity()));
        }
    }
    Err("Cannot locate the development configuration directory".into())
}

fn application_identity() -> &'static str {
    if std::env::var("WORDFLOW_APP_ID").as_deref() == Ok("au.edu.ldaca.wordflow.test") {
        "au.edu.ldaca.wordflow.test"
    } else {
        "au.edu.ldaca.wordflow.dev"
    }
}

fn cache_directory() -> Result<std::path::PathBuf, Box<dyn Error>> {
    use std::path::PathBuf;
    let base = if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Caches"))
    } else if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))
    };
    Ok(base
        .ok_or("Cannot locate the system cache directory")?
        .join(application_identity()))
}
