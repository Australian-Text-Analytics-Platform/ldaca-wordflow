"""A single file has no size limit; folders and ZIP members keep one (#236)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path

import polars as pl
from fastapi.testclient import TestClient

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings

# The limit removed in #236 was 64 MiB.
FORMER_LIMIT = 64 * 1024 * 1024


@contextmanager
def _client(
    tmp_path: Path, *, max_node_storage_bytes: int = 1024 * 1024 * 1024
) -> Iterator[tuple[TestClient, dict[str, str]]]:
    settings = Settings(
        data_root=tmp_path,
        multi_user=False,
        session_cookie_secure=False,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
        max_node_storage_bytes=max_node_storage_bytes,
    )
    with TestClient(
        create_app(settings, serve_frontend=False), base_url="http://testserver"
    ) as client:
        csrf = client.get("/api/session").json()["csrf_token"]
        yield client, {"Origin": "http://testserver", "X-CSRF-Token": csrf}


def _upload(
    client: TestClient, unsafe: dict[str, str], path: str, content: bytes
) -> None:
    response = client.post(
        "/api/user-files/uploads",
        params={"path": path},
        content=content,
        headers={**unsafe, "Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 201, response.text


def _open_workspace(client: TestClient, unsafe: dict[str, str]) -> str:
    workspace_id = client.post(
        "/api/workspaces", json={"name": "Sizes"}, headers=unsafe
    ).json()["id"]
    assert (
        client.put(f"/api/workspaces/{workspace_id}/open", headers=unsafe).status_code
        == 200
    )
    return workspace_id


def test_a_file_over_the_former_limit_previews_and_becomes_a_data_block(
    tmp_path: Path,
) -> None:
    rows = 1_200
    frame = pl.DataFrame(
        {
            "id": range(rows),
            # Unique text so the uncompressed file stays over the former limit.
            "text": [f"{index:08d}" * 7_000 for index in range(rows)],
        }
    )
    buffer = BytesIO()
    frame.write_parquet(buffer, compression="uncompressed")
    content = buffer.getvalue()
    assert len(content) > FORMER_LIMIT

    with _client(tmp_path) as (client, unsafe):
        _upload(client, unsafe, "large.parquet", content)

        preview = client.get(
            "/api/user-files/preview", params={"path": "large.parquet", "page_size": 5}
        )
        assert preview.status_code == 200, preview.text
        assert pl.read_ipc_stream(BytesIO(preview.content))["id"].to_list() == [
            0,
            1,
            2,
            3,
            4,
        ]

        workspace_id = _open_workspace(client, unsafe)
        created = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={"kind": "file", "file_path": "large.parquet"},
            headers=unsafe,
        )
        assert created.status_code in {200, 201}, created.text
        assert created.json()["shape"] == [rows, 2]


def test_a_folder_is_bounded_by_the_data_block_storage_limit(tmp_path: Path) -> None:
    with _client(tmp_path, max_node_storage_bytes=1_024) as (client, unsafe):
        folder = client.post(
            "/api/user-files/folders",
            json={"name": "texts", "parent_path": ""},
            headers=unsafe,
        )
        assert folder.status_code in {200, 201}, folder.text
        for name in ("a.txt", "b.txt"):
            _upload(client, unsafe, f"texts/{name}", b"word " * 200)

        workspace_id = _open_workspace(client, unsafe)
        created = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={"kind": "file", "file_path": "texts"},
            headers=unsafe,
        )
        assert created.status_code == 413, created.text
        assert created.json()["code"] == "resource_too_large"
        assert (
            created.json()["message"]
            == "The folder is too large to add as a Data Block"
        )
