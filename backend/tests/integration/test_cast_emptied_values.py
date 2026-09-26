"""A type change reports how many values it emptied (issue 183)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_cast_reports_emptied_values(files_test_client: TestClient) -> None:
    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Casts"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    uploaded = client.post(
        "/api/user-files/uploads",
        params={"path": "years.csv"},
        content=b"year,label\n1990,a\nabout 2000,b\n,c\n2010,d\n",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 201
    node = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": "years.csv", "name": "Years"},
    ).json()
    edits_url = f"/api/workspaces/{workspace_id}/nodes/{node['id']}/edits"

    to_integer = client.post(
        edits_url, json={"kind": "cast", "column": "label", "target_type": "integer"}
    )
    assert to_integer.status_code == 200, to_integer.text
    # All four labels were text, so all four became empty.
    assert to_integer.headers["X-Wordflow-Emptied-Values"] == "4"
    assert to_integer.headers["X-Wordflow-Total-Rows"] == "4"

    year_to_integer = client.post(
        edits_url, json={"kind": "cast", "column": "year", "target_type": "integer"}
    )
    # "about 2000" is lost; the blank cell was already empty, so it is not counted.
    assert year_to_integer.headers["X-Wordflow-Emptied-Values"] == "1"

    rename = client.post(
        edits_url, json={"kind": "rename_column", "column": "year", "new_name": "yr"}
    )
    assert rename.status_code == 200, rename.text
    assert "X-Wordflow-Emptied-Values" not in rename.headers
