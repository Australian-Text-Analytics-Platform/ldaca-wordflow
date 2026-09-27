use clap::Parser;
use std::{net::SocketAddr, path::PathBuf};
use wordflow_backend::Error;

#[derive(Clone, Debug, Parser)]
#[command(version, about = "Wordflow: native single-user browser application")]
pub struct Config {
    #[arg(long, env = "WORDFLOW_BIND_ADDR", default_value = "127.0.0.1:8002")]
    pub bind: SocketAddr,
    #[arg(long, env = "DATA_DIR")]
    pub data_dir: Option<PathBuf>,
    /// External path stripped by the reverse proxy, for example /user/name/proxy/8002/.
    #[arg(long, env = "WORDFLOW_PUBLIC_BASE_PATH", default_value = "/")]
    pub public_base_path: String,
    /// Exact public origin permitted through a reverse proxy. Repeat for multiple origins.
    #[arg(long)]
    pub allowed_origin: Vec<String>,
    #[arg(long, env = "WORDFLOW_ICU_PATH")]
    pub icu_path: Option<PathBuf>,
}
impl Config {
    pub fn directory(&self) -> Result<PathBuf, Error> {
        if let Some(path) = &self.data_dir {
            return Ok(path.clone());
        }
        #[cfg(target_os = "windows")]
        let path = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|p| p.join("Wordflow/server"));
        #[cfg(target_os = "macos")]
        let path = std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|p| p.join("Library/Application Support/Wordflow/server"));
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let path = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/share")))
            .map(|p| p.join("wordflow/server"));
        path.ok_or_else(|| Error::invalid("Set DATA_DIR or --data-dir to a writable directory"))
    }
    pub fn base_path(&self) -> Result<String, Error> {
        let value = &self.public_base_path;
        if !value.starts_with('/')
            || value.starts_with("//")
            || value.contains(['?', '#', '\\', '<', '>', '"', '\''])
            || value.split('/').any(|p| p == "." || p == "..")
        {
            return Err(Error::invalid(
                "Public base path must be an absolute URL path without traversal, query or fragment",
            ));
        }
        Ok(format!("{}/", value.trim_end_matches('/')))
    }
}
