"""Blocks added from an Excel workbook are named after the file and sheet (issue 181)."""

from __future__ import annotations

import io

import xlsxwriter
from fastapi.testclient import TestClient


def _workbook() -> bytes:
    buffer = io.BytesIO()
    workbook = xlsxwriter.Workbook(buffer, {"in_memory": True})
    for sheet in ("Speeches", "Speakers/2020"):
        worksheet = workbook.add_worksheet(sheet.replace("/", "_"))
        worksheet.write_row(0, 0, ["text", "year"])
        worksheet.write_row(1, 0, [f"{sheet} row", 2020])
    workbook.close()
    return buffer.getvalue()


def test_excel_blocks_are_named_after_file_and_sheet(
    files_test_client: TestClient,
) -> None:
    client = files_test_client
    workspace_id = client.post("/api/workspaces", json={"name": "Sheets"}).json()["id"]
    assert client.put(f"/api/workspaces/{workspace_id}/open").status_code == 200
    uploaded = client.post(
        "/api/user-files/uploads",
        params={"path": "hansard.xlsx"},
        content=_workbook(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 201

    def create(**body: str) -> str:
        created = client.post(
            f"/api/workspaces/{workspace_id}/nodes",
            json={"kind": "file", "file_path": "hansard.xlsx", **body},
        )
        assert created.status_code == 201, created.text
        return created.json()["name"]

    assert create() == "hansard_Speeches"
    assert create(sheet_name="Speakers_2020") == "hansard_Speakers_2020"
    assert create(sheet_name="Speeches", name="My block") == "My block"
