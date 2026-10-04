"""Derived Data Blocks and edits must be stable and readable (issues 284, 285)."""

from __future__ import annotations

from typing import Literal

import polars as pl
import pytest

from ldaca_wordflow.domain.workspace import DerivationProvenance, Node, Workspace
from ldaca_wordflow.domain.workspace.provenance import SliceDerivation
from ldaca_wordflow.models.node_resources import (
    ReplaceNodeEditRequest,
    SegmentNodeCreateRequest,
    SliceNodeCreateRequest,
)
from ldaca_wordflow.services.node_operations import (
    build_derived_node,
    build_edited_lazyframe,
    validate_plan_executes,
)
from ldaca_wordflow.shared.errors import InvalidInputError


def _workspace() -> tuple[Workspace, Node]:
    workspace = Workspace(name="plans")
    node = workspace.add_node(
        Node(
            data=pl.DataFrame(
                {"id": list(range(40)), "text": [f"row {i}. next" for i in range(40)]}
            ).lazy(),
            name="source",
            document="text",
        )
    )
    return workspace, node


@pytest.mark.parametrize("mode", ["random_sample", "shuffle"])
def test_unseeded_sample_draws_a_seed_once_and_keeps_its_rows(
    mode: Literal["random_sample", "shuffle"],
) -> None:
    """Issue 284: "No random seed" used to re-sample on every read and reload."""

    workspace, source = _workspace()
    request = SliceNodeCreateRequest(
        source_node_id=source.id,
        mode=mode,
        sample_size=0.5 if mode == "random_sample" else None,
        random_seed=None,
    )

    child = build_derived_node(workspace, request)

    first = child.data.collect()["id"].to_list()
    second = child.data.collect()["id"].to_list()
    assert first == second
    # The drawn seed is recorded, so the description shows it and the plan
    # can be reproduced.
    assert isinstance(child.provenance, DerivationProvenance)
    operation = child.provenance.operation
    assert isinstance(operation, SliceDerivation)
    assert operation.random_seed is not None
    reproduced = build_derived_node(
        workspace, request.model_copy(update={"random_seed": operation.random_seed})
    )
    assert reproduced.data.collect()["id"].to_list() == first


def test_seeded_sample_keeps_the_given_seed() -> None:
    workspace, source = _workspace()
    child = build_derived_node(
        workspace,
        SliceNodeCreateRequest(
            source_node_id=source.id, mode="random_sample", sample_size=5, random_seed=7
        ),
    )
    assert isinstance(child.provenance, DerivationProvenance)
    assert isinstance(child.provenance.operation, SliceDerivation)
    assert child.provenance.operation.random_seed == 7


def test_edit_with_an_invalid_regular_expression_is_refused_in_plain_words() -> None:
    """Issue 285: the plan's schema resolves, only reading rows fails."""

    _workspace_, source = _workspace()
    lazyframe, _renamed = build_edited_lazyframe(
        source,
        ReplaceNodeEditRequest(source_column="text", pattern="(", replacement="x"),
    )
    lazyframe.collect_schema()  # the old check passed here
    with pytest.raises(InvalidInputError, match="not a valid regular expression") as info:
        validate_plan_executes(lazyframe, "The Data Block Edit does not produce a valid schema")
    assert "regex" in str((info.value.details or {}).get("diagnostic", "")).casefold()


def test_segment_with_an_invalid_pattern_is_not_created() -> None:
    """Issue 285: the same check guards Data Builder creations."""

    workspace, source = _workspace()
    before = len(workspace.nodes)
    with pytest.raises(InvalidInputError, match="not a valid regular expression"):
        build_derived_node(
            workspace,
            SegmentNodeCreateRequest(
                source_node_id=source.id,
                column="text",
                unit="pattern",
                pattern="(",
                lead_column="lead",
            ),
        )
    assert len(workspace.nodes) == before
