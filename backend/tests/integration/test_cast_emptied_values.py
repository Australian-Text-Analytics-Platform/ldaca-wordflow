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
    assert to_integer.headers["X-Wordflow-First-Emptied-Row"] == "1"
    assert to_integer.headers["X-Wordflow-First-Emptied-Value"] == "a"

    year_to_integer = client.post(
        edits_url, json={"kind": "cast", "column": "year", "target_type": "integer"}
    )
    # "about 2000" is lost; the blank cell was already empty, so it is not counted.
    assert year_to_integer.headers["X-Wordflow-Emptied-Values"] == "1"
    assert year_to_integer.headers["X-Wordflow-First-Emptied-Row"] == "2"
    assert year_to_integer.headers["X-Wordflow-First-Emptied-Value"] == "about%202000"

    rename = client.post(
        edits_url, json={"kind": "rename_column", "column": "year", "new_name": "yr"}
    )
    assert rename.status_code == 200, rename.text
    assert "X-Wordflow-Emptied-Values" not in rename.headers


def test_cast_with_a_few_typos_converts_the_rest(files_test_client: TestClient) -> None:
    """Chao, 2026-09-26: convert what can be converted, and point to the first typo."""

    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Typos"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    values = [str(value) for value in range(1, 1001)]
    values[499] = "5OO"
    values[899] = "9oo"
    content = ("count\n" + "\n".join(values) + "\n").encode()
    client.post(
        "/api/user-files/uploads",
        params={"path": "counts.csv"},
        content=content,
        headers={"Content-Type": "application/octet-stream"},
    )
    node = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": "counts.csv", "name": "Counts"},
    ).json()
    edits_url = f"/api/workspaces/{workspace_id}/nodes/{node['id']}/edits"
    # Loaded as text because of the typos.
    for target in ("integer", "float"):
        response = client.post(
            edits_url, json={"kind": "cast", "column": "count", "target_type": target}
        )
        assert response.status_code == 200, response.text
        if target == "integer":
            assert response.headers["X-Wordflow-Emptied-Values"] == "2"
            assert response.headers["X-Wordflow-First-Emptied-Row"] == "500"
            assert response.headers["X-Wordflow-First-Emptied-Value"] == "5OO"
