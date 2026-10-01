//! The desktop shell resolves directories through Tauri and owns preference IPC.
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;
use wordflow_backend::Error;
use wordflow_storage::{
    AppDirectories, Preferences, PreferencesPatch, DEV_ID, PRODUCTION_ID, TEST_ID,
};

pub(crate) fn validate_identity(identifier: &str) -> std::io::Result<()> {
    if ![PRODUCTION_ID, DEV_ID, TEST_ID].contains(&identifier)
        || (cfg!(feature = "e2e") && identifier != TEST_ID)
    {
        return Err(std::io::Error::other(
            "Unknown application identity or instrumentation outside Test",
        ));
    }
    Ok(())
}
pub(crate) fn directories(app: &AppHandle) -> tauri::Result<AppDirectories> {
    Ok(AppDirectories {
        config: app.path().app_config_dir()?,
        data: app.path().app_data_dir()?,
        local_data: app.path().app_local_data_dir()?,
        cache: app.path().app_cache_dir()?,
        logs: app.path().app_log_dir()?,
        temporary: app.path().temp_dir()?.join(&app.config().identifier),
    })
}
#[derive(Default)]
pub(crate) struct PreferencesState(Mutex<()>);
#[tauri::command]
pub(crate) fn get_preferences(app: AppHandle) -> Result<Preferences, Error> {
    let state = app.state::<PreferencesState>();
    let _guard = state
        .0
        .lock()
        .map_err(|_| Error::new("preferences_error", "Preferences reader failed"))?;
    read(&app)
}
fn read(app: &AppHandle) -> Result<Preferences, Error> {
    Ok(wordflow_storage::read_preferences(
        &app.state::<AppDirectories>()
            .config
            .join("preferences.json"),
    )?)
}
fn save(app: &AppHandle, next: &Preferences) -> Result<(), Error> {
    let path = app
        .state::<AppDirectories>()
        .config
        .join("preferences.json");
    let store = app
        .store_builder(path)
        .disable_auto_save()
        .create_new()
        .build()
        .map_err(|e| Error::new("preferences_error", e.to_string()))?;
    store.clear();
    let serde_json::Value::Object(values) = serde_json::to_value(next)? else {
        return Err(Error::new("preferences_error", "Invalid preferences"));
    };
    for (key, value) in values {
        store.set(key, value);
    }
    store
        .save()
        .map_err(|e| Error::new("preferences_error", e.to_string()))?;
    app.emit("preferences-changed", next)
        .map_err(|e| Error::new("desktop_error", e.to_string()))?;
    Ok(())
}
#[tauri::command]
pub(crate) fn patch_preferences(
    app: AppHandle,
    patch: PreferencesPatch,
) -> Result<Preferences, Error> {
    let state = app.state::<PreferencesState>();
    let _guard = state
        .0
        .lock()
        .map_err(|_| Error::new("preferences_error", "Preferences writer failed"))?;
    let next = read(&app)?.patched(patch)?;
    save(&app, &next)?;
    Ok(next)
}
#[tauri::command]
pub(crate) fn reset_preferences(app: AppHandle) -> Result<Preferences, Error> {
    let state = app.state::<PreferencesState>();
    let _guard = state
        .0
        .lock()
        .map_err(|_| Error::new("preferences_error", "Preferences writer failed"))?;
    let next = Preferences::default();
    save(&app, &next)?;
    Ok(next)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configured_flavours_are_explicit_and_instrumentation_stays_test_owned() {
        assert!(validate_identity(TEST_ID).is_ok());
        assert!(validate_identity("au.edu.ldaca.other").is_err());
        assert_eq!(
            validate_identity(PRODUCTION_ID).is_ok(),
            !cfg!(feature = "e2e")
        );
        assert_eq!(validate_identity(DEV_ID).is_ok(), !cfg!(feature = "e2e"));
    }
}
