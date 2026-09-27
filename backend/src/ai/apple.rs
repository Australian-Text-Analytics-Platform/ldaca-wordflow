//! Small in-process Swift bridge. No helper server, document files or persistent sessions.
#[cfg(target_os = "macos")]
use super::ConnectionInfo;
use super::{Connection, CredentialMode, Provider};
use crate::{Error, error::Result};
use uuid::Uuid;
pub(super) const ID: Uuid = Uuid::from_u128(0x63e0749e_9d2b_4eae_ae4d_77436fda5f32);
pub(super) fn connection() -> Connection {
    Connection {
        id: ID,
        revision: ID,
        name: "Apple Foundation Models (on-device)".into(),
        provider: Provider::Apple,
        endpoint: None,
        credential_mode: CredentialMode::None,
    }
}
#[cfg(target_os = "macos")]
pub(super) fn info() -> ConnectionInfo {
    ConnectionInfo {
        connection: connection(),
        has_credential: false,
        credential_error: availability().err(),
        built_in: true,
    }
}
pub(super) fn availability() -> Result<()> {
    #[cfg(target_os = "macos")]
    let status = unsafe { wordflow_fm_available() };
    #[cfg(not(target_os = "macos"))]
    let status = 1;
    let message = match status {
        0 => return Ok(()),
        1 => "Apple Foundation Models requires macOS 26 or later",
        2 => "Apple Foundation Models requires an Apple Intelligence-capable Mac",
        3 => "Enable Apple Intelligence in System Settings to use the on-device model",
        4 => "The Apple system model is not ready. Wait for its system download to finish",
        _ => "This build requires the macOS 26 or later SDK to support Apple Foundation Models",
    };
    Err(Error::new("provider_unavailable", message))
}
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn wordflow_fm_available() -> i32;
    fn wordflow_fm_start(
        input: *const std::ffi::c_char,
        context: *mut std::ffi::c_void,
        callback: unsafe extern "C" fn(*mut std::ffi::c_void, i32, *const std::ffi::c_char),
    ) -> *mut std::ffi::c_void;
    fn wordflow_fm_cancel(handle: *mut std::ffi::c_void);
    fn wordflow_fm_release(handle: *mut std::ffi::c_void);
}
#[cfg(target_os = "macos")]
pub(super) async fn complete(
    system: &str,
    documents: &str,
    codes: &[super::inference::Label],
    count: usize,
    temperature: Option<f64>,
    cancellation: &tokio_util::sync::CancellationToken,
) -> std::result::Result<String, (i32, Error)> {
    use std::ffi::{CStr, CString, c_char, c_void};
    use tokio::sync::oneshot;
    type Response = (i32, String);
    unsafe extern "C" fn callback(context: *mut c_void, code: i32, output: *const c_char) {
        // Swift calls exactly once and borrows its output only for this callback.
        let send = unsafe { Box::from_raw(context.cast::<oneshot::Sender<Response>>()) };
        let text = unsafe { CStr::from_ptr(output) }
            .to_string_lossy()
            .into_owned();
        let _ = send.send((code, text));
    }
    struct Handle(usize);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                wordflow_fm_cancel(self.0 as *mut c_void);
                wordflow_fm_release(self.0 as *mut c_void);
            }
        }
    }
    let input=CString::new(serde_json::json!({"instructions":system,"documents":documents,"count":count,"codes":codes.iter().map(|c|&c.code).collect::<Vec<_>>(),"temperature":temperature}).to_string()).map_err(|_|(1,Error::invalid("Invalid Apple model input")))?;
    let (send, mut receive) = oneshot::channel();
    let handle = Handle(unsafe {
        wordflow_fm_start(
            input.as_ptr(),
            Box::into_raw(Box::new(send)).cast(),
            callback,
        )
    } as usize);
    let interrupted = tokio::select! {
        result=&mut receive => return finish(result),
        _=cancellation.cancelled()=>Error::new("interrupted","Apple Foundation Models request cancelled"),
        _=tokio::time::sleep(std::time::Duration::from_secs(300))=>Error::new("annotation_provider_timeout","Apple Foundation Models timed out; inference was not retried"),
    };
    unsafe {
        wordflow_fm_cancel(handle.0 as *mut c_void);
    }
    // Keep runtime ownership until Foundation Models acknowledges cancellation and finishes cleanup.
    let _ = receive.await;
    Err((5, interrupted))
}
#[cfg(target_os = "macos")]
fn finish(
    value: std::result::Result<(i32, String), tokio::sync::oneshot::error::RecvError>,
) -> std::result::Result<String, (i32, Error)> {
    match value {
        Ok((0, text)) => Ok(text),
        Ok((code, text)) => Err((
            code,
            Error::new(
                if code == 6 {
                    "interrupted"
                } else {
                    "annotation_apple_model_error"
                },
                text,
            ),
        )),
        Err(_) => Err((
            1,
            Error::new(
                "worker_failed",
                "Apple Foundation Models response unavailable",
            ),
        )),
    }
}
#[cfg(not(target_os = "macos"))]
pub(super) async fn complete(
    _: &str,
    _: &str,
    _: &[super::inference::Label],
    _: usize,
    _: Option<f64>,
    _: &tokio_util::sync::CancellationToken,
) -> std::result::Result<String, (i32, Error)> {
    Err((
        1,
        Error::new(
            "provider_unavailable",
            "Apple Foundation Models requires macOS 26 or later",
        ),
    ))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Requires an enabled local Apple Intelligence model and system service access"]
    async fn live_apple_annotation_structured_output_and_cancellation() {
        use crate::ai::{
            AiConfiguration,
            inference::{Inference, Label, Prediction, Reasoning},
        };
        let start = std::time::Instant::now();
        availability().unwrap();
        let engine=AiConfiguration::session_only().prepare_inference(&reqwest::Client::new(),Inference {
            provider: ID,model:"system".into(),prompt:"Assign TRANSPORT for travel infrastructure and HEALTH for medical care. Use no code for unrelated text.".into(),temperature:Some(0.0),reasoning:Reasoning::Default,batch_size:20,retries:0,concurrency:1,
        }).await.unwrap();
        let codes = vec![
            Label {
                code: "TRANSPORT".into(),
                description: "Roads, buses and train travel".into(),
            },
            Label {
                code: "HEALTH".into(),
                description: "Hospitals and medical treatment".into(),
            },
        ];
        let text = vec![
            "The city added a new bus route.".into(),
            "The hospital opened a vaccination clinic.".into(),
            "The city added a new bus route.".into(),
        ];
        let output = engine
            .predict(
                &text,
                &codes,
                &[],
                &tokio_util::sync::CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(output.len(), 3);
        assert!(
            matches!(&output[0],Prediction::Success{label:Some(label)} if label=="TRANSPORT"),
            "{output:?}"
        );
        assert!(
            matches!(&output[1],Prediction::Success{label:Some(label)} if label=="HEALTH"),
            "{output:?}"
        );
        assert!(
            matches!(&output[2],Prediction::Success{label:Some(label)} if label=="TRANSPORT"),
            "{output:?}"
        );
        eprintln!("Apple structured batch: {:?}", start.elapsed());
        let cancel = tokio_util::sync::CancellationToken::new();
        let cancellation = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            cancellation.cancel();
        });
        let start = std::time::Instant::now();
        assert_eq!(
            engine
                .predict(&text, &codes, &[], &cancel)
                .await
                .unwrap_err()
                .code,
            "interrupted"
        );
        eprintln!("Apple in-flight cancellation: {:?}", start.elapsed());
    }
}
