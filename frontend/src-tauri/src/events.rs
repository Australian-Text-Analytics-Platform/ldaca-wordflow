use serde::Serialize;
use tauri::{Emitter, Runtime, WebviewWindow};

pub(crate) fn emit_to_window<R: Runtime>(
    window: &WebviewWindow<R>,
    event: &str,
    payload: impl Serialize + Clone,
) -> tauri::Result<()> {
    // `emit` broadcasts even on a window. Target its label to include the
    // Window listeners used by getCurrentWindow().listen in the webview.
    window.emit_to(window.label(), event, payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, Mutex};
    use tauri::{Listener, WebviewWindowBuilder};

    #[test]
    fn project_events_reach_only_the_owning_window() {
        let app = tauri::test::mock_app();
        let windows = ["project-0", "project-1"].map(|label| {
            WebviewWindowBuilder::new(&app, label, Default::default())
                .build()
                .unwrap()
        });
        let events = [
            (
                "backend-status",
                json!({"status": "ready", "url": "http://127.0.0.1:1234"}),
            ),
            (
                "backend-status",
                json!({"status": "failed", "error": {"code": "duckdb_error", "message": "Conflicting lock"}}),
            ),
            ("backend-status", json!({"status": "stopping"})),
            ("backend-status", json!({"status": "stopped"})),
            ("focus-table-editor", json!(null)),
            (
                "project-error",
                json!({"code": "desktop_error", "message": "Save failed"}),
            ),
            (
                "project-changed",
                json!({"title": "Saved", "path": "/tmp/Saved.wfpj"}),
            ),
        ];
        let received = windows.each_ref().map(|window| {
            let received = Arc::new(Mutex::new(Vec::new()));
            // getCurrentWindow().listen in JavaScript uses the Window target.
            let listener = window.as_ref().window();
            for name in [
                "backend-status",
                "project-error",
                "project-changed",
                "focus-table-editor",
            ] {
                let received = received.clone();
                listener.listen(name, move |event| {
                    let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap();
                    received.lock().unwrap().push((name, payload));
                });
            }
            received
        });

        for (owner, window) in windows.iter().enumerate() {
            for (name, payload) in &events {
                emit_to_window(window, name, payload).unwrap();
            }
            assert_eq!(*received[owner].lock().unwrap(), events);
            assert!(received[1 - owner].lock().unwrap().is_empty());
            received[owner].lock().unwrap().clear();
        }
    }
}
