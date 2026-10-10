"""Annotation worker publication tests for fatal and row-local failures."""

from __future__ import annotations

import uuid

import polars as pl

from ldaca_wordflow.domain import AnnotationClass
from ldaca_wordflow.domain.workspace import (
    AnnotationAnalysisRequest,
    AnnotationRunAllAnalysisRequest,
)
from ldaca_wordflow.infrastructure.providers.annotation_ai import (
    AnnotationAiError,
    AnnotationAllResult,
)
from ldaca_wordflow.workers.annotation import run_annotation_analysis


def _request(node_id: uuid.UUID) -> dict[str, object]:
    source = AnnotationAnalysisRequest(
        node_id=node_id,
        text_column="text",
        annotation_column="annotation",
        class_node_id=uuid.uuid4(),
        class_column="class",
        description_column="description",
        classes=[AnnotationClass(name="positive")],
        provider_configuration_id=uuid.uuid4(),
        provider="openai",
        model="some-model",
        instruction="Classify the text",
    )
    return AnnotationRunAllAnalysisRequest(
        source=source,
        processing_mode="reprocess_all",
    ).model_dump(mode="json")


def test_row_failure_mask_preserves_failed_rows_but_successful_null_clears(
    tmp_path,
    worker_snapshot,
    monkeypatch,
) -> None:
    node_id = uuid.uuid4()
    snapshot = worker_snapshot(
        node_id=str(node_id),
        columns={
            "text": ["one", "two", "three"],
            "annotation": ["old-one", "old-two", "old-three"],
        },
    )
    output = tmp_path / "output"
    output.mkdir()

    async def fake_annotate_all(*_args, **_kwargs):
        return AnnotationAllResult(
            labels=[None, None, "positive"],
            failed_rows=[False, True, False],
            failed_batch_count=1,
            failed_row_count=1,
        )

    monkeypatch.setattr(
        "ldaca_wordflow.workers.annotation.annotate_all",
        fake_annotate_all,
    )

    result = run_annotation_analysis(
        input_snapshot_dir=str(snapshot),
        output_dir=str(output),
        request_payload=_request(node_id),
        api_key="captured-key",
    )

    assert result["state"] == "successful"
    frame = pl.read_parquet(output / "annotation-run-all.parquet")
    assert frame["annotation"].to_list() == [None, "old-two", "positive"]


def test_fatal_provider_failure_returns_diagnostic_envelope_without_artifact(
    tmp_path,
    worker_snapshot,
    monkeypatch,
) -> None:
    node_id = uuid.uuid4()
    snapshot = worker_snapshot(
        node_id=str(node_id),
        columns={"text": ["one"], "annotation": [None]},
    )
    output = tmp_path / "output"
    output.mkdir()

    async def fail_annotate_all(*_args, **_kwargs):
        raise AnnotationAiError(
            "private SDK response containing secret material",
            code="annotation_provider_authentication_failed",
        )

    monkeypatch.setattr(
        "ldaca_wordflow.workers.annotation.annotate_all",
        fail_annotate_all,
    )

    result = run_annotation_analysis(
        input_snapshot_dir=str(snapshot),
        output_dir=str(output),
        request_payload=_request(node_id),
        api_key="captured-key",
    )

    assert result == {
        "state": "failed",
        "failure": {
            "code": "annotation_provider_authentication_failed",
            # Plain words for users; the provider's text for Details (issue 205).
            "message": "OpenAI rejected the API key. Check it in Settings.",
            "diagnostic": (
                "AnnotationAiError: private SDK response containing secret material"
            ),
        },
    }
    assert list(output.iterdir()) == []
    assert "Traceback" not in str(result)


def test_progress_reports_rows_failed_batches_and_waiting_for_the_provider(
    tmp_path,
    worker_snapshot,
    monkeypatch,
) -> None:
    """Annotation reports like Topic Modelling (issue 370): rows, notes, liveness."""
    node_id = uuid.uuid4()
    snapshot = worker_snapshot(
        node_id=str(node_id),
        columns={"text": ["one", "two", "three"], "annotation": ["a", "b", "c"]},
    )
    output = tmp_path / "output"
    output.mkdir()

    async def fake_annotate_all(*_args, progress_callback=None, **_kwargs):
        assert progress_callback is not None
        progress_callback(2, 3, 0)
        progress_callback(3, 3, 1)
        return AnnotationAllResult(
            labels=["positive", "positive", None],
            failed_rows=[False, False, True],
            failed_batch_count=1,
            failed_row_count=1,
        )

    monkeypatch.setattr("ldaca_wordflow.workers.annotation.annotate_all", fake_annotate_all)
    reports: list[tuple[float, str, dict[str, object] | None]] = []

    result = run_annotation_analysis(
        input_snapshot_dir=str(snapshot),
        output_dir=str(output),
        request_payload=_request(node_id),
        api_key="captured-key",
        progress_callback=lambda fraction, message, detail=None: reports.append(
            (fraction, message, detail)
        ),
    )

    assert result["state"] == "successful"
    counted = [report for report in reports if report[2] is not None]
    assert counted[0][1] == "Classifying rows: 0 of 3 rows"
    # A failed batch is reported at once, after the counts.
    assert counted[-1][1] == "Classifying rows: 3 of 3 rows; 1 failed batch"
    detail = counted[-1][2]
    assert detail is not None
    assert (detail["done"], detail["total"], detail["unit"]) == (3, 3, "rows")
    assert detail["waiting_for"] == "ai_provider"
    fractions = [fraction for fraction, _message, _detail in reports]
    assert fractions == sorted(fractions)
