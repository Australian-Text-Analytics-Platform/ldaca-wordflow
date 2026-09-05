from __future__ import annotations
from tests.support.node_history import _plan, _value
from ldaca_wordflow.domain.workspace import Node, Workspace
from ldaca_wordflow.infrastructure.storage.workspace_store import WorkspaceStore


def test_workspace_snapshot_contains_only_current_plan_and_load_resets_history(
    tmp_path,
) -> None:
    store = WorkspaceStore(max_nodes=20, max_snapshot_bytes=8 * 1024 * 1024)
    workspace = Workspace(name="history")
    node = workspace.add_node(Node(data=_plan(1), name="source"))
    node.data = _plan(2)
    store.commit(tmp_path / "workspace", workspace, expected_revision=None)

    loaded = store.load(tmp_path / "workspace").workspace.nodes[node.id]

    assert _value(loaded) == 2
    assert not loaded.can_undo
    assert not loaded.can_redo
