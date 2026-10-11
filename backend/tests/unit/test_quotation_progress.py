"""Quotation Runs on several processes, with results as they come (issue 381)."""

import uuid

import polars as pl
import pytest

from ldaca_wordflow.analysis.quotation_core import QUOTATION_GROUP_COLUMN
from ldaca_wordflow.analysis.quotation_extractor import (
    extract_quotations_for_texts,
    extract_quotations_in_chunks,
)
from ldaca_wordflow.analysis.quotation_parts import (
    PART_TEXT_COLUMN,
    PARTS_SCHEMA,
    quotation_progress_page,
    quotation_stop_path,
    read_parts,
    write_part,
)
from ldaca_wordflow.models.analysis_results import QuotationRunAllWorkerResult
from ldaca_wordflow.models.quotation import LocalResolvedQuotationEngine
from ldaca_wordflow.workers import cpu
from ldaca_wordflow.workers.quotation import run_quotation_run_all

NODE = uuid.UUID("44444444-4444-4444-8444-444444444444")


def _quote(text: str) -> list[dict]:
    return [
        {
            "speaker": "Ada",
            "speaker_start_idx": 0,
            "speaker_end_idx": 3,
            "quote": text,
            "quote_start_idx": 0,
            "quote_end_idx": len(text),
            "verb": "said",
            "verb_start_idx": 0,
            "verb_end_idx": 4,
            "quote_type": "direct",
            "quote_token_count": 1,
            "is_floating_quote": False,
            "quote_row_idx": 0,
        }
    ]


def _run(snapshot, tmp_path, **kwargs):
    return run_quotation_run_all(
        artifact_dir=str(tmp_path / "artifacts"),
        input_snapshot_dir=str(snapshot),
        parent_node_id=NODE,
        document_column="document",
        engine=LocalResolvedQuotationEngine(),
        quotation_service_max_batch_size=100,
        quotation_service_timeout=30,
        progress_callback=lambda *_args: None,
        parts_dir=str(tmp_path / "scratch" / "quotation-parts"),
        **kwargs,
    )


def test_a_run_resumes_from_kept_quotations_and_extracts_repeats_once(
    tmp_path, monkeypatch, worker_snapshot
):
    sent: list[list[str]] = []

    def extract(texts, on_progress=None):
        sent.append(list(texts))
        return [_quote(text) for text in texts]

    monkeypatch.setattr(
        "ldaca_wordflow.analysis.quotation_extractor.extract_quotations_for_texts", extract
    )
    snapshot = worker_snapshot(
        node_id=str(NODE),
        columns={"document": ["a", "b", "a", "c", " "], "n": [1, 2, 3, 4, 5]},
    )
    resume = tmp_path / "resume.parquet"
    pl.DataFrame(
        {PART_TEXT_COLUMN: ["b", "gone"], QUOTATION_GROUP_COLUMN: [_quote("b"), []]},
        schema=PARTS_SCHEMA,
    ).write_parquet(resume)

    result = _run(snapshot, tmp_path, resume_path=str(resume))

    assert sent == [["a", "c"]]
    parsed = QuotationRunAllWorkerResult.model_validate(result)
    assert parsed.checked_document_count is None
    assert parsed.source.document_count == 4
    table = pl.read_parquet(result["source"]["table"]["artifact"])
    assert table.get_column("n").to_list() == [1, 2, 3, 4]
    kept = read_parts(tmp_path / "scratch" / "quotation-parts")
    assert sorted(kept.get_column(PART_TEXT_COLUMN).to_list()) == ["a", "b", "c"]


