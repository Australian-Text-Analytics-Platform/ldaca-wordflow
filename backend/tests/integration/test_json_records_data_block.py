"""JSON rows chosen by the user, for one file and for a batch read one way."""

from __future__ import annotations

import json
import zipfile
from io import BytesIO
from pathlib import Path

import polars as pl
from fastapi.testclient import TestClient

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings


def _ocr(source: str, texts: list[str]) -> bytes:
    """An OCR tool's page: text blocks two levels down, boxes beside them."""

    return json.dumps(
        {
            "source": source,
            "pages": [
                {
                    "width": 2423,
                    "parsing_res_list": [
                        {
                            "block_label": "text",
                            "block_content": text,
                            "block_id": index,
                        }
                        for index, text in enumerate(texts)
                    ],
                    "layout_det_res": {
                        "boxes": [{"label": "text", "score": 0.9} for _ in texts * 3]
                    },
                }
            ],
        }
    ).encode()


def test_json_rows_are_chosen_previewed_and_added(tmp_path: Path) -> None:
    settings = Settings(
        data_root=tmp_path,
        multi_user=False,
        session_cookie_secure=False,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
    )
    bundle = BytesIO()
    with zipfile.ZipFile(bundle, "w") as archive:
        archive.writestr("ocr/p3.json", _ocr("p3.jpg", ["Third page."]))
        archive.writestr("ocr/p4.json", _ocr("p4.jpg", ["Fourth page.", "More."]))
    with TestClient(
        create_app(settings, serve_frontend=False),
        base_url="http://testserver",
    ) as client:
        csrf = client.get("/api/session").json()["csrf_token"]
        unsafe = {"Origin": "http://testserver", "X-CSRF-Token": csrf}
        folder = client.post(
            "/api/user-files/folders",
            json={"name": "ocr", "parent_path": ""},
            headers=unsafe,
        )
        assert folder.status_code in {200, 201}, folder.text
        uploads = {
            "ocr/p1.json": _ocr("p1.jpg", ["SAN FRANCISCO, March 28.", "Rain."]),
            "ocr/p2.json": _ocr("p2.jpg", ["STOCKTON, March 27."]),
            "ocr/flat.json": b'[{"text": "no pages here"}]',
            "ocr/broken.json": b'[{"text": "cut off"',
            "ocr/meta.csv": b"a,b\n1,2\n",
            "ocr.zip": bundle.getvalue(),
        }
        for path, content in uploads.items():
            response = client.post(
                "/api/user-files/uploads",
                params={"path": path},
                content=content,
                headers={**unsafe, "Content-Type": "application/octet-stream"},
            )
            assert response.status_code == 201, response.text

        listed = client.get(
            "/api/user-files/json-record-paths", params={"path": "ocr/p1.json"}
        )
        assert listed.status_code == 200, listed.text
        paths = listed.json()["paths"]
        assert [item["path"] for item in paths][:2] == [
            "/pages/parsing_res_list",
            "/pages/layout_det_res/boxes",
        ]
        assert paths[0]["label"] == "pages › parsing_res_list"
        assert paths[0]["records"] == 2
        assert paths[1]["records"] == 6

        member_paths = client.get(
            "/api/user-files/json-record-paths",
            params={"path": "ocr.zip", "member": "ocr/p4.json"},
        )
        assert member_paths.status_code == 200, member_paths.text
        assert member_paths.json()["paths"][0]["records"] == 2
        not_json = client.get(
            "/api/user-files/json-record-paths", params={"path": "ocr/meta.csv"}
        )
        assert not_json.status_code == 400, not_json.text

        boxes = client.get(
            "/api/user-files/preview",
            params={
                "path": "ocr/p1.json",
                "record_path": "/pages/layout_det_res/boxes",
            },
        )
        assert boxes.status_code == 200, boxes.text
        frame = pl.read_ipc_stream(BytesIO(boxes.content))
        assert frame.height == 6
        assert "score" in frame.columns
        bad_pointer = client.get(
            "/api/user-files/preview",
            params={"path": "ocr/p1.json", "record_path": "pages"},
        )
        assert bad_pointer.status_code == 422, bad_pointer.text
        csv_with_path = client.get(
            "/api/user-files/preview",
            params={"path": "ocr/meta.csv", "record_path": ""},
        )
        assert csv_with_path.status_code == 400, csv_with_path.text

        workspace_id = client.post(
            "/api/workspaces", json={"name": "OCR"}, headers=unsafe
        ).json()["id"]
        assert (
            client.put(
                f"/api/workspaces/{workspace_id}/open", headers=unsafe
            ).status_code
            == 200
        )
        nodes = f"/api/workspaces/{workspace_id}/nodes"

        # One file, rows from the default place: the text blocks.
        single = client.post(
            nodes, json={"kind": "file", "file_path": "ocr/p1.json"}, headers=unsafe
        )
        assert single.status_code in {200, 201}, single.text
        assert single.json()["name"] == "p1"
        assert single.json()["shape"][0] == 2

        chosen = client.post(
            nodes,
            json={
                "kind": "file",
                "file_path": "ocr.zip",
                "zip_member": "ocr/p4.json",
                "record_path": "/pages/layout_det_res/boxes",
            },
            headers=unsafe,
        )
        assert chosen.status_code in {200, 201}, chosen.text
        assert chosen.json()["shape"][0] == 6

        refused = client.post(
            nodes,
            json={"kind": "file", "file_path": "ocr/meta.csv", "record_path": ""},
            headers=unsafe,
        )
        assert refused.status_code == 400, refused.text

        # A batch of files: one Data Block, every file read at one place.
        batch = client.post(
            nodes,
            json={
                "kind": "json_files",
                "file_paths": ["ocr/p1.json", "ocr/p2.json"],
                "record_path": "/pages/parsing_res_list",
            },
            headers=unsafe,
        )
        assert batch.status_code in {200, 201}, batch.text
        batch_node = batch.json()
        assert batch_node["name"] == "ocr_records"
        assert batch_node["shape"][0] == 3
        rows = client.post(
            f"{nodes}/previews",
            json={"kind": "clone", "source_node_id": batch_node["id"]},
            params={"page": 1, "page_size": 10},
            headers=unsafe,
        )
        assert rows.status_code == 200, rows.text
        table = pl.read_ipc_stream(BytesIO(rows.content))
        assert table["file_path"].to_list() == ["p1.json", "p1.json", "p2.json"]
        assert table.columns == [
            "file_path",
            "block_label",
            "block_content",
            "block_id",
            "source",
            "pages.number",
            "pages.width",
        ]
        assert table["block_content"].to_list() == [
            "SAN FRANCISCO, March 28.",
            "Rain.",
            "STOCKTON, March 27.",
        ]

        # A batch leaves out files it can't read and names them with why.
        mixed = client.post(
            nodes,
            json={
                "kind": "json_files",
                "file_paths": ["ocr/p1.json", "ocr/flat.json", "ocr/broken.json"],
                "record_path": "/pages/parsing_res_list",
            },
            headers=unsafe,
        )
        assert mixed.status_code in {200, 201}, mixed.text
        assert mixed.json()["shape"][0] == 2
        assert mixed.json()["skipped_json_files"] == [
            {"path": "flat.json", "reason": "No records at pages › parsing_res_list"},
            {"path": "broken.json", "reason": "Not valid JSON (line 1)"},
        ]
        assert batch_node.get("skipped_json_files") is None

        nothing = client.post(
            nodes,
            json={"kind": "json_files", "file_paths": ["ocr/broken.json"]},
            headers=unsafe,
        )
        assert nothing.status_code == 400, nothing.text
        assert "None of the files could be read (broken.json" in nothing.text

        zipped = client.post(
            nodes,
            json={
                "kind": "json_files",
                "zip_path": "ocr.zip",
                "file_paths": ["ocr/p3.json", "ocr/p4.json"],
            },
            headers=unsafe,
        )
        assert zipped.status_code in {200, 201}, zipped.text
        assert zipped.json()["name"] == "ocr_records"
        assert zipped.json()["shape"][0] == 3

        not_json_batch = client.post(
            nodes,
            json={"kind": "json_files", "file_paths": ["ocr/meta.csv"]},
            headers=unsafe,
        )
        assert not_json_batch.status_code == 422, not_json_batch.text


