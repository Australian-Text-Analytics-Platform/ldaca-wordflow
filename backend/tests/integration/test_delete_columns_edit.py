"""Deleting several columns is one Data Block Edit and one Undo (#141)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import polars as pl
from fastapi.testclient import TestClient

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings


def _columns(client: TestClient, workspace_id: str, node_id: str) -> list[str]:
    schema = client.get(f"/api/workspaces/{workspace_id}/nodes/{node_id}/schema")
    return list(pl.read_ipc_stream(BytesIO(schema.content)).schema)


def test_delete_columns_is_one_edit_and_keeps_a_column(tmp_path: Path) -> None:
    settings = Settings(
        data_root=tmp_path,
        multi_user=False,
        session_cookie_secure=False,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
    )
    with TestClient(
        create_app(settings, serve_frontend=False),
        base_url="http://testserver",
    ) as client:
        csrf = client.get("/api/session").json()["csrf_token"]
        unsafe = {"Origin": "http://testserver", "X-CSRF-Token": csrf}
        client.post(
            "/api/user-files/uploads",
            params={"path": "speeches.csv"},
            content=b"text,year,party,notes\nhello,2020,Labor,x\n",
            headers={**unsafe, "Content-Type": "application/octet-stream"},
        )
        workspace_id = client.post(
            "/api/workspaces", json={"name": "Columns"}, headers=unsafe
        ).json()["id"]
        client.put(f"/api/workspaces/{workspace_id}/open", headers=unsafe)
        node_id = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={"kind": "file", "file_path": "speeches.csv"},
            headers=unsafe,
        ).json()["id"]
        edits = f"/api/workspaces/{workspace_id}/nodes/{node_id}/edits"

        deleted = client.post(
            edits,
            json={"kind": "delete_columns", "columns": ["party", "notes"]},
            headers=unsafe,
        )
        assert deleted.status_code == 200, deleted.text
        assert _columns(client, workspace_id, node_id) == ["text", "year"]

        undone = client.post(
            f"/api/workspaces/{workspace_id}/nodes/{node_id}/undo", headers=unsafe
        )
        assert undone.status_code == 200, undone.text
        assert _columns(client, workspace_id, node_id) == [
            "text",
            "year",
            "party",
            "notes",
        ]

        everything = client.post(
            edits,
            json={
                "kind": "delete_columns",
                "columns": ["text", "year", "party", "notes"],
            },
            headers=unsafe,
        )
        assert everything.status_code == 400
        assert "at least one column" in everything.json()["message"]
        missing = client.post(
            edits,
            json={"kind": "delete_columns", "columns": ["nope"]},
            headers=unsafe,
        )
        assert missing.status_code == 400
