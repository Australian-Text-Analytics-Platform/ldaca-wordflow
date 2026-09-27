from __future__ import annotations
import uuid
import polars as pl
from ldaca_wordflow.domain.workspace import (
    DerivationInput,
    DerivationProvenance,
    Node,
    node_reference,
)
from ldaca_wordflow.domain.workspace.provenance import CloneDerivation


def _node(name: str, *, parents: list[Node] | None = None) -> Node:
    resolved_parents = parents or []
    return Node(
        id=uuid.uuid4(),
        name=name,
        data=pl.DataFrame({"text": [name]}).lazy(),
        parents=resolved_parents,
        provenance=(
            DerivationProvenance(
                operation=CloneDerivation(),
                inputs=[
                    DerivationInput(
                        role="source",
                        value=node_reference(resolved_parents[0].id),
                    )
                ],
            )
            if resolved_parents
            else None
        ),
    )
