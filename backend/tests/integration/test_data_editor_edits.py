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
            {"kind": "split_column", "column": "party", "delimiters": ["b"], "parts": 2},
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


def test_combine_columns_template_handles_types_and_missing_values(
    tmp_path: Path,
) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        base = f"/api/workspaces/{workspace_id}/nodes/{node_id}"
        # "Greens" has no "b", so party_2 is missing on that row.
        split = client.post(
            f"{base}/edits",
            json={
                "kind": "split_column",
                "column": "party",
                "delimiters": ["b"],
                "parts": 2,
            },
            headers=unsafe,
        )
        assert split.status_code == 200, split.text
        parts = [
            {"kind": "text", "text": "#"},
            {"kind": "column", "column": "id"},
            {"kind": "text", "text": " "},
            {"kind": "column", "column": "party_1"},
            {"kind": "text", "text": "/"},
            {"kind": "column", "column": "party_2"},
        ]

        def preview(empty_values: str) -> list[str | None]:
            response = client.post(
                f"{base}/edits/preview",
                json={
                    "kind": "combine_columns",
                    "parts": parts,
                    "output_column": "label",
                    "empty_values": empty_values,
                },
                headers=unsafe,
            )
            assert response.status_code == 200, response.text
            return pl.read_ipc_stream(BytesIO(response.content))["label"].to_list()

        # The integer id column joins as text; a missing part reads as blank.
        assert preview("blank") == ["#1 La/or", "#2 Greens/", "#3 La/or"]
        assert preview("empty_result") == ["#1 La/or", None, "#3 La/or"]

        unknown = client.post(
            f"{base}/edits/preview",
            json={
                "kind": "combine_columns",
                "parts": [{"kind": "column", "column": "missing"}],
                "output_column": "label",
            },
            headers=unsafe,
        )
        assert unknown.status_code == 400
        assert "missing" in unknown.text
        text_only = client.post(
            f"{base}/edits/preview",
            json={
                "kind": "combine_columns",
                "parts": [{"kind": "text", "text": "x"}],
                "output_column": "label",
            },
            headers=unsafe,
        )
        assert text_only.status_code == 422
    finally:
        client.__exit__(None, None, None)


def test_split_on_several_delimiters_from_either_side(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        base = f"/api/workspaces/{workspace_id}/nodes/{node_id}"

        def split(direction: str) -> dict[str, list[str | None]]:
            response = client.post(
                f"{base}/edits/preview",
                json={
                    "kind": "split_column",
                    "column": "text",
                    "delimiters": ["-", " "],
                    "direction": direction,
                    "parts": 3,
                },
                headers=unsafe,
            )
            assert response.status_code == 200, response.text
            frame = pl.read_ipc_stream(BytesIO(response.content))
            return {name: frame[name].to_list() for name in ("text_1", "text_2", "text_3")}

        # "  a-b-c " splits on spaces and hyphens; the remainder keeps them.
        assert split("left") == {
            "text_1": ["", "plain", ""],
            "text_2": ["", None, ""],
            "text_3": ["Hello World  ", None, "a-b-c "],
        }
        assert split("right") == {
            # Trailing spaces are delimiters too, so the last parts are empty.
            "text_1": ["  Hello World", "plain", "  a-b"],
            "text_2": ["", None, "c"],
            "text_3": ["", None, ""],
        }
    finally:
        client.__exit__(None, None, None)


def test_count_and_plain_text_replace(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        base = f"/api/workspaces/{workspace_id}/nodes/{node_id}"

        def preview(body: dict[str, object]) -> pl.DataFrame:
            response = client.post(f"{base}/edits/preview", json=body, headers=unsafe)
            assert response.status_code == 200, response.text
            return pl.read_ipc_stream(BytesIO(response.content))

        counts = {
            measure: preview(
                {
                    "kind": "count",
                    "column": "text",
                    "measure": measure,
                    "output_column": "n",
                }
            )["n"].to_list()
            for measure in ("words", "characters", "characters_no_spaces")
        }
        assert counts == {
            "words": [2, 1, 1],
            "characters": [15, 5, 8],
            "characters_no_spaces": [10, 5, 5],
        }
        dots = preview(
            {
                "kind": "count",
                "column": "text",
                "measure": "matches",
                "pattern": "-",
                "output_column": "hyphens",
            }
        )
        assert dots.columns == ["id", "text", "hyphens", "party"]
        assert dots["hyphens"].to_list() == [0, 0, 2]

        # Plain text: "." is a dot, not "any character", and "$1" is literal.
        replaced = preview(
            {
                "kind": "replace",
                "source_column": "text",
                "pattern": "-",
                "replacement": "$1.",
                "literal": True,
            }
        )
        assert replaced["text"].to_list() == ["  Hello World  ", "plain", "  a$1.b$1.c "]
        extracted = preview(
            {
                "kind": "replace",
                "source_column": "text",
                "pattern": ".",
                "mode": "extract",
                "output_column": "dots",
                "literal": True,
            }
        )
        assert extracted["dots"].to_list() == [None, None, None]
        missing_pattern = client.post(
            f"{base}/edits/preview",
            json={"kind": "count", "column": "text", "measure": "matches", "output_column": "n"},
            headers=unsafe,
        )
        assert missing_pattern.status_code == 422
    finally:
        client.__exit__(None, None, None)
