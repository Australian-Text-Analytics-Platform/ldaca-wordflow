import uuid

import polars as pl
from ldaca_wordflow.analysis.generated_columns import (
    QUOTE_COLUMN_NAMES,
    QUOTE_EXTRACTION_COLUMN,
)
from ldaca_wordflow.models.analysis_results import QuotationRunAllWorkerResult
from ldaca_wordflow.models.quotation import LocalResolvedQuotationEngine
from ldaca_wordflow.workers.quotation import run_quotation_run_all


def test_quotation_run_all_writes_complete_analysis_table_artifact(
    tmp_path,
    monkeypatch,
    worker_snapshot,
):
    progress_updates: list[tuple[float, str]] = []

    def fake_quotation_groups_via_quote_extractor(
        input_df: pl.DataFrame, source_column: str, on_progress=None
    ):
        assert source_column == "document"
        if on_progress is not None:
            # Documents done reach the Tasks panel (issue 350).
            on_progress(input_df.height, input_df.height)
        # Mirror the real `quotation_groups_for_dataframe`: it preserves
        # every input column and adds a `quotation` group column. The
        # worker pipeline relies on that contract (e.g. for QUOTE_extraction
        # to flow through), so the mock must match.
        return input_df.with_columns(
            pl.Series(
                "quotation",
                [
                    [
                        {
                            "speaker": "Ada",
                            "speaker_start_idx": 0,
                            "speaker_end_idx": 3,
                            "quote": "Hello",
                            "quote_start_idx": 5,
                            "quote_end_idx": 10,
                            "verb": "said",
                            "verb_start_idx": 11,
                            "verb_end_idx": 15,
                            "quote_type": "direct",
                            "quote_token_count": 1,
                            "is_floating_quote": False,
                            "quote_row_idx": 0,
                        }
                    ],
                    [],
                ],
            )
        )

    monkeypatch.setattr(
        "ldaca_wordflow.analysis.quotation_core.quotation_groups_via_quote_extractor",
        fake_quotation_groups_via_quote_extractor,
    )

    result = run_quotation_run_all(
        artifact_dir=str(tmp_path),
        input_snapshot_dir=str(
            worker_snapshot(
                node_id="11111111-1111-4111-8111-111111111111",
                columns={
                    "document": ['Ada said "Hello"', "No quotation here"],
                    "speaker_label": ["narrator", "narrator"],
                },
            )
        ),
        parent_node_id=uuid.UUID("11111111-1111-4111-8111-111111111111"),
        document_column="document",
        engine=LocalResolvedQuotationEngine(),
        quotation_service_max_batch_size=100,
        quotation_service_timeout=30,
        progress_callback=lambda progress, message, _detail=None: progress_updates.append(
            (
                progress,
                message,
            )
        ),
    )

    assert result["state"] == "successful"
    QuotationRunAllWorkerResult.model_validate(result)
    source = result["source"]
    assert source["node_id"] == uuid.UUID("11111111-1111-4111-8111-111111111111")
    assert source["document_column"] == "document"
    assert source["metadata_columns"] == ["speaker_label"]
    assert source["analysis_columns"] == [
        QUOTE_EXTRACTION_COLUMN,
        *QUOTE_COLUMN_NAMES,
    ]
    assert source["table"]["table_id"] == "quotation-run-all"
    assert source["table"]["supports_density"] is False
    assert source["source_document_count"] == 2
    assert source["document_count"] == 1
    assert source["match_count"] == 1
    assert "data_block" not in source
    data_file = tmp_path / source["table"]["artifact"]
    assert data_file.exists()

    restored = pl.scan_parquet(data_file)
    assert restored.collect_schema().names() == [
        "__wordflow_source_row_id",
        "document",
        "QUOTE_extraction",
        "speaker_label",
        "quotation",
    ]
    assert restored.collect().get_column("quotation").list.len().to_list() == [1]
    assert "__quotation_source__" not in restored.collect_schema().names()
    assert progress_updates[0][1].startswith("Loading the quotation")
    assert any(
        "Finding quotations" in message for _progress, message in progress_updates
    )
    assert progress_updates[-1] == (0.95, "Saving the results…")


