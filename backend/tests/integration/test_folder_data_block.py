"""A folder of texts becomes one document Data Block, like a ZIP (#134)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import polars as pl
from fastapi.testclient import TestClient

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings


def test_folder_preview_and_data_block_report_skipped_files(tmp_path: Path) -> None:
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
        for name, parent in (("speeches", ""), ("2020", "speeches")):
            folder = client.post(
                "/api/user-files/folders",
                json={"name": name, "parent_path": parent},
                headers=unsafe,
            )
            assert folder.status_code in {200, 201}, folder.text
        uploads = {
            "speeches/2020/b.txt": b"second speech",
            "speeches/a.txt": b"first speech",
            "speeches/metadata.csv": b"file,party\na.txt,Labor\n",
            "speeches/scan.pdf": b"%PDF-1.7",
        }
        for path, content in uploads.items():
            response = client.post(
                "/api/user-files/uploads",
                params={"path": path},
                content=content,
                headers={**unsafe, "Content-Type": "application/octet-stream"},
            )
            assert response.status_code == 201, response.text

        preview = client.get(
            "/api/user-files/preview", params={"path": "speeches", "page_size": 10}
        )
        assert preview.status_code == 200, preview.text
        frame = pl.read_ipc_stream(BytesIO(preview.content))
        assert frame["file_path"].to_list() == ["2020/b.txt", "a.txt"]

        workspace_id = client.post(
            "/api/workspaces", json={"name": "Folder"}, headers=unsafe
        ).json()["id"]
        assert (
            client.put(
                f"/api/workspaces/{workspace_id}/open", headers=unsafe
            ).status_code
            == 200
        )
        created = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={"kind": "file", "file_path": "speeches"},
            headers=unsafe,
        )
        assert created.status_code in {200, 201}, created.text
        node = created.json()
        assert node["name"] == "speeches"
        assert node["shape"] == [2, 4]
        assert sorted(node["skipped_files"], key=lambda row: row["extension"]) == [
            {"extension": "csv", "reason": "unsupported_type", "count": 1},
            {"extension": "pdf", "reason": "unsupported_type", "count": 1},
        ]
