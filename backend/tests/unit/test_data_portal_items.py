"""Full LDaCA import of collections whose items hold the text (issue 351).

Sydney Speaks-style: the collection's own crate lists no files; each item
(RepositoryObject) names its transcript CSV as ``ldac:indexableText``.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import polars as pl
import pytest

from ldaca_wordflow.workers import data_portal
from ldaca_wordflow.workers.data_portal import (
    _fetch_item_texts,
    _item_text_files,
    _write_item_texts,
)

COLLECTION = "arcp://name,corpus"
STREAM = "https://portal.example/api/stream"


def file_id(item: str, path: str) -> str:
    return f"{STREAM}?id={item}&path={path}"


def item_crate(item: str, name: str, *, text_term: str | None = "ldac:indexableText") -> dict:
    csv = file_id(item, f"csv/{name}.csv")
    eaf = file_id(item, f"eaf/{name}.eaf")
    wav = file_id(item, f"wav/{name}.wav")
    entity: dict[str, Any] = {
        "@id": item,
        "@type": ["RepositoryObject", "Dataset"],
        "name": name,
        "dateCreated": "2017",
        "hasPart": [{"@id": csv}, {"@id": eaf}, {"@id": wav}],
    }
    if text_term:
        entity[text_term] = [{"@id": csv}]
    return {
        "@context": "https://w3id.org/ro/crate/1.1/context",
        "@graph": [
            {"@id": "ro-crate-metadata.json", "@type": "CreativeWork"},
            entity,
            {"@id": csv, "@type": "File", "encodingFormat": ["text/csv", {"@id": "x-fmt/18"}]},
            {"@id": eaf, "@type": "File", "encodingFormat": ["application/xml"]},
            {"@id": wav, "@type": "File", "encodingFormat": ["audio/x-wav"]},
        ],
    }


def test_item_text_follows_indexable_text_and_skips_other_formats() -> None:
    files = _item_text_files(item_crate("item-1", "Nadia"), "item-1")
    assert [(file["path"], file["format"]) for file in files] == [
        ("csv/Nadia.csv", "text/csv")
    ]


def test_main_text_comes_before_indexable_text() -> None:
    crate = item_crate("item-1", "Nadia")
    entity = crate["@graph"][1]
    plain = file_id("item-1", "txt/Nadia.txt")
    entity["ldac:mainText"] = [{"@id": plain}]
    crate["@graph"].append({"@id": plain, "@type": "File", "encodingFormat": "text/plain"})
    assert [file["path"] for file in _item_text_files(crate, "item-1")] == ["txt/Nadia.txt"]


def test_items_naming_no_text_fall_back_to_plain_text_files() -> None:
    crate = item_crate("item-1", "Nadia", text_term=None)
    assert _item_text_files(crate, "item-1") == []
    plain = file_id("item-1", "Nadia.txt")
    crate["@graph"].append({"@id": plain, "@type": "File", "encodingFormat": "text/plain"})
    assert [file["path"] for file in _item_text_files(crate, "item-1")] == ["Nadia.txt"]


def merged_crate(*crates: dict) -> dict:
    graph: dict[str, dict] = {}
    for crate in crates:
        for entity in crate["@graph"]:
            graph.setdefault(entity["@id"], entity)
    return {"@context": crates[0]["@context"], "@graph": list(graph.values())}


def test_csv_transcripts_stack_one_row_per_utterance_with_item_metadata(
    tmp_path: Path,
) -> None:
    nadia = item_crate("item-1", "Nadia")
    paul = item_crate("item-2", "Paul")
    silent = item_crate("item-3", "Silent", text_term=None)
    csv_file = {"path": "csv/Nadia.csv", "name": "Nadia.csv", "format": "text/csv"}
    texts = {
        "item-1": [(csv_file, "speaker,start,text\nNadia,0.5,hello there\nInt,2.0,how are you\n")],
        "item-2": [({**csv_file, "name": "Paul.csv"}, "speaker,start,text\nPaul,1.0,good day\n")],
        "item-3": [],
    }
    destination = tmp_path / "items.parquet"

    _write_item_texts(COLLECTION, merged_crate(nadia, paul, silent), texts, destination)

    table = pl.read_parquet(destination)
    utterances = table.filter(pl.col("text").is_not_null())
    assert utterances.select("item_id", "speaker", "text").rows() == [
        ("item-1", "Nadia", "hello there"),
        ("item-1", "Int", "how are you"),
        ("item-2", "Paul", "good day"),
    ]
    # CSV columns stay text; item metadata joins every row.
    assert utterances.schema["start"] == pl.String
    assert utterances["item_name"].to_list() == ["Nadia", "Nadia", "Paul"]
    assert utterances["item_file"].to_list() == ["Nadia.csv", "Nadia.csv", "Paul.csv"]
    # An item without text keeps one row with its metadata.
    assert table.filter(pl.col("item_id") == "item-3")["item_name"].to_list() == ["Silent"]


def test_fetch_reads_every_item_and_its_named_text(monkeypatch: pytest.MonkeyPatch) -> None:
    crates = {
        COLLECTION: {
            "@context": "https://w3id.org/ro/crate/1.1/context",
            "@graph": [{"@id": COLLECTION, "@type": "RepositoryCollection", "name": "Corpus"}],
        },
        "item-1": item_crate("item-1", "Nadia"),
        "item-2": item_crate("item-2", "Paul"),
    }
    downloads: list[tuple[str, str]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        query = parse_qs(urlparse(str(request.url)).query)
        if request.url.path.endswith("/search/index/items"):
            hits = [{"_source": {"@id": item}} for item in ("item-1", "item-2")]
            return httpx.Response(200, json={"hits": {"hits": hits, "total": {"value": 2}}})
        if request.url.path.endswith("/object/meta"):
            return httpx.Response(200, json=crates[query["id"][0]])
        if request.url.path.endswith("/object/open"):
            downloads.append((query["id"][0], query["path"][0]))
            return httpx.Response(200, text="speaker,text\nA,hello\n")
        return httpx.Response(404)

    real_client = httpx.AsyncClient

    def client_with_mock(**kwargs: Any) -> httpx.AsyncClient:
        return real_client(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(data_portal.httpx, "AsyncClient", client_with_mock)
    reports: list[dict[str, object]] = []

    merged, texts = asyncio.run(
        _fetch_item_texts(
            identifier=COLLECTION,
            api_base_url="https://portal.example/api",
            api_token="token",
            timeout=5,
            download_concurrency=2,
            report=reports.append,
            max_download_bytes=1_000_000,
        )
    )

    assert sorted(downloads) == [("item-1", "csv/Nadia.csv"), ("item-2", "csv/Paul.csv")]
    assert {item: [file["name"] for file, _text in pairs] for item, pairs in texts.items()} == {
        "item-1": ["Nadia.csv"],
        "item-2": ["Paul.csv"],
    }
    ids = {entity["@id"] for entity in merged["@graph"]}
    assert {"item-1", "item-2", COLLECTION} <= ids
    # Items read so far reach the Tasks panel (issue 350).
    details = [report.get("detail") for report in reports]
    assert any(isinstance(detail, dict) and detail.get("unit") == "items" for detail in details)
    json.dumps(reports)