def test_quotation_result_added_to_project_can_be_quoted_again(
    tmp_path,
    monkeypatch,
    worker_snapshot,
):
    """A source column named like a quote field, and old QUOTE_ columns (issue 245)."""
    from ldaca_wordflow.workers.result_data_block_creation import (
        run_result_data_block_creation,
    )

    def fake_quotation_groups(
        input_df: pl.DataFrame, source_column: str, _on_progress=None
    ):
        return input_df.with_columns(
            pl.Series(
                "quotation",
                [
                    [
                        {
                            "speaker": "Ada",
                            "speaker_start_idx": 0,
                            "speaker_end_idx": 3,
                            "quote": "Hello",
                            "quote_start_idx": 5,
                            "quote_end_idx": 10,
                            "verb": "said",
                            "verb_start_idx": 11,
                            "verb_end_idx": 15,
                            "quote_type": "direct",
                            "quote_token_count": 1,
                            "is_floating_quote": False,
                            "quote_row_idx": 0,
                        }
                    ]
                ],
            )
        )

    monkeypatch.setattr(
        "ldaca_wordflow.analysis.quotation_core.quotation_groups_via_quote_extractor",
        fake_quotation_groups,
    )
    node_id = uuid.UUID("22222222-2222-4222-8222-222222222222")
    previous = {
        column: ["old"] for column in (QUOTE_EXTRACTION_COLUMN, *QUOTE_COLUMN_NAMES)
    }
    result = run_quotation_run_all(
        artifact_dir=str(tmp_path),
        input_snapshot_dir=str(
            worker_snapshot(
                node_id=str(node_id),
                columns={
                    "document": ['Ada said "Hello"'],
                    # A source column with the same name as a quote field.
                    "speaker": ["narrator"],
                    **previous,
                },
            )
        ),
        parent_node_id=node_id,
        document_column="document",
        engine=LocalResolvedQuotationEngine(),
        quotation_service_max_batch_size=100,
        quotation_service_timeout=30,
        progress_callback=lambda progress, message, _detail=None: None,
    )
    assert result["state"] == "successful", result
    assert result["source"]["metadata_columns"] == ["speaker"]

    output_dir = tmp_path / "added"
    output_dir.mkdir()
    selected = ["document", "speaker", QUOTE_EXTRACTION_COLUMN, *QUOTE_COLUMN_NAMES]
    created = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "quotation_result_data_block_creation",
            "source": {
                "source_node_id": str(node_id),
                "selected_columns": selected,
                "new_node_name": "Quotes again",
            },
        },
        result_paths={node_id: str(tmp_path / result["source"]["table"]["artifact"])},
        document_columns={node_id: "document"},
    )
    frame = pl.read_parquet(output_dir / created["outputs"][0]["data"]["parquet_path"])
    assert frame.columns == selected
    row = frame.row(0, named=True)
    assert row["speaker"] == "narrator"
    assert row["QUOTE_speaker"] == "Ada"
    assert row[QUOTE_EXTRACTION_COLUMN] == 'Ada said "Hello"'


def test_quotation_on_a_quote_extraction_keeps_its_text_as_quote_source(
    tmp_path,
    monkeypatch,
    worker_snapshot,
):
    """A text column named like a Quotation column becomes QUOTE_source (decided 2026-10-02)."""
    from ldaca_wordflow.workers.result_data_block_creation import (
        run_result_data_block_creation,
    )

    def fake_quotation_groups(
        input_df: pl.DataFrame, source_column: str, _on_progress=None
    ):
        return input_df.with_columns(
            pl.Series(
                "quotation",
                [
                    [
                        {
                            "speaker": "Ada",
                            "speaker_start_idx": 0,
                            "speaker_end_idx": 3,
                            "quote": "Hello",
                            "quote_start_idx": 5,
                            "quote_end_idx": 10,
                            "verb": "said",
                            "verb_start_idx": 11,
                            "verb_end_idx": 15,
                            "quote_type": "direct",
                            "quote_token_count": 1,
                            "is_floating_quote": False,
                            "quote_row_idx": 0,
                        }
                    ]
                ],
            )
        )

    monkeypatch.setattr(
        "ldaca_wordflow.analysis.quotation_core.quotation_groups_via_quote_extractor",
        fake_quotation_groups,
    )
    node_id = uuid.UUID("33333333-3333-4333-8333-333333333333")
    result = run_quotation_run_all(
        artifact_dir=str(tmp_path),
        input_snapshot_dir=str(
            worker_snapshot(
                node_id=str(node_id),
                columns={
                    QUOTE_EXTRACTION_COLUMN: ['Ada said "Hello"'],
                    "QUOTE_speaker": ["old"],
                },
            )
        ),
        parent_node_id=node_id,
        document_column=QUOTE_EXTRACTION_COLUMN,
        engine=LocalResolvedQuotationEngine(),
        quotation_service_max_batch_size=100,
        quotation_service_timeout=30,
        progress_callback=lambda progress, message, _detail=None: None,
    )
    assert result["state"] == "successful", result
    assert result["source"]["document_column"] == "QUOTE_source"
    assert result["source"]["metadata_columns"] == []

    output_dir = tmp_path / "added"
    output_dir.mkdir()
    selected = ["QUOTE_source", QUOTE_EXTRACTION_COLUMN, *QUOTE_COLUMN_NAMES]
    created = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "quotation_result_data_block_creation",
            "source": {
                "source_node_id": str(node_id),
                "selected_columns": selected,
                "new_node_name": "Quotes of quotes",
            },
        },
        result_paths={node_id: str(tmp_path / result["source"]["table"]["artifact"])},
        document_columns={node_id: result["source"]["document_column"]},
    )
    output = created["outputs"][0]["data"]
    frame = pl.read_parquet(output_dir / output["parquet_path"])
    assert frame.columns == selected
    row = frame.row(0, named=True)
    assert row["QUOTE_source"] == 'Ada said "Hello"'
    assert row["QUOTE_speaker"] == "Ada"
