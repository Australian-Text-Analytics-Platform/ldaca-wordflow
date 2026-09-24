from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from ldaca_wordflow.services.analysis_results import AnalysisResultService
from ldaca_wordflow.services.response_snapshots import _remove_root


def _locked_rmtree(real_rmtree):
    """Simulate Windows refusing to delete one file another process holds open."""

    def rmtree(path, *args, onexc=None, **kwargs):
        locked = Path(path) / "response-locked.csv"
        if onexc is None:
            raise PermissionError(5, "Access is denied", str(locked))
        onexc(None, str(locked), PermissionError(5, "Access is denied", str(locked)))
        for child in Path(path).iterdir():
            if child != locked:
                child.unlink()

    return rmtree


def test_response_snapshot_cleanup_skips_locked_files(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / ".response-snapshots" / "resources"
    root.mkdir(parents=True)
    (root / "response-locked.csv").write_text("held open")
    (root / "response-free.csv").write_text("removable")
    monkeypatch.setattr(shutil, "rmtree", _locked_rmtree(shutil.rmtree))
    warnings: list[str] = []
    monkeypatch.setattr(
        "ldaca_wordflow.services.response_snapshots.logger.warning",
        lambda message, *args: warnings.append(message % args),
    )

    _remove_root(root)

    assert not (root / "response-free.csv").exists()
    assert len(warnings) == 1
    assert "could not be removed" in warnings[0]


@pytest.mark.anyio
async def test_query_snapshot_reconcile_does_not_block_startup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def denied(_root: Path) -> None:
        raise PermissionError(5, "Access is denied")

    monkeypatch.setattr(
        "ldaca_wordflow.services.analysis_results._remove_query_root", denied
    )
    service = object.__new__(AnalysisResultService)
    service._query_root = tmp_path / "queries"

    async def run_sync(function, *args):
        return function(*args)

    service._run_sync = run_sync  # type: ignore[method-assign]

    await service.reconcile()
