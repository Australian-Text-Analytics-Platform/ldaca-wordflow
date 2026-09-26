"""Column names are exact identifiers (issue 108).

A CSV header such as "ID, text" names the second column " text". Stripping
it anywhere made analyses select a column that does not exist.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from ldaca_wordflow.domain.workspace.analysis import (
    SequentialAnalysisRequest,
    TokenFrequencyAnalysisRequest,
)
from ldaca_wordflow.models.node_resources import SetCellNodeEditRequest


def test_analysis_requests_keep_whitespace_in_column_names() -> None:
    node_id = uuid.uuid4()
    frequency = TokenFrequencyAnalysisRequest(
        node_ids=[node_id],
        node_columns={node_id: " text"},
        node_tokenizer_models={node_id: "native:plain_words_en"},
    )
    assert frequency.node_columns[node_id] == " text"

    trends = SequentialAnalysisRequest.model_validate(
        {"node_id": str(node_id), "time_column": " date ", "group_by_columns": [" party"]}
    )
    assert (trends.time_column, trends.group_by_columns) == (" date ", [" party"])

    edit = SetCellNodeEditRequest(column=" text", row_index=0, value="x")
    assert edit.column == " text"


def test_document_column_with_a_leading_space_can_be_saved(files_test_client: TestClient) -> None:
    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Spaces"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    client.post(
        "/api/user-files/uploads",
        params={"path": "test.csv"},
        content=b"ID, text\n1, The cat sat on the mat.\n2, The dog chased the cat.\n",
        headers={"Content-Type": "application/octet-stream"},
    )
    node = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": "test.csv", "name": "Spaces"},
    ).json()

    updated = client.patch(
        f"/api/workspaces/{workspace_id}/nodes/{node['id']}",
        json={"document": " text"},
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["document"] == " text"
