"""Generated-client schema, media types, discriminators and credential contracts."""


from __future__ import annotations

from typing import Any
import json
from ldaca_wordflow.asgi import app
from ldaca_wordflow.spa import _runtime_config_js

HTTP_METHODS = {"delete", "get", "patch", "post", "put"}


def _operations():
    return [
        (path, method, operation)
        for path, methods in app.openapi()["paths"].items()
        for method, operation in methods.items()
        if method in HTTP_METHODS
    ]


def test_operation_ids_are_unique() -> None:
    operation_ids = [operation["operationId"] for _, _, operation in _operations()]
    assert len(operation_ids) == len(set(operation_ids))


def test_cookie_security_is_explicit_and_no_bearer_or_query_token_is_advertised() -> (
    None
):
    schema = app.openapi()
    assert schema["components"]["securitySchemes"] == {
        "WordflowSession": {
            "type": "apiKey",
            "description": "HttpOnly hosted-browser session cookie",
            "in": "cookie",
            "name": "wordflow_session",
        }
    }

    public = {
        ("GET", "/health/live"),
        ("GET", "/health/ready"),
        ("GET", "/api/data-root"),
        ("PUT", "/api/data-root"),
        ("GET", "/api/auth/cilogon/login"),
        ("GET", "/api/auth/cilogon/callback"),
        ("POST", "/api/auth/google/callback"),
    }
    optional_cookie = {("GET", "/api/session")}
    for path, method, operation in _operations():
        method = method.upper()
        operation = schema["paths"][path][method.lower()]
        if (method, path) in public:
            assert "security" not in operation
        elif (method, path) in optional_cookie:
            assert operation["security"] == [{}, {"WordflowSession": []}]
        else:
            assert operation["security"] == [{"WordflowSession": []}]
        parameter_names = {
            str(parameter.get("name", "")).lower()
            for parameter in operation.get("parameters", [])
        }
        assert "authorization" not in parameter_names
        assert "token" not in parameter_names


def test_transient_provider_secrets_are_write_only_and_absent_from_resources() -> None:
    schemas = app.openapi()["components"]["schemas"]
    data_portal_patch = schemas["DataPortalCredentialPatch"]["properties"]
    assert set(data_portal_patch) == {"data_portal_api_token"}
    assert data_portal_patch["data_portal_api_token"]["anyOf"][0]["writeOnly"] is True

    for schema_name in (
        "AnnotationProviderConfigurationCreate",
        "AnnotationProviderConfigurationUpdate",
    ):
        field = schemas[schema_name]["properties"]["api_key"]
        assert field["anyOf"][0]["format"] == "password"
        assert field["anyOf"][0]["writeOnly"] is True

    for schema_name, field_name in (
        ("AnnotationModelsRequest", "api_key"),
        ("AnnotationAnalysisSubmission", "api_key"),
        ("AnnotationRunAllSubmission", "api_key"),
        ("DataPortalFeaturedRequest", "api_token"),
        ("DataPortalSearchRequest", "api_token"),
        ("DataPortalImportSubmitRequest", "api_token"),
    ):
        field = schemas[schema_name]["properties"][field_name]
        assert field["writeOnly"] is True
        assert field["anyOf"][0]["format"] == "password"
        assert field["anyOf"][0]["writeOnly"] is True

    assert "api_key" not in schemas["AnnotationAnalysisRequest"]["properties"]
    assert "api_token" not in schemas["DataPortalUserFileImportRequest"]["properties"]


def test_spa_runtime_config_contains_only_the_reverse_proxy_base_path() -> None:
    script = _runtime_config_js("/user/example/proxy/3000/")
    prefix = "window.__WORDFLOW_CONFIG__ = "
    assert script.startswith(prefix)
    assert script.endswith(";")
    assert json.loads(script.removeprefix(prefix).removesuffix(";")) == {
        "basePath": "/user/example/proxy/3000",
    }


def _success_responses() -> list[tuple[str, str, str, dict[str, Any]]]:
    return [
        (path, method, code, response)
        for path, path_item in app.openapi()["paths"].items()
        for method, operation in path_item.items()
        if method in HTTP_METHODS
        for code, response in operation["responses"].items()
        if code.startswith("2") or code.startswith("3")
    ]


