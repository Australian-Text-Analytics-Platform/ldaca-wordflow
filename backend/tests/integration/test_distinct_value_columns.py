"""The columns a tool can group by: those with few enough different values."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_data_block_lists_its_columns_with_few_distinct_values(
    files_test_client: TestClient,
) -> None:
    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Groups"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    rows = "".join(
        f"line {index},s{index % 16},r{index % 17},{'Labor' if index % 2 else ''},"
        f"2020-01-0{index % 3 + 1}\n"
        for index in range(40)
    )
    uploaded = client.post(
        "/api/user-files/uploads",
        params={"path": "speeches.csv"},
        content=("text,speaker,role,party,day\n" + rows).encode(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 201
    nodes = f"/api/workspaces/{workspace_id}/nodes"
    node = client.post(
        nodes, json={"kind": "file", "file_path": "speeches.csv", "name": "Speeches"}
    ).json()
    url = f"{nodes}/{node['id']}/distinct-value-columns"

    listed = client.get(url, params={"max_distinct": 16})
    assert listed.status_code == 200, listed.text
    # "role" has 17 values and "text" 40; the empty party values are not counted.
    assert listed.json() == {
        "max_distinct": 16,
        "columns": [
            {"name": "speaker", "distinct_values": 16},
            {"name": "party", "distinct_values": 1},
            {"name": "day", "distinct_values": 3},
        ],
    }

    none_fit = client.get(url, params={"max_distinct": 1})
    assert none_fit.json()["columns"] == [{"name": "party", "distinct_values": 1}]

    assert client.get(url).status_code == 422
    assert client.get(url, params={"max_distinct": 0}).status_code == 422
    missing = client.get(
        f"{nodes}/00000000-0000-0000-0000-000000000000/distinct-value-columns",
        params={"max_distinct": 16},
    )
    assert missing.status_code == 404
