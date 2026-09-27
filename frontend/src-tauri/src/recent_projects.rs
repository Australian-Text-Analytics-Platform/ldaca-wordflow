//! macOS owns recent-project history; only successful document operations record URLs.
use std::path::Path;

#[cfg(not(target_os = "macos"))]
pub(crate) fn record(_app: &tauri::AppHandle, _path: Option<&Path>) {}

#[cfg(target_os = "macos")]
pub(crate) fn record(app: &tauri::AppHandle, path: Option<&Path>) {
    let Some(path) = path else { return };
    let path = path.to_owned();
    if let Err(error) = app.run_on_main_thread(move || {
        objc2::rc::autoreleasepool(|_| {
            let Some(url) = file_url(&path) else {
                tracing::warn!(?path, "Could not register recent project URL");
                return;
            };
            // SAFETY: this closure runs on AppKit's main thread; the shared controller
            // lives for the process lifetime and the retained NSURL outlives the call.
            unsafe {
                let controller: *mut objc2::runtime::AnyObject = objc2::msg_send![
                    objc2::class!(NSDocumentController),
                    sharedDocumentController
                ];
                let _: () = objc2::msg_send![controller, noteNewRecentDocumentURL: &*url];
            }
        });
    }) {
        tracing::warn!(%error, "Could not schedule recent project registration");
    }
}

#[cfg(target_os = "macos")]
fn file_url(path: &Path) -> Option<objc2::rc::Retained<objc2::runtime::AnyObject>> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("wfpj"))
    {
        return None;
    }
    let path = CString::new(path.as_os_str().as_bytes()).ok()?;
    // SAFETY: NSURL copies the NUL-terminated filesystem path during the call.
    // Using the filesystem representation avoids URL escaping and lossy UTF-8 conversion.
    unsafe {
        objc2::msg_send![
            objc2::class!(NSURL),
            fileURLWithFileSystemRepresentation: path.as_ptr(),
            isDirectory: false,
            relativeToURL: std::ptr::null::<objc2::runtime::AnyObject>()
        ]
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::{ffi::CStr, os::unix::ffi::OsStrExt};

    #[test]
    fn project_urls_preserve_full_paths_and_special_characters() {
        objc2::rc::autoreleasepool(|_| {
            for path in [
                "/tmp/first/词表 # 100%.wfpj",
                "/tmp/second/词表 # 100%.wfpj",
                "/tmp/Upper.WFPJ",
            ] {
                let url = file_url(Path::new(path)).unwrap();
                // SAFETY: NSURL's filesystem representation remains valid while url is retained.
                unsafe {
                    let bytes: *const std::ffi::c_char =
                        objc2::msg_send![&*url, fileSystemRepresentation];
                    assert_eq!(
                        CStr::from_ptr(bytes).to_bytes(),
                        Path::new(path).as_os_str().as_bytes()
                    );
                }
            }
        });
    }

    #[test]
    fn import_paths_and_relative_paths_are_not_recent_projects() {
        for path in [
            "/tmp/corpus.csv",
            "Untitled",
            "relative.wfpj",
            "/tmp/invalid\0.wfpj",
        ] {
            assert!(file_url(Path::new(path)).is_none());
        }
    }
}
