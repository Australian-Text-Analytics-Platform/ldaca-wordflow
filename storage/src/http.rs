//! The host mounts this API inside its own authentication and origin boundary.
use crate::{Preferences, PreferencesFile, PreferencesPatch};
use axum::{
    Json, Router,
    extract::State,
    response::{IntoResponse, Sse, sse::Event},
};
use futures_util::StreamExt;
use std::sync::Arc;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use utoipa_axum::{router::OpenApiRouter, routes};

#[derive(Clone)]
pub struct PreferencesApi {
    file: Arc<PreferencesFile>,
    changed: watch::Sender<u64>,
    shutdown: CancellationToken,
}
impl PreferencesApi {
    pub fn new(config: &std::path::Path, shutdown: CancellationToken) -> Self {
        Self {
            file: Arc::new(PreferencesFile::new(config)),
            changed: watch::channel(0).0,
            shutdown,
        }
    }
    pub fn router(&self) -> Router {
        contract().with_state(self.clone()).split_for_parts().0
    }
    pub fn changes(&self) -> watch::Receiver<u64> {
        self.changed.subscribe()
    }
}
#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct PreferenceFailure {
    pub code: String,
    pub message: String,
}
#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct PreferenceErrorEnvelope {
    pub error: PreferenceFailure,
}
struct Failure(crate::Error);
impl From<crate::Error> for Failure {
    fn from(error: crate::Error) -> Self {
        Self(error)
    }
}
impl IntoResponse for Failure {
    fn into_response(self) -> axum::response::Response {
        (
            axum::http::StatusCode::BAD_REQUEST,
            Json(PreferenceErrorEnvelope {
                error: PreferenceFailure {
                    code: "preferences_error".into(),
                    message: self.0.to_string(),
                },
            }),
        )
            .into_response()
    }
}
pub fn contract() -> OpenApiRouter<PreferencesApi> {
    OpenApiRouter::new()
        .routes(routes!(get))
        .routes(routes!(patch))
        .routes(routes!(reset))
        .routes(routes!(events))
}
#[utoipa::path(get, path="/api/preferences", operation_id="get_preferences", responses((status=200,body=Preferences),(status=400,body=PreferenceErrorEnvelope)))]
async fn get(State(api): State<PreferencesApi>) -> Result<Json<Preferences>, Failure> {
    let file = api.file.clone();
    let result = tokio::task::spawn_blocking(move || file.read())
        .await
        .map_err(|_| crate::Error::Invalid("Preferences worker failed".into()))??;
    Ok(Json(result))
}
#[utoipa::path(patch, path="/api/preferences", operation_id="patch_preferences", request_body=PreferencesPatch, responses((status=200,body=Preferences),(status=400,body=PreferenceErrorEnvelope)))]
async fn patch(
    State(api): State<PreferencesApi>,
    Json(input): Json<PreferencesPatch>,
) -> Result<Json<Preferences>, Failure> {
    let file = api.file.clone();
    let result = tokio::task::spawn_blocking(move || file.patch(input))
        .await
        .map_err(|_| crate::Error::Invalid("Preferences worker failed".into()))??;
    api.changed.send_modify(|revision| *revision += 1);
    Ok(Json(result))
}
#[utoipa::path(post, path="/api/preferences/reset", operation_id="reset_preferences", responses((status=200,body=Preferences),(status=400,body=PreferenceErrorEnvelope)))]
async fn reset(State(api): State<PreferencesApi>) -> Result<Json<Preferences>, Failure> {
    let file = api.file.clone();
    let result = tokio::task::spawn_blocking(move || file.reset())
        .await
        .map_err(|_| crate::Error::Invalid("Preferences worker failed".into()))??;
    api.changed.send_modify(|revision| *revision += 1);
    Ok(Json(result))
}
#[utoipa::path(get,path="/api/preferences/events",operation_id="preference_events",responses((status=200,body=String,content_type="text/event-stream")))]
async fn events(State(api): State<PreferencesApi>) -> impl IntoResponse {
    let initial = futures_util::stream::once(async {
        Ok::<_, std::convert::Infallible>(Event::default().data("ready"))
    });
    let updates = futures_util::stream::unfold(
        (api.changed.subscribe(), api.shutdown),
        |(mut changed, shutdown)| async move {
            tokio::select! { _ = shutdown.cancelled() => None, result = changed.changed() => {
                result.ok()?;
                let value = *changed.borrow_and_update();
                Some((Ok::<_, std::convert::Infallible>(Event::default().data(value.to_string())),(changed, shutdown)))
            }}
        },
    );
    Sse::new(initial.chain(updates)).keep_alive(axum::response::sse::KeepAlive::default())
}