def test_every_success_response_is_typed_or_declares_its_stream_media() -> None:
    missing = []
    for path, method, code, response in _success_responses():
        if code == "204" or code.startswith("3"):
            continue
        content = response.get("content", {})
        if not content:
            missing.append((method.upper(), path, code))
            continue
        for media_type, media in content.items():
            schema = media.get("schema", {})
            if not schema and media_type != "text/event-stream":
                missing.append((method.upper(), path, code, media_type))
    assert missing == []


def test_file_archive_artifact_and_sse_media_types_are_documented() -> None:
    schema = app.openapi()["paths"]
    assert (
        "application/octet-stream"
        in schema["/api/user-files/content"]["get"]["responses"]["200"]["content"]
    )
    assert (
        "application/zip"
        in schema["/api/workspaces/{workspace_id}/archive"]["get"]["responses"]["200"][
            "content"
        ]
    )
    assert (
        "application/octet-stream"
        in schema[
            "/api/workspaces/{workspace_id}/analyses/{analysis_id}/artifacts/{artifact_name}"
        ]["get"]["responses"]["200"]["content"]
    )
    assert (
        "text/event-stream"
        in schema["/api/events"]["get"]["responses"]["200"]["content"]
    )


def test_analysis_requests_results_and_queries_are_discriminated() -> None:
    paths = app.openapi()["paths"]
    analysis_create = app.openapi()["components"]["schemas"]["AnalysisCreate"]
    definitions = (
        analysis_create["properties"]["request"],
        paths["/api/workspaces/{workspace_id}/analyses/{analysis_id}/result/query"][
            "post"
        ]["requestBody"]["content"]["application/json"]["schema"],
        paths["/api/workspaces/{workspace_id}/analyses/{analysis_id}/result"]["get"][
            "responses"
        ]["200"]["content"]["application/json"]["schema"],
    )
    for definition in definitions:
        assert "oneOf" in definition
        assert definition["discriminator"]["propertyName"] == "kind"


def test_result_projection_variants_are_discriminated_and_strict() -> None:
    schemas = app.openapi()["components"]["schemas"]
    expected = {
        "AnnotationResultProjection": {"ready", "queried"},
        "ConcordanceResultProjection": {"ready", "queried"},
        "ConcordanceRunAllProjection": {"source", "group"},
    }
    for name, variants in expected.items():
        projection = schemas[name]
        assert projection["discriminator"]["propertyName"] == "variant"
        assert set(projection["discriminator"]["mapping"]) == variants
        assert len(projection["oneOf"]) == len(variants)

    assert schemas["QuotationResult"]["properties"]["result"] == {
        "$ref": "#/components/schemas/PreviewReadyResult"
    }
    assert schemas["PreviewReadyResult"]["required"] == ["variant"]


def test_quotation_preview_query_is_a_dedicated_arrow_contract() -> None:
    schema = app.openapi()
    path = schema["paths"][
        "/api/workspaces/{workspace_id}/analyses/{analysis_id}/result/tables/quotation-preview/query"
    ]["post"]
    assert "application/vnd.apache.arrow.stream" in path["responses"]["200"]["content"]
    body = schema["components"]["schemas"]["QuotationPreviewQuery"]["properties"]
    assert body["page"]["default"] == 1
    assert body["page_size"]["default"] == 50
    assert body["page_size"]["maximum"] == 500

    generic = schema["paths"][
        "/api/workspaces/{workspace_id}/analyses/{analysis_id}/result/query"
    ]["post"]["requestBody"]["content"]["application/json"]["schema"]
    refs = {branch["$ref"] for branch in generic["oneOf"]}
    assert "#/components/schemas/QuotationPreviewQuery" not in refs


def test_annotation_requests_share_one_annotation_class_schema() -> None:
    schemas = app.openapi()["components"]["schemas"]
    annotation_class_schemas = [
        name
        for name, definition in schemas.items()
        if definition.get("title") == "AnnotationClass"
    ]

    assert annotation_class_schemas == ["AnnotationClass"]
    expected_ref = {"$ref": "#/components/schemas/AnnotationClass"}
    for request_name in (
        "AnnotationAnalysisRequest",
        "AnnotationAnalysisSubmission",
    ):
        assert schemas[request_name]["properties"]["classes"]["items"] == expected_ref


