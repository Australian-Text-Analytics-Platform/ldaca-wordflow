//! Independent survey windows have no project session or remote IPC permissions.
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const SURVEY: &str = "https://sydney.au1.qualtrics.com/jfe/form/SV_0HrF3tzJBz3lQk6";
static NEXT_WINDOW: AtomicU64 = AtomicU64::new(1);

fn survey_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|error| error.to_string())?;
    let base = tauri::Url::parse(SURVEY).expect("static survey URL");
    if url.origin() != base.origin()
        || url.path() != base.path()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("Feedback URL does not match the Wordflow survey".into());
    }
    Ok(url)
}

#[tauri::command]
pub(crate) async fn open_feedback(app: AppHandle, url: String) -> Result<(), String> {
    let url = survey_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let label = format!("feedback-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed));
        WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
            .title("Wordflow feedback")
            .inner_size(760.0, 720.0)
            .min_inner_size(420.0, 420.0)
            .center()
            .build()
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn show_from_menu(app: AppHandle) {
    let mut url = tauri::Url::parse(SURVEY).expect("static survey URL");
    url.query_pairs_mut()
        .append_pair("app_version", &app.package_info().version.to_string())
        .append_pair("deployment", "desktop")
        .append_pair("feature", "Help menu")
        .append_pair("user_role", "anonymous");
    tauri::async_runtime::spawn(async move {
        if let Err(error) = open_feedback(app.clone(), url.into()).await {
            eprintln!("Could not open feedback: {error}");
            app.dialog()
                .message(error)
                .title("Could not open feedback")
                .show(|_| {});
        }
    });
}

#[tauri::command]
pub(crate) fn open_external_link(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http" | "mailto" | "tel") {
        return Err("Unsupported external link".into());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn feedback_is_confined_to_the_survey() {
        assert!(survey_url(&format!("{SURVEY}?feature=Topics")).is_ok());
        for url in [
            "https://example.com",
            "file:///tmp/survey",
            "https://sydney.au1.qualtrics.com/another-form",
            "https://user@sydney.au1.qualtrics.com/jfe/form/SV_0HrF3tzJBz3lQk6",
        ] {
            assert!(survey_url(url).is_err());
        }
    }
}
