"""Data Editor column tools and their preview (issue 143)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import polars as pl
from fastapi.testclient import TestClient

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings


def _setup(tmp_path: Path) -> tuple[TestClient, dict[str, str], str, str]:
    settings = Settings(
        data_root=tmp_path,
        multi_user=False,
        session_cookie_secure=False,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
    )
    client = TestClient(
        create_app(settings, serve_frontend=False), base_url="http://testserver"
    )
    client.__enter__()
    csrf = client.get("/api/session").json()["csrf_token"]
    unsafe = {"Origin": "http://testserver", "X-CSRF-Token": csrf}
    client.post(
        "/api/user-files/uploads",
        params={"path": "speeches.csv"},
        content=b"id,text,party\n1,  Hello World  ,Labor\n2,plain,Greens\n3,  a-b-c ,Labor\n",
        headers={**unsafe, "Content-Type": "application/octet-stream"},
    )
    workspace_id = client.post(
        "/api/workspaces", json={"name": "Editor"}, headers=unsafe
    ).json()["id"]
    client.put(f"/api/workspaces/{workspace_id}/open", headers=unsafe)
    node_id = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": "speeches.csv"},
        headers=unsafe,
    ).json()["id"]
    return client, unsafe, workspace_id, node_id


def test_preview_reports_changed_rows_without_applying(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        base = f"/api/workspaces/{workspace_id}/nodes/{node_id}"
        preview = client.post(
            f"{base}/edits/preview",
            json={"kind": "clean_text", "column": "text", "operation": "trim"},
            headers=unsafe,
        )
        assert preview.status_code == 200, preview.text
        # Two of three rows have surrounding spaces.
        assert preview.headers["x-wordflow-changed-rows"] == "2"
        frame = pl.read_ipc_stream(BytesIO(preview.content))
        assert frame["text"].to_list() == ["Hello World", "plain", "a-b-c"]
        schema = client.get(f"{base}/schema")
        # The preview did not change the Data Block.
        assert list(pl.read_ipc_stream(BytesIO(schema.content)).schema) == [
            "id",
            "text",
            "party",
        ]
        rows = client.post(
            f"{base}/edits/preview",
            json={"kind": "duplicate_column", "column": "party"},
            headers=unsafe,
        )
        assert rows.headers["x-wordflow-changed-rows"] == "3"
        assert pl.read_ipc_stream(BytesIO(rows.content)).columns == [
            "id",
            "text",
            "party",
            "party copy",
        ]
        assert client.get(base).json()["can_undo"] is False
    finally:
        client.__exit__(None, None, None)


def test_duplicate_split_and_clean_apply_as_single_edits(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        base = f"/api/workspaces/{workspace_id}/nodes/{node_id}"

        def columns() -> list[str]:
            return list(
                pl.read_ipc_stream(BytesIO(client.get(f"{base}/schema").content)).schema
            )

        for body in (
            {"kind": "duplicate_column", "column": "text"},
            {"kind": "duplicate_column", "column": "text"},
            {"kind": "split_column", "column": "party", "delimiter": "b", "parts": 2},
            {
                "kind": "clean_text",
                "column": "text",
                "operation": "uppercase",
                "output_column": "loud",
            },
        ):
            response = client.post(f"{base}/edits", json=body, headers=unsafe)
            assert response.status_code == 200, response.text
        assert columns() == [
            "id",
            "text",
            "loud",
            "text copy 2",
            "text copy",
            "party",
            "party_1",
            "party_2",
        ]
        undone = client.post(f"{base}/undo", headers=unsafe)
        assert undone.status_code == 200
        assert "loud" not in columns()
    finally:
        client.__exit__(None, None, None)
