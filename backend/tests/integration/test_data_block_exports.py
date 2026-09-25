"""End-to-end contracts for single-file and bundled Data Block export."""

from __future__ import annotations

import io
import zipfile

import polars as pl
from fastapi.testclient import TestClient


def _create_workspace(client: TestClient) -> str:
    workspace = client.post("/api/workspaces", json={"name": "Export Workspace"})
    assert workspace.status_code == 201
    workspace_id = workspace.json()["id"]
    opened = client.put(f"/api/workspaces/{workspace_id}/open")
    assert opened.status_code == 200
    return workspace_id


def _create_node(
    client: TestClient,
    workspace_id: str,
    *,
    file_path: str,
    name: str,
) -> str:
    uploaded = client.post(
        "/api/user-files/uploads",
        params={"path": file_path},
        content=b"text,count\nhello,1\nworld,2\n",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 201
    created = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": file_path, "name": name},
    )
    assert created.status_code == 201
    return created.json()["id"]


def _read_export(format_name: str, content: bytes) -> pl.DataFrame:
    source = io.BytesIO(content)
    if format_name == "csv":
        return pl.read_csv(source)
    if format_name == "xlsx":
        return pl.read_excel(source)
    if format_name == "json":
        return pl.read_json(source)
    return pl.read_parquet(source)


def test_single_data_block_export_returns_the_requested_file_format(
    files_test_client: TestClient,
) -> None:
    workspace_id = _create_workspace(files_test_client)
    node_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="single.csv",
        name="Single data",
    )
    formats = {
        "csv": (".csv", "text/csv"),
        "xlsx": (
            ".xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
        "json": (".json", "application/json"),
        "parquet": (".parquet", "application/vnd.apache.parquet"),
    }

    for format_name, (extension, media_type) in formats.items():
        response = files_test_client.post(
            f"/api/workspaces/{workspace_id}/nodes/exports",
            json={"node_ids": [node_id], "format": format_name},
        )

        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith(media_type)
        assert extension in response.headers["content-disposition"]
        assert _read_export(format_name, response.content).to_dicts() == [
            {"text": "hello", "count": 1},
            {"text": "world", "count": 2},
        ]


def test_multiple_data_blocks_export_as_one_backend_built_zip(
    files_test_client: TestClient,
) -> None:
    workspace_id = _create_workspace(files_test_client)
    first_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="first.csv",
        name="Same Name",
    )
    second_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="second.csv",
        name="Same Name",
    )

    response = files_test_client.post(
        f"/api/workspaces/{workspace_id}/nodes/exports",
        json={"node_ids": [second_id, first_id], "format": "parquet"},
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "Export_Workspace_data_blocks.zip" in response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.namelist() == ["Same_Name.parquet", "Same_Name_2.parquet"]
        for name in archive.namelist():
            assert pl.read_parquet(io.BytesIO(archive.read(name))).shape == (2, 2)


def test_data_block_export_rejects_invalid_selection(
    files_test_client: TestClient,
) -> None:
    workspace_id = _create_workspace(files_test_client)
    node_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="valid.csv",
        name="Valid",
    )

    duplicate = files_test_client.post(
        f"/api/workspaces/{workspace_id}/nodes/exports",
        json={"node_ids": [node_id, node_id], "format": "csv"},
    )
    missing = files_test_client.post(
        f"/api/workspaces/{workspace_id}/nodes/exports",
        json={"node_ids": ["00000000-0000-0000-0000-000000000000"], "format": "csv"},
    )

    assert duplicate.status_code == 422
    assert missing.status_code == 404


def test_csv_export_starts_with_a_utf8_byte_order_mark(
    files_test_client: TestClient,
) -> None:
    """Issue 169: Excel reads BOM-less CSV as Windows-1252."""

    workspace_id = _create_workspace(files_test_client)
    node_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="bom.csv",
        name="BOM data",
    )

    response = files_test_client.post(
        f"/api/workspaces/{workspace_id}/nodes/exports",
        json={"node_ids": [node_id], "format": "csv"},
    )

    assert response.status_code == 200, response.text
    assert response.content.startswith(b"\xef\xbb\xbftext,count")


def test_data_block_export_no_longer_offers_ndjson_or_arrow(
    files_test_client: TestClient,
) -> None:
    workspace_id = _create_workspace(files_test_client)
    node_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="retired.csv",
        name="Retired formats",
    )

    for format_name in ("ndjson", "ipc"):
        response = files_test_client.post(
            f"/api/workspaces/{workspace_id}/nodes/exports",
            json={"node_ids": [node_id], "format": format_name},
        )
        assert response.status_code == 422


def test_excel_export_explains_when_a_block_is_too_large(
    files_test_client: TestClient, monkeypatch
) -> None:
    from ldaca_wordflow.services import data_block_exports

    monkeypatch.setattr(data_block_exports, "_EXCEL_MAX_ROWS", 2)
    workspace_id = _create_workspace(files_test_client)
    node_id = _create_node(
        files_test_client,
        workspace_id,
        file_path="large.csv",
        name="Large data",
    )

    response = files_test_client.post(
        f"/api/workspaces/{workspace_id}/nodes/exports",
        json={"node_ids": [node_id], "format": "xlsx"},
    )

    assert response.status_code == 400
    assert "CSV or Parquet" in response.text
