//! The same handler registrations own HTTP routing and the exported contract.
use crate::project::{
    annotation, concordance::*, frequency::*, plots::*, quotation::*, topic_modeling::*,
};
use utoipa::OpenApi;

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(untagged)]
pub(crate) enum GraphResponse {
    Logical(crate::project::Graph),
    Dependencies(crate::project::objects::DependencyGraph),
}

#[derive(OpenApi)]
#[openapi(components(schemas(
    crate::api::GraphMode,
    PlotMode,
    crate::project::SqlBatch,
    crate::ai::Connection,
    FrequencyResultV1,
    ConcordanceResultV1,
    QuotationResultV1,
    PlotResultV1,
    TopicResultV1,
    annotation::execution::Report,
    annotation::ReviewSummary,
    annotation::execution::PreviewMetadata,
    annotation::review::LiveMetadata,
    crate::TaskSnapshot,
    crate::project::changes::ChangeScope,
    crate::project::TopicPreviewUpdate
)))]
struct Payloads;

/// Build the contract without starting a runtime or performing project/model/credential I/O.
pub fn document() -> utoipa::openapi::OpenApi {
    let (_, mut document) = crate::api::router().split_for_parts();
    let (_, health) = crate::health_routes().split_for_parts();
    document.merge(health);
    document.merge(Payloads::openapi());
    document.info =
        utoipa::openapi::Info::new("Wordflow native HTTP API", env!("CARGO_PKG_VERSION"));
    document.info.description = Some("Generated from Rust handlers and serialization types. Run pnpm api:generate; do not edit this document manually.".into());
    document
}

pub struct Binary;
impl utoipa::PartialSchema for Binary {
    fn schema() -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
        utoipa::openapi::schema::ObjectBuilder::new()
            .schema_type(utoipa::openapi::schema::Type::String)
            .format(Some(utoipa::openapi::schema::SchemaFormat::KnownFormat(
                utoipa::openapi::schema::KnownFormat::Binary,
            )))
            .into()
    }
}
impl utoipa::ToSchema for Binary {}

/// Literal strings used by existing serializers without changing their Rust representation.
pub(crate) fn string_enum(values: &[&str]) -> utoipa::openapi::schema::Object {
    utoipa::openapi::schema::ObjectBuilder::new()
        .schema_type(utoipa::openapi::schema::Type::String)
        .enum_values(Some(values.iter().copied()))
        .build()
}

/// A flattened field's closed object must allow its sibling fields in an allOf.
/// Ordinary, unflattened schemas retain Serde's deny_unknown_fields contract.
pub(crate) fn flattened<T: utoipa::PartialSchema>()
-> utoipa::openapi::RefOr<utoipa::openapi::Schema> {
    let mut schema = T::schema();
    if let utoipa::openapi::RefOr::T(utoipa::openapi::Schema::Object(object)) = &mut schema {
        object.additional_properties = None;
    }
    schema
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use serde_json::{Value, json};
    use tower::ServiceExt;

    #[test]
    fn document_is_deterministic_and_complete_without_a_runtime() {
        let first = serde_json::to_value(document()).unwrap();
        assert_eq!(first, serde_json::to_value(document()).unwrap());
        assert_eq!(first["openapi"], "3.1.0");
        assert_eq!(first["info"]["version"], env!("CARGO_PKG_VERSION"));
        let mut operations = std::collections::HashSet::new();
        for (path, methods) in first["paths"].as_object().unwrap() {
            for operation in methods.as_object().unwrap().values() {
                assert!(operations.insert(operation["operationId"].as_str().unwrap()));
                for parameter in operation["parameters"].as_array().into_iter().flatten() {
                    if parameter["in"] == "path" {
                        assert!(
                            path.contains(&format!("{{{}}}", parameter["name"].as_str().unwrap()))
                        );
                        assert_eq!(parameter["required"], true);
                    }
                }
            }
        }
        assert_eq!(operations.len(), 100);
        assert_eq!(
            first["components"]["schemas"]["FrequencyCorpus"]["properties"]["total_tokens"]["type"],
            "string"
        );
        assert!(first["paths"]["/api/project/nodes/{table_name}/schema"]["get"]["responses"]["200"]["content"]
            .get("application/vnd.apache.arrow.stream").is_some());
        assert!(
            first["paths"]["/api/project/events"]["get"]["responses"]["200"]["content"]
                .get("text/event-stream")
                .is_some()
        );
    }

    #[tokio::test]
    async fn real_status_extraction_and_origin_responses_keep_the_documented_envelopes() {
        let runtime = crate::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
        let app = crate::router(vec![], tokio_util::sync::CancellationToken::new(), runtime);
        let status = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/project")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(status.status(), 200);
        let value: Value =
            serde_json::from_slice(&to_bytes(status.into_body(), 8192).await.unwrap()).unwrap();
        assert_eq!(value, json!({"project": null}));
        let malformed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/project/tabs")
                    .header("content-type", "application/json")
                    .body(Body::from("{"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(malformed.status(), 400);
        let value: Value =
            serde_json::from_slice(&to_bytes(malformed.into_body(), 8192).await.unwrap()).unwrap();
        assert_eq!(value["error"]["code"], "invalid_request");
        let rejected = app
            .oneshot(
                Request::builder()
                    .uri("/health/live")
                    .header("origin", "https://untrusted.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(rejected.status(), 403);
        let value: Value =
            serde_json::from_slice(&to_bytes(rejected.into_body(), 8192).await.unwrap()).unwrap();
        assert_eq!(
            value,
            json!({"error": {"code":"origin_not_allowed", "message":"Origin is not allowed"}})
        );
    }

    #[test]
    fn nullable_and_defaulted_serde_values_agree_with_schema_required_fields() {
        let doc = serde_json::to_value(document()).unwrap();
        let schemas = &doc["components"]["schemas"];
        assert!(
            schemas["ProjectStatus"]["required"]
                .as_array()
                .unwrap()
                .contains(&json!("project"))
        );
        assert!(schemas["ConcordanceSearch"].get("required").is_none());
        let search: ConcordanceSearch = serde_json::from_value(json!({})).unwrap();
        assert_eq!(
            serde_json::to_value(search).unwrap(),
            json!({
                "mode":"text", "query":"", "whole_word":true, "regex":false,
                "case_sensitive":false, "ignore_punctuation":true, "left_context":10, "right_context":10
            })
        );
        let error = serde_json::to_value(crate::Error::invalid("bad")).unwrap();
        assert_eq!(error, json!({"code":"invalid_request","message":"bad"}));
        assert!(
            !schemas["Error"]["required"]
                .as_array()
                .unwrap()
                .contains(&json!("statement_index"))
        );
    }
}
