"""Publish selected columns from immutable Run All Result artifacts."""

from __future__ import annotations

import logging
from typing import Any
from collections.abc import Callable
import uuid

from .utils import process_entrypoint

logger = logging.getLogger(__name__)


def _sort_like_the_table(
    frame: Any,
    path: str,
    *,
    nested_column: str,
    sort_by: str | None,
    descending: bool,
    case_sensitive: bool,
) -> Any:
    """Put match rows in the order the Result table showed (issue 275).

    The sortable columns are the ones the Review table offers: the document
    and metadata columns, plus Concordance's scalar CONC_ columns.
    """

    import polars as pl

    from ..analysis.result_sort import sort_result_rows

    schema = frame.collect_schema()
    if sort_by is not None:
        source_schema = pl.scan_parquet(path).collect_schema()
        sortable = {
            name
            for name in source_schema.names()
            if name != nested_column and not name.startswith("__wordflow")
        }
        nested = source_schema.get(nested_column)
        if nested_column == "concordance" and isinstance(nested, pl.List):
            inner = nested.inner
            if isinstance(inner, pl.Struct):
                sortable.update(field.name for field in inner.fields)
        if (
            sort_by not in sortable
            or sort_by not in schema
            or schema[sort_by].is_nested()
            or schema[sort_by] == pl.Object
        ):
            raise ValueError("Data Block Creation sort column is unavailable")
    return sort_result_rows(
        frame,
        schema,
        concordance=nested_column == "concordance",
        matches=True,
        sort_by=sort_by,
        descending=descending,
        case_sensitive=case_sensitive,
    )


def parse_result_selection_request(request_payload: dict[str, Any]) -> tuple[Any, list[Any], Any, str | None]:
    """The validated request, its selections, derivation and nested column.

    Shared by Add to Project and Download (issue 352), so both build the
    same table.
    """

    from ..domain.workspace import (
        ConcordanceDocumentDataBlockCreationAnalysisRequest,
        ConcordanceDocumentDataBlockCreationDerivation,
        ConcordanceMatchDataBlockCreationAnalysisRequest,
        ConcordanceMatchDataBlockCreationDerivation,
        QuotationResultDataBlockCreationAnalysisRequest,
        QuotationResultDataBlockCreationDerivation,
        SequentialDataBlockCreationAnalysisRequest,
        SequentialDataBlockCreationDerivation,
    )

    kind = request_payload.get("kind")
    if kind == "concordance_match_data_block_creation":
        request = ConcordanceMatchDataBlockCreationAnalysisRequest.model_validate(
            request_payload
        )
        return request, list(request.sources), ConcordanceMatchDataBlockCreationDerivation(), "concordance"
    if kind == "concordance_document_data_block_creation":
        request = ConcordanceDocumentDataBlockCreationAnalysisRequest.model_validate(
            request_payload
        )
        return request, list(request.sources), ConcordanceDocumentDataBlockCreationDerivation(), None
    if kind == "quotation_result_data_block_creation":
        request = QuotationResultDataBlockCreationAnalysisRequest.model_validate(
            request_payload
        )
        return request, [request.source], QuotationResultDataBlockCreationDerivation(), "quotation"
    if kind == "sequential_data_block_creation":
        request = SequentialDataBlockCreationAnalysisRequest.model_validate(request_payload)
        return request, [request.source], SequentialDataBlockCreationDerivation(), None
    raise ValueError("Data Block Creation kind is unsupported")


