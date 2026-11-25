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


def test_text_identifiers_stay_distinct_as_whole_numbers(
    files_test_client: TestClient,
) -> None:
    """Converting text to whole numbers never merges two identifiers."""

    import io

    import polars as pl

    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Ids"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    uploaded = client.post(
        "/api/user-files/uploads",
        params={"path": "ids.json"},
        content=b'[{"id": "9007199254740992"}, {"id": "9007199254740993"}]',
        headers={"Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 201
    nodes = f"/api/workspaces/{workspace_id}/nodes"
    node = client.post(
        nodes, json={"kind": "file", "file_path": "ids.json", "name": "Ids"}
    ).json()

    converted = client.post(
        f"{nodes}/{node['id']}/edits",
        json={"kind": "cast", "column": "id", "target_type": "integer"},
    )
    assert converted.status_code == 200, converted.text
    assert converted.headers["X-Wordflow-Emptied-Values"] == "0"

    rows = client.post(
        f"{nodes}/previews", json={"kind": "clone", "source_node_id": node["id"]}
    )
    assert rows.status_code == 200, rows.text
    table = pl.read_ipc_stream(io.BytesIO(rows.content))
    assert table.schema["id"] == pl.Int64
    assert table["id"].to_list() == [9007199254740992, 9007199254740993]


def test_cast_into_a_new_column_keeps_the_original(files_test_client: TestClient) -> None:
    """Chao, 25 Nov 2026: convert as it is and keep the text to fix later."""

    import io

    import polars as pl

    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Kept"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    uploaded = client.post(
        "/api/user-files/uploads",
        params={"path": "dates.csv"},
        content=b"when,label\n30/01/2020,a\nsoon,b\n,c\n31/12/2021,d\n",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 201
    nodes = f"/api/workspaces/{workspace_id}/nodes"
    node = client.post(
        nodes, json={"kind": "file", "file_path": "dates.csv", "name": "Dates"}
    ).json()
    edits_url = f"{nodes}/{node['id']}/edits"
    cast = {
        "kind": "cast",
        "column": "when",
        "target_type": "date",
        "datetime_format": "%d/%m/%Y",
    }

    checked = client.post(f"{nodes}/{node['id']}/conversion-check", json=cast)
    assert checked.status_code == 200, checked.text
    assert checked.json()["failed_values"] == [
        {"value": "soon", "count": 1, "first_row": 2, "shortened": False}
    ]

    taken = client.post(edits_url, json={**cast, "output_column": "label"})
    assert taken.status_code == 400, taken.text
    assert "already exists" in taken.text

    converted = client.post(edits_url, json={**cast, "output_column": "when_date"})
    assert converted.status_code == 200, converted.text
    # "soon" is empty in the new column; the blank cell was empty already.
    assert converted.headers["X-Wordflow-Emptied-Values"] == "1"
    assert converted.headers["X-Wordflow-First-Emptied-Row"] == "2"
    assert converted.headers["X-Wordflow-First-Emptied-Value"] == "soon"

    rows = client.post(
        f"{nodes}/previews", json={"kind": "clone", "source_node_id": node["id"]}
    )
    assert rows.status_code == 200, rows.text
    table = pl.read_ipc_stream(io.BytesIO(rows.content))
    # The new column sits right of its source, which is untouched.
    assert table.columns == ["when", "when_date", "label"]
    assert table["when"].to_list() == ["30/01/2020", "soon", None, "31/12/2021"]
    assert table.schema["when_date"] == pl.Date
    assert table["when_date"].null_count() == 2

    # Rows that do not convert can be put in a Data Block with the Filter's "in".
    failing = client.post(
        nodes,
        json={
            "kind": "filter",
            "source_node_id": node["id"],
            "conditions": [{"column": "when", "operator": "in", "value": ["soon"]}],
            "name": "Dates_when_not_converted",
        },
    )
    assert failing.status_code in (200, 201), failing.text
    listed = client.post(
        f"{nodes}/previews",
        json={"kind": "clone", "source_node_id": failing.json()["id"]},
    )
    assert pl.read_ipc_stream(io.BytesIO(listed.content))["label"].to_list() == ["b"]
