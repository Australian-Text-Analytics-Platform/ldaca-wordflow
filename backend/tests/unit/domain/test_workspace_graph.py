from __future__ import annotations
from tests.support.workspace_graph import _node
import uuid
from pathlib import Path
import pytest
from ldaca_wordflow.domain.workspace import (
    Workspace,
)



def test_workspace_rejects_duplicate_registration(tmp_path: Path) -> None:
    workspace = Workspace(name="strict")
    node = workspace.add_node(_node("one"))

    with pytest.raises(ValueError, match="already contains"):
        workspace.add_node(node)


def test_workspace_rejects_cross_workspace_registration(tmp_path: Path) -> None:
    first = Workspace(name="first")
    second = Workspace(name="second")
    node = first.add_node(_node("owned"))

    with pytest.raises(ValueError, match="another workspace"):
        second.add_node(node)

    assert node.workspace is first
    assert node.id in first.nodes
    assert node.id not in second.nodes


def test_children_index_tracks_registration_and_removal_rewiring() -> None:
    workspace = Workspace(name="indexed")
    grandparent = workspace.add_node(_node("grandparent"))
    parent = workspace.add_node(_node("parent", parents=[grandparent]))
    child = workspace.add_node(_node("child", parents=[parent]))

    assert grandparent.children == [parent]
    assert parent.children == [child]
    assert workspace.remove_node(parent.id)

    assert grandparent.children == [child]
    assert child.parents == [grandparent]
    assert parent.workspace is None
    assert parent.parents == []


@pytest.mark.parametrize(
    "invalid_order",
    [
        lambda first, second: [first],
        lambda first, second: [first, first],
        lambda first, second: [first, str(uuid.uuid4())],
    ],
)
def test_reorder_requires_an_exact_duplicate_free_permutation(invalid_order) -> None:
    workspace = Workspace(name="ordered")
    first = workspace.add_node(_node("first"))
    second = workspace.add_node(_node("second"))

    with pytest.raises(ValueError, match="exact duplicate-free permutation"):
        workspace.reorder_nodes(invalid_order(first.id, second.id))

    assert list(workspace.nodes) == [first.id, second.id]


def test_smart_placement_rejects_an_unregistered_node() -> None:
    workspace = Workspace(name="strict")
    foreign = _node("foreign")

    with pytest.raises(ValueError, match="must belong"):
        workspace.place_node_after_parent(foreign)
