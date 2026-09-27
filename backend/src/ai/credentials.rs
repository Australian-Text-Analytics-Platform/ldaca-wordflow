use crate::{Error, error::Result};
use keyring_core::{CredentialStore, Entry};
use std::sync::Arc;

pub(super) trait Secrets: Send + Sync {
    fn get(&self, id: &str) -> Result<Option<String>>;
    fn set(&self, id: &str, value: &str) -> Result<()>;
    fn remove(&self, id: &str) -> Result<()>;
}

pub(super) struct OsSecrets {
    pub namespace: String,
}

fn unavailable(_: keyring_core::Error) -> Error {
    // Store errors can contain credential bytes. Never forward their Debug or Display output.
    Error::new(
        "credential_store_unavailable",
        "The operating system credential store is unavailable. Unlock it and retry, or explicitly choose a session-only key.",
    )
}
fn native_store() -> Result<Arc<CredentialStore>> {
    #[cfg(target_os = "macos")]
    let store = apple_native_keyring_store::keychain::Store::new().map_err(unavailable)?;
    #[cfg(target_os = "windows")]
    let store = windows_native_keyring_store::Store::new().map_err(unavailable)?;
    #[cfg(target_os = "linux")]
    let store = zbus_secret_service_keyring_store::Store::new().map_err(unavailable)?;
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Err(Error::new(
        "credential_store_unavailable",
        "No credential adapter is available on this platform",
    ));
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    Ok(store)
}
impl OsSecrets {
    fn entry(&self, id: &str) -> Result<Entry> {
        native_store()?
            .build(&self.namespace, id, None)
            .map_err(unavailable)
    }
}
impl Secrets for OsSecrets {
    fn get(&self, id: &str) -> Result<Option<String>> {
        match self.entry(id)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring_core::Error::NoEntry) => Ok(None),
            Err(error) => Err(unavailable(error)),
        }
    }
    fn set(&self, id: &str, value: &str) -> Result<()> {
        self.entry(id)?.set_password(value).map_err(unavailable)
    }
    fn remove(&self, id: &str) -> Result<()> {
        match self.entry(id)?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(error) => Err(unavailable(error)),
        }
    }
}