def test_storage_policy_is_a_strict_discriminated_resource() -> None:
    schema = app.openapi()["paths"]["/api/storage"]["get"]["responses"]["200"]
    resource = schema["content"]["application/json"]["schema"]

    assert len(resource["oneOf"]) == 2
    assert resource["discriminator"]["propertyName"] == "policy"


def test_workspace_catalogue_is_a_discriminated_union() -> None:
    schema = app.openapi()
    collection = schema["paths"]["/api/workspaces"]["get"]["responses"]["200"]
    item = collection["content"]["application/json"]["schema"]["items"]

    assert item["discriminator"]["propertyName"] == "availability"
    assert item["discriminator"]["mapping"] == {
        "available": "#/components/schemas/AvailableWorkspaceListItem",
        "unavailable": "#/components/schemas/UnavailableWorkspaceListItem",
    }
    assert len(item["oneOf"]) == 2


def test_tab_settings_and_availability_are_discriminated() -> None:
    schema = app.openapi()
    tab = schema["components"]["schemas"]["Tab"]
    assert tab["properties"]["settings"] == {"$ref": "#/components/schemas/TabSettings"}
    settings = schema["components"]["schemas"]["TabSettings"]
    assert settings["discriminator"]["propertyName"] == "kind"
    assert set(settings["discriminator"]["mapping"]) == {
        "annotation",
        "concordance",
        "quotation",
        "sequential",
        "token_frequency",
        "topic_modeling",
    }
    collection = schema["paths"]["/api/workspaces/{workspace_id}/tabs"]["get"]
    response = collection["responses"]["200"]["content"]["application/json"]["schema"]
    assert response["type"] == "array"
    assert response["items"] == {"$ref": "#/components/schemas/TabResource"}
    item = schema["components"]["schemas"]["TabResource"]
    assert item["discriminator"] == {
        "propertyName": "availability",
        "mapping": {
            "available": "#/components/schemas/Tab",
            "unavailable": "#/components/schemas/UnavailableTab",
        },
    }


def test_pagination_is_one_based_everywhere_it_is_exposed() -> None:
    schemas = app.openapi()["components"]["schemas"]
    paged = [
        definition
        for definition in schemas.values()
        if isinstance(definition, dict)
        and isinstance(definition.get("properties"), dict)
        and "page" in definition["properties"]
    ]
    assert paged
    for definition in paged:
        page = definition["properties"]["page"]
        minimum = page.get("minimum")
        if minimum is None:
            minimum = next(
                option.get("minimum")
                for option in page.get("anyOf", [])
                if option.get("type") == "integer"
            )
        assert minimum == 1


def test_quotation_engine_selection_is_required_and_discriminated() -> None:
    schemas = app.openapi()["components"]["schemas"]

    request = schemas["QuotationAnalysisRequest"]
    assert "engine" in request["required"]
    assert schemas["QuotationEngineSelection"] == {
        "discriminator": {
            "propertyName": "type",
            "mapping": {
                "local": "#/components/schemas/LocalQuotationEngineSelection",
                "remote": "#/components/schemas/RemoteQuotationEngineSelection",
            },
        },
        "oneOf": [
            {"$ref": "#/components/schemas/LocalQuotationEngineSelection"},
            {"$ref": "#/components/schemas/RemoteQuotationEngineSelection"},
        ],
    }
    assert schemas["RemoteQuotationEngineSelection"]["required"] == [
        "type",
        "engine_id",
    ]


def test_every_validation_response_uses_the_safe_api_error_contract() -> None:
    """FastAPI's input-bearing validation schema must never leak into OpenAPI."""

    schema = app.openapi()
    validation_refs = {
        response["content"]["application/json"]["schema"].get("$ref")
        for path_item in schema["paths"].values()
        for method, operation in path_item.items()
        if method in HTTP_METHODS
        for code, response in operation["responses"].items()
        if code == "422"
    }
    assert validation_refs == {"#/components/schemas/ApiError"}
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    assert "ValidationError" not in schema["components"]["schemas"]


def test_public_json_supports_recursive_values() -> None:
    """Generated clients can represent nested JSON values."""

    schemas = app.openapi()["components"]["schemas"]
    for name in ("JsonData-Input", "JsonData-Output"):
        branches = schemas[name].get("anyOf", [])
        assert {branch.get("type") for branch in branches} >= {
            "array",
            "boolean",
            "integer",
            "null",
            "number",
            "object",
            "string",
        }
