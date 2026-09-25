"""Data Builder tools that make new Data Blocks (issues 148, 150, 151)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import polars as pl
from fastapi.testclient import TestClient

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings

CSV = (
    "id,party,text,created\n"
    '1,Labor,"JOHN: Hello all. MARY: Hi John!\nJOHN: Next.",2020-01-05\n'
    '2,Greens,"RT @ann: Save the reef! https://x.au",2020-03-01\n'
    '3,Labor,"First para.\n\nSecond para.",2021-07-09\n'
    '4,Greens,"save the REEF",2021-01-02\n'
)


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
        params={"path": "posts.csv"},
        content=CSV.encode(),
        headers={**unsafe, "Content-Type": "application/octet-stream"},
    )
    workspace_id = client.post(
        "/api/workspaces", json={"name": "Builder"}, headers=unsafe
    ).json()["id"]
    client.put(f"/api/workspaces/{workspace_id}/open", headers=unsafe)
    node_id = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": "posts.csv"},
        headers=unsafe,
    ).json()["id"]
    return client, unsafe, workspace_id, node_id


def _preview(
    client: TestClient,
    unsafe: dict[str, str],
    workspace_id: str,
    body: dict[str, Any],
) -> pl.DataFrame:
    response = client.post(
        f"/api/workspaces/{workspace_id}/nodes/previews",
        json=body,
        headers=unsafe,
    )
    assert response.status_code == 200, response.text
    return pl.read_ipc_stream(BytesIO(response.content))


def test_segment_by_unit_and_by_speaker_pattern(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        base = {"kind": "segment", "source_node_id": node_id, "column": "text"}
        paragraphs = _preview(
            client, unsafe, workspace_id, {**base, "unit": "paragraph"}
        ).filter(pl.col("id") == 3)
        assert paragraphs.select("segment", "text").rows() == [
            (1, "First para."),
            (2, "Second para."),
        ]
        sentences = _preview(client, unsafe, workspace_id, {**base, "unit": "sentence"})
        assert sentences.filter(pl.col("id") == 1)["text"].to_list() == [
            "JOHN: Hello all.",
            "MARY: Hi John!",
            "JOHN: Next.",
        ]

        speakers = _preview(
            client,
            unsafe,
            workspace_id,
            {
                **base,
                "unit": "pattern",
                "pattern": r"^[A-Z]+:",
                "lead_column": "speaker",
            },
        )
        assert speakers.columns == [
            "id",
            "party",
            "segment",
            "speaker",
            "text",
            "created",
        ]
        assert speakers.filter(pl.col("id") == 1).select(
            "segment", "speaker", "text"
        ).rows() == [
            (1, "JOHN", "Hello all. MARY: Hi John!"),
            (2, "JOHN", "Next."),
        ]
        # A row with no match keeps its text as one segment with no speaker.
        assert speakers.filter(pl.col("id") == 3)["speaker"].to_list() == [None]

        dropped = _preview(
            client,
            unsafe,
            workspace_id,
            {**base, "unit": "pattern", "pattern": r"[A-Z]+:", "lead": "drop"},
        ).filter(pl.col("id") == 1)
        assert "speaker" not in dropped.columns
        assert dropped["text"].to_list() == ["Hello all.", "Hi John!", "Next."]

        created = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={**base, "unit": "line"},
            headers=unsafe,
        )
        assert created.status_code == 201, created.text
        assert created.json()["name"] == "posts_lines"
    finally:
        client.__exit__(None, None, None)


def test_group_summary_uses_per_column_summaries(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        body = {
            "kind": "group_summary",
            "source_node_id": node_id,
            "group_by": ["party"],
            "summaries": [
                {"column": "text", "summary": "join_text", "separator": " | "},
                {"column": "created", "summary": "earliest_latest"},
                {"column": "id", "summary": "sum"},
            ],
        }
        frame = _preview(client, unsafe, workspace_id, body)
        assert frame.columns == [
            "party",
            "rows",
            "text",
            "created_earliest",
            "created_latest",
            "id_sum",
        ]
        labor = frame.row(0, named=True)
        assert labor["party"] == "Labor"
        assert labor["rows"] == 2
        assert labor["text"].endswith(" | First para.\n\nSecond para.")
        assert labor["id_sum"] == 4

        not_numeric = client.post(
            f"/api/workspaces/{workspace_id}/nodes/previews",
            json={**body, "summaries": [{"column": "text", "summary": "mean"}]},
            headers=unsafe,
        )
        assert not_numeric.status_code == 400
        assert "not numeric" in not_numeric.text
    finally:
        client.__exit__(None, None, None)


def test_deduplicate_keeps_first_and_exposes_duplicate_groups(tmp_path: Path) -> None:
    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:
        body = {
            "kind": "deduplicate",
            "source_node_id": node_id,
            "columns": ["party"],
            "near_text_column": "text",
            "ignore_links_mentions": True,
        }
        kept = _preview(client, unsafe, workspace_id, body)
        # The re-post and "save the REEF" match once links, mentions, case and
        # punctuation are ignored.
        assert kept["id"].to_list() == [1, 2, 3]

        groups = _preview(
            client, unsafe, workspace_id, {**body, "output": "duplicates"}
        )
        assert groups.columns[:2] == ["duplicate_group", "kept"]
        assert groups.select("duplicate_group", "kept", "id").rows() == [
            (1, True, 2),
            (1, False, 4),
        ]

        counted = client.post(
            f"/api/workspaces/{workspace_id}/nodes/previews",
            json=body,
            headers=unsafe,
        )
        assert counted.headers["x-wordflow-total-rows"] == "3"
        bad_pattern = client.post(
            f"/api/workspaces/{workspace_id}/nodes/previews",
            json={
                "kind": "segment",
                "source_node_id": node_id,
                "column": "text",
                "unit": "pattern",
                "pattern": "(",
                "lead": "drop",
            },
            headers=unsafe,
        )
        assert bad_pattern.status_code == 400

        exact = _preview(
            client, unsafe, workspace_id, {**body, "ignore_links_mentions": False}
        )
        assert exact["id"].to_list() == [1, 2, 3, 4]
    finally:
        client.__exit__(None, None, None)


def test_split_by_group_counts_and_filters_each_group(tmp_path: Path) -> None:
    """The SQL and Filter requests the Split by group tool sends (issue 149)."""

    client, unsafe, workspace_id, node_id = _setup(tmp_path)
    try:

        def sql(query: str, source: str = node_id) -> list[tuple[object, ...]]:
            response = client.post(
                f"/api/workspaces/{workspace_id}/sql",
                json={
                    "mode": "query",
                    "node_ids": [source],
                    "sql": query,
                    "page": 1,
                    "page_size": 500,
                },
                headers=unsafe,
            )
            assert response.status_code == 200, response.text
            return pl.read_ipc_stream(BytesIO(response.content)).rows()

        table = f'"{node_id}"'
        assert sql(
            f'SELECT CAST("party" AS VARCHAR) AS value, COUNT(*) AS n FROM {table} '
            "GROUP BY value ORDER BY n DESC, value ASC NULLS LAST LIMIT 51"
        ) == [("Greens", 2), ("Labor", 2)]
        cast = client.post(
            f"/api/workspaces/{workspace_id}/nodes/{node_id}/edits",
            json={"kind": "cast", "column": "created", "target_type": "datetime"},
            headers=unsafe,
        )
        assert cast.status_code == 200, cast.text
        assert sql(
            f"SELECT STRFTIME(\"created\", '%Y') AS value, COUNT(*) AS n FROM {table} "
            "GROUP BY value ORDER BY value ASC NULLS LAST LIMIT 51"
        ) == [("2020", 2), ("2021", 2)]

        created = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={
                "kind": "filter",
                "source_node_id": node_id,
                "conditions": [
                    {
                        "column": "created",
                        "operator": "gte",
                        "value": "2021-01-01T00:00:00Z",
                    },
                    {
                        "column": "created",
                        "operator": "lt",
                        "value": "2022-01-01T00:00:00Z",
                    },
                ],
                "logic": "and",
                "name": "posts · 2021",
            },
            headers=unsafe,
        )
        assert created.status_code == 201, created.text
        group_id = created.json()["id"]
        assert sql(f'SELECT "id" FROM "{group_id}" ORDER BY "id"', group_id) == [
            (3,),
            (4,),
        ]
    finally:
        client.__exit__(None, None, None)
