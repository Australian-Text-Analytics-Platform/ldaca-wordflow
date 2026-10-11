use clap::Parser;
use std::{net::SocketAddr, path::PathBuf};
use wordflow_backend::Error;

#[derive(Clone, Debug, Parser)]
#[command(version, about = "Wordflow: native single-user browser application")]
pub struct Config {
    #[arg(long, env = "WORDFLOW_MODE", value_enum, default_value = "single-user")]
    pub mode: Mode,
    #[arg(long, hide = true)]
    pub probe_network: bool,
    #[arg(long, env = "WORDFLOW_APP_ID", default_value = wordflow_storage::PRODUCTION_ID)]
    pub identity: String,
    #[arg(long, env = "WORDFLOW_PUBLIC_URL")]
    pub public_url: Option<String>,
    #[arg(long, hide = true, requires = "worker_socket")]
    pub worker_root: Option<PathBuf>,
    #[arg(long, hide = true, requires = "worker_root")]
    pub worker_socket: Option<PathBuf>,
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
    pub fn validate_mode(&self) -> Result<(), Error> {
        if self.mode == Mode::MultiUser
            && (!cfg!(target_os = "linux") || self.worker_root.is_some())
        {
            return Err(Error::invalid(
                "Multi-user gateway mode requires Linux and cannot be a worker",
            ));
        }
        Ok(())
    }
    pub fn directory(&self) -> Result<PathBuf, Error> {
        if ![
            wordflow_storage::PRODUCTION_ID,
            wordflow_storage::DEV_ID,
            wordflow_storage::TEST_ID,
        ]
        .contains(&self.identity.as_str())
        {
            return Err(Error::invalid("Unknown application identity"));
        }
        let path = match &self.data_dir {
            Some(path) => path.clone(),
            None => web_directory(
                wordflow_storage::AppDirectories::native(&format!("{}.web", self.identity))?.data,
            ),
        };
        Ok(if path.is_absolute() {
            path
        } else {
            std::env::current_dir()?.join(path)
        })
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, clap::ValueEnum)]
pub enum Mode {
    SingleUser,
    MultiUser,
}

/// Prefer the web identity, retaining existing server storage until explicitly moved.
fn web_directory(web: PathBuf) -> PathBuf {
    let legacy = web.with_extension("server");
    if !web.exists() && legacy.is_dir() {
        legacy
    } else {
        web
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_web_storage_and_legacy_fallback() {
        let root = tempfile::tempdir().unwrap();
        let web = root.path().join("au.edu.ldaca.wordflow.dev.web");
        let legacy = web.with_extension("server");
        assert_eq!(web_directory(web.clone()), web);
        std::fs::create_dir(&legacy).unwrap();
        std::fs::write(legacy.join("saved-project"), "existing data").unwrap();
        assert_eq!(web_directory(web.clone()), legacy);
        std::fs::create_dir(&web).unwrap();
        assert_eq!(web_directory(web.clone()), web);
        assert_eq!(
            std::fs::read_to_string(legacy.join("saved-project")).unwrap(),
            "existing data"
        );
    }

    #[test]
    fn web_identities_and_explicit_override() {
        for identity in [
            wordflow_storage::PRODUCTION_ID,
            wordflow_storage::DEV_ID,
            wordflow_storage::TEST_ID,
        ] {
            let web = wordflow_storage::AppDirectories::native(&format!("{identity}.web")).unwrap();
            assert!(web.data.ends_with(format!("{identity}.web")));
            let config = Config::parse_from([
                "wordflow-server",
                "--identity",
                identity,
                "--data-dir",
                "custom-web-data",
            ]);
            assert_eq!(
                config.directory().unwrap(),
                std::env::current_dir().unwrap().join("custom-web-data")
            );
        }
    }
}