def test_a_json_batch_keeps_file_names_and_reads_unicode_separators(
    tmp_path: Path,
) -> None:
    """Rows start with their file even when records carry ``file_path`` themselves."""

    settings = Settings(
        data_root=tmp_path,
        multi_user=False,
        session_cookie_secure=False,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
    )
    files = {
        "batch/s1.json": json.dumps([{"file_path": "inside_a", "text": "one"}]).encode(),
        # A literal U+2028 inside the text, as multilingual sources write it.
        "batch/s2.jsonl": (
            json.dumps({"file_path": "inside_b", "text": "two\u2028lines"}, ensure_ascii=False)
            + "\n"
            + json.dumps({"file_path": "inside_c", "text": "three"})
            + "\n"
        ).encode(),
    }
    bundle = BytesIO()
    with zipfile.ZipFile(bundle, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    with TestClient(
        create_app(settings, serve_frontend=False),
        base_url="http://testserver",
    ) as client:
        csrf = client.get("/api/session").json()["csrf_token"]
        unsafe = {"Origin": "http://testserver", "X-CSRF-Token": csrf}
        folder = client.post(
            "/api/user-files/folders",
            json={"name": "batch", "parent_path": ""},
            headers=unsafe,
        )
        assert folder.status_code in {200, 201}, folder.text
        for name, content in {**files, "batch.zip": bundle.getvalue()}.items():
            uploaded = client.post(
                "/api/user-files/uploads",
                params={"path": name},
                content=content,
                headers={**unsafe, "Content-Type": "application/octet-stream"},
            )
            assert uploaded.status_code == 201, uploaded.text
        workspace_id = client.post(
            "/api/workspaces", json={"name": "Batch"}, headers=unsafe
        ).json()["id"]
        client.put(f"/api/workspaces/{workspace_id}/open", headers=unsafe)
        nodes = f"/api/workspaces/{workspace_id}/nodes"

        def rows_of(body: dict) -> pl.DataFrame:
            created = client.post(nodes, json=body, headers=unsafe)
            assert created.status_code in {200, 201}, created.text
            assert created.json().get("skipped_json_files") is None
            rows = client.post(
                f"{nodes}/previews",
                json={"kind": "clone", "source_node_id": created.json()["id"]},
                params={"page": 1, "page_size": 10},
                headers=unsafe,
            )
            assert rows.status_code == 200, rows.text
            return pl.read_ipc_stream(BytesIO(rows.content))

        expected = {
            "file_path": ["s1.json", "s2.jsonl", "s2.jsonl"],
            "file_path (record)": ["inside_a", "inside_b", "inside_c"],
            "text": ["one", "two\u2028lines", "three"],
        }
        from_folder = rows_of(
            {
                "kind": "json_files",
                "file_paths": ["batch/s1.json", "batch/s2.jsonl"],
                "record_path": "",
            }
        )
        assert from_folder.to_dict(as_series=False) == expected
        from_zip = rows_of(
            {
                "kind": "json_files",
                "zip_path": "batch.zip",
                "file_paths": ["batch/s1.json", "batch/s2.jsonl"],
                "record_path": "",
            }
        )
        # A ZIP's rows carry the file's place inside the archive.
        assert from_zip.to_dict(as_series=False) == {
            **expected,
            "file_path": ["batch/s1.json", "batch/s2.jsonl", "batch/s2.jsonl"],
        }