def test_stop_keeps_the_documents_checked_as_the_result(
    tmp_path, monkeypatch, worker_snapshot
):
    stop = quotation_stop_path(tmp_path / "scratch")

    def extract(texts, on_progress=None):
        stop.parent.mkdir(parents=True, exist_ok=True)
        stop.touch()
        return [_quote(text) for text in texts]

    monkeypatch.setattr(
        "ldaca_wordflow.analysis.quotation_extractor.extract_quotations_for_texts", extract
    )
    monkeypatch.setenv(cpu.QUOTATION_PROCESSES_ENV, "1")
    documents = [f"document {index}" for index in range(30)]
    snapshot = worker_snapshot(node_id=str(NODE), columns={"document": documents})

    result = _run(snapshot, tmp_path)

    parsed = QuotationRunAllWorkerResult.model_validate(result)
    assert parsed.checked_document_count == 20
    assert parsed.source.source_document_count == 30
    assert parsed.source.document_count == 20
    assert "stopped after 20 of 30" in parsed.message


def test_quotation_processes_use_half_the_allowed_cores_within_memory(
    tmp_path, monkeypatch
):
    monkeypatch.delenv(cpu.QUOTATION_PROCESSES_ENV, raising=False)
    root = tmp_path / "cgroup"
    root.mkdir()
    (root / "cpu.max").write_text("200000 100000\n")
    (root / "memory.max").write_text(str(8 * 1024**3))
    (root / "memory.current").write_text(str(1 * 1024**3))
    monkeypatch.setattr(cpu.os, "process_cpu_count", lambda: 32)
    # BinderHub-like quota: 2 CPUs -> 1 process, as before.
    assert cpu.quotation_processes(root) == 1
    (root / "cpu.max").write_text("max 100000\n")
    # 32 cores but 7 GB free: memory allows 10, the cap is 8.
    assert cpu.quotation_processes(root) == 8
    (root / "memory.current").write_text(str(7 * 1024**3))
    assert cpu.quotation_processes(root) == 1
    monkeypatch.setenv(cpu.QUOTATION_PROCESSES_ENV, "3")
    assert cpu.quotation_processes(root) == 3


def test_results_so_far_show_only_documents_before_the_first_unchecked(tmp_path):
    source = pl.LazyFrame(
        {"document": ["a", "b", "", "c", "d"], "n": [1, 2, 3, 4, 5]}
    )
    found = pl.DataFrame(
        {
            PART_TEXT_COLUMN: ["a", "b", "d"],
            QUOTATION_GROUP_COLUMN: [_quote("a"), [], _quote("d")],
        },
        schema=PARTS_SCHEMA,
    )

    frame, has_next, checked = quotation_progress_page(
        source, "document", found, page=1, page_size=10
    )

    # "c" is not done yet, so "d" waits; "b" has no quotation.
    assert checked == 3
    assert has_next is False
    assert frame.get_column("n").to_list() == [1]

    frame, has_next, checked = quotation_progress_page(
        source, "document", found, page=1, page_size=1
    )
    assert has_next is True and frame.get_column("n").to_list() == [1]


def test_parts_survive_a_torn_file(tmp_path):
    parts = tmp_path / "parts"
    write_part(parts, ["a"], [_quote("a")])
    (parts / "part-torn.parquet").write_bytes(b"not parquet")
    assert read_parts(parts).get_column(PART_TEXT_COLUMN).to_list() == ["a"]


def _model_available() -> bool:
    from ldaca_wordflow.analysis import quotation_extractor as qe

    if qe._is_cached_spacy_model(qe._cached_spacy_model_dir()):
        return True
    try:
        import spacy.util

        return bool(spacy.util.is_package("en_core_web_md"))
    except Exception:  # noqa: BLE001 - no spaCy: nothing to compare
        return False


@pytest.mark.slow
@pytest.mark.skipif(not _model_available(), reason="needs the spaCy model already installed")
def test_several_processes_find_the_same_quotations_as_one():
    texts = [
        'Ada said "the results are in" yesterday.',
        '"We will win," the coach said.',
        "No quotation here.",
        'The minister said "taxes will fall" on Monday.',
    ]
    together: dict[str, list] = {}

    def record(chunk, quotations):
        together.update(zip(chunk, quotations, strict=True))

    extract_quotations_in_chunks(texts, processes=2, chunk_size=1, on_chunk=record)

    assert together == dict(zip(texts, extract_quotations_for_texts(texts), strict=True))
