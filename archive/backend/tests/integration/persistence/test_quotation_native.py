"""The shared native path must agree with persisted Run All quotation groups."""


import os
from pathlib import Path
import uuid

import polars as pl
import pytest
from ldaca_wordflow.analysis.quotation_core import quotation_groups_via_polars_text
from ldaca_wordflow.infrastructure.providers import quotation_model
from ldaca_wordflow.models.quotation import LocalResolvedQuotationEngine
from ldaca_wordflow.workers.quotation import run_quotation_run_all


def test_empty_local_inputs_do_not_acquire_model(monkeypatch):
    monkeypatch.setattr(
        quotation_model,
        "ensure_quotation_model",
        lambda: pytest.fail("unexpected model acquisition"),
    )
    for values in ([], [None, "", " "]):
        frame = pl.DataFrame({"document": values}, schema={"document": pl.String})
        result = quotation_groups_via_polars_text(frame, "document")
        assert result["quotation"].to_list() == [[] for _ in values]


@pytest.mark.model
def test_native_preview_groups_match_run_all_artifact(
    monkeypatch, tmp_path, worker_snapshot
):
    model = os.environ.get("WORDFLOW_TEST_UDPIPE_MODEL")
    if not model:
        pytest.skip("WORDFLOW_TEST_UDPIPE_MODEL is required for native integration")
    monkeypatch.setattr(quotation_model, "ensure_quotation_model", lambda: Path(model))
    text = "José said, “The project will finish tomorrow morning.”"
    documents = [text, "Nothing quoted here.", text]
    preview = quotation_groups_via_polars_text(
        pl.DataFrame({"document": documents}), "document"
    )
    assert preview["quotation"].list.len().to_list() == [1, 0, 1]
    node = uuid.UUID("11111111-1111-4111-8111-111111111111")
    result = run_quotation_run_all(
        artifact_dir=str(tmp_path),
        input_snapshot_dir=str(
            worker_snapshot(node_id=str(node), columns={"document": documents})
        ),
        parent_node_id=node,
        document_column="document",
        engine=LocalResolvedQuotationEngine(),
        quotation_service_max_batch_size=100,
        quotation_service_timeout=30,
        progress_callback=lambda *_: None,
    )
    from ldaca_wordflow.models.analysis_results import QuotationRunAllWorkerResult

    QuotationRunAllWorkerResult.model_validate(result)
    assert result["source"]["source_document_count"] == 3
    assert result["state"] == "successful"
    saved = pl.read_parquet(tmp_path / result["source"]["table"]["artifact"])
    assert (
        saved["quotation"].to_list()
        == preview.filter(pl.col("quotation").list.len() > 0)["quotation"].to_list()
    )
