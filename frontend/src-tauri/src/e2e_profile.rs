//! Test-only browser storage. The production app identity and document handling stay intact.

/// Run without project windows after the driver has stopped the owning process.
/// WebKit rejects removal while any webview in that process still retains the store.
#[cfg(target_os = "macos")]
pub(crate) fn remove_store_process(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .setup(|app| {
            let identifier = uuid::Uuid::parse_str(&std::env::var("WORDFLOW_E2E_STORE_ID")?)?;
            // Initialize WebKit's run loop without opening the store being removed.
            tauri::WebviewWindowBuilder::new(
                app,
                "e2e-cleanup",
                tauri::WebviewUrl::External("about:blank".parse()?),
            )
            .incognito(true)
            .visible(false)
            .build()?;
            let app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let code = match app.remove_data_store(*identifier.as_bytes()).await {
                    Ok(()) => 0,
                    Err(error) => {
                        eprintln!("Could not remove test-owned WebKit store: {error}");
                        1
                    }
                };
                app.exit(code);
            });
            Ok(())
        })
        .run(context)
        .expect("Could not start E2E storage cleanup");
}

pub(crate) struct Profile {
    pub directory: tempfile::TempDir,
    #[cfg(target_os = "macos")]
    identifier: [u8; 16],
}
impl Profile {
    pub fn new() -> std::io::Result<Self> {
        Ok(Self {
            directory: match std::env::var_os("WORDFLOW_E2E_PROFILE_DIR") {
                Some(root) => tempfile::tempdir_in(root)?,
                None => tempfile::tempdir()?,
            },
            #[cfg(target_os = "macos")]
            identifier: *match std::env::var("WORDFLOW_E2E_STORE_ID") {
                Ok(value) => uuid::Uuid::parse_str(&value).map_err(std::io::Error::other)?,
                Err(_) => uuid::Uuid::new_v4(),
            }
            .as_bytes(),
        })
    }
    pub fn configure(&self, config: &mut tauri::utils::config::WindowConfig) {
        #[cfg(target_os = "macos")]
        {
            config.data_store_identifier = Some(self.identifier);
        }
        #[cfg(not(target_os = "macos"))]
        {
            config.data_directory = Some(self.directory.path().join("webview"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_share_one_store_but_separate_runs_do_not() {
        let first = Profile::new().unwrap();
        let second = Profile::new().unwrap();
        let mut a = tauri::utils::config::WindowConfig::default();
        let mut b = a.clone();
        let mut c = a.clone();
        first.configure(&mut a);
        first.configure(&mut b);
        second.configure(&mut c);
        #[cfg(target_os = "macos")]
        {
            assert_eq!(a.data_store_identifier, b.data_store_identifier);
            assert_ne!(a.data_store_identifier, c.data_store_identifier);
        }
        #[cfg(not(target_os = "macos"))]
        {
            assert_eq!(a.data_directory, b.data_directory);
            assert_ne!(a.data_directory, c.data_directory);
        }
    }
}