def result_selection_frame(
    *,
    kind: str,
    nested_column: str | None,
    selection: Any,
    path: str | None,
    document_column: str | None,
    case_sensitive: bool,
) -> tuple[Any, list[str]]:
    """The selected rows and columns of one Result table, in table order.

    Returns a LazyFrame of exactly ``output_columns``. Used by Add to Project
    (published as a Data Block) and Download (written as a file, issue 352).
    """

    import polars as pl

    from ..domain.workspace import (
        ConcordanceDocumentDataBlockCreationSource,
        SequentialDataBlockCreationSource,
    )

    if path is None or (
        document_column is None
        and not isinstance(selection, SequentialDataBlockCreationSource)
    ):
        raise ValueError("Data Block Creation source artifact is unavailable")
    if isinstance(selection, SequentialDataBlockCreationSource):
        from ..analysis.sequential_core import (
            SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
            SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
        )

        frame = pl.scan_parquet(path)
        schema = frame.collect_schema()
        if (
            SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN not in schema
            or SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN not in schema
        ):
            raise ValueError("Trends selection identity is unavailable")
        if selection.selected_period_indices is not None:
            frame = frame.filter(
                pl.col(SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN).is_in(
                    selection.selected_period_indices
                )
            )
        if selection.excluded_group_indices:
            frame = frame.filter(
                ~pl.col(SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN).is_in(
                    selection.excluded_group_indices
                )
            )
        output_columns = selection.selected_columns
    elif isinstance(selection, ConcordanceDocumentDataBlockCreationSource):
        assert document_column is not None
        from ..analysis.concordance_projection import (
            filter_concordance_documents,
        )
        from ..analysis.generated_columns import CONC_EXTRACTION_COLUMN

        frame = filter_concordance_documents(
            pl.scan_parquet(path),
            document_column=document_column,
            excluded_matched_texts=selection.excluded_matched_texts,
            bin_count=selection.bin_count,
            selected_bins=selection.selected_bins,
        )
        schema = frame.collect_schema()
        if any(
            column not in schema
            for column in selection.selected_metadata_columns
        ):
            raise ValueError("Document Data Block Creation metadata is unavailable")
        output_columns = [
            document_column,
            CONC_EXTRACTION_COLUMN,
            *selection.selected_metadata_columns,
        ]
        frame = frame.with_columns(
            pl.col("concordance")
            .list.eval(
                pl.element()
                .struct.field(CONC_EXTRACTION_COLUMN)
                .cast(pl.String)
                .fill_null("")
                .str.replace_all(r"\s+", " ")
                .str.strip_chars()
            )
            .list.join("\n")
            .alias(CONC_EXTRACTION_COLUMN)
        )
    else:
        if document_column not in selection.selected_columns:
            raise ValueError("Data Block Creation requires the document column")
        assert nested_column is not None
        frame = pl.scan_parquet(path).explode(nested_column)
        if kind == "quotation_result_data_block_creation":
            # Name the quote fields QUOTE_* before unnesting, so they
            # cannot clash with a source column such as `speaker`
            # (issues 245 and 283).
            from ..analysis.generated_columns import prefix_quote_struct_fields

            frame = prefix_quote_struct_fields(frame, nested_column)
        frame = frame.unnest(nested_column)
        frame = _sort_like_the_table(
            frame,
            path,
            nested_column=nested_column,
            sort_by=getattr(selection, "sort_by", None),
            descending=getattr(selection, "descending", False),
            case_sensitive=case_sensitive,
        )
        output_columns = selection.selected_columns
    schema = frame.collect_schema()
    if any(column not in schema for column in output_columns):
        raise ValueError("Data Block Creation column is unavailable")
    return frame.select(output_columns), output_columns


@process_entrypoint
def run_result_data_block_creation(
    *,
    artifact_dir: str,
    request_payload: dict[str, Any],
    result_paths: dict[uuid.UUID, str],
    document_columns: dict[uuid.UUID, str | None],
    case_sensitive: dict[uuid.UUID, bool] | None = None,
    progress_callback: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Create private output files for one atomic Data Block Creation."""

    try:
        from ..domain.workspace import (
            DerivationInput,
            DerivationProvenance,
            node_reference,
        )
        from ..infrastructure.storage.node_store import write_published_frame

        kind = str(request_payload.get("kind"))
        _request, selections, operation, nested_column = parse_result_selection_request(
            request_payload
        )

        outputs: list[dict[str, Any]] = []
        for index, selection in enumerate(selections):
            source_id = selection.source_node_id
            frame, output_columns = result_selection_frame(
                kind=kind,
                nested_column=nested_column,
                selection=selection,
                path=result_paths.get(source_id),
                document_column=document_columns.get(source_id),
                case_sensitive=(case_sensitive or {}).get(source_id, True),
            )
            document_column = document_columns.get(source_id)
            if progress_callback:
                progress_callback(
                    0.1 + (0.65 * index / max(len(selections), 1)),
                    f"Preparing {selection.new_node_name}",
                )
            selected = frame.collect(engine="streaming")
            node_payload = write_published_frame(
                selected,
                base_dir=artifact_dir,
                name=selection.new_node_name,
                provenance=DerivationProvenance(
                    operation=operation,
                    inputs=[
                        DerivationInput(
                            role="source",
                            value=node_reference(source_id),
                        )
                    ],
                ),
                document=(
                    document_column
                    if document_column is not None
                    and document_column in output_columns
                    else None
                ),
            )
            outputs.append(
                {
                    "source_node_id": source_id,
                    "data": {
                        **node_payload,
                        "output_columns": output_columns,
                        "record_count": selected.height,
                    },
                }
            )

        if progress_callback:
            progress_callback(0.95, "Saving the new Data Block…")
        return {
            "state": "successful",
            "outputs": outputs,
            "message": "Data Block Creation completed successfully",
        }
    except Exception:
        logger.exception("Data Block Creation failed")
        raise


__all__ = ["run_result_data_block_creation"]
