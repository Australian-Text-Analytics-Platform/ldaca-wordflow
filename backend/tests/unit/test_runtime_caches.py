"""Cache folders a server process can't write move under the Data Root (#425)."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

from ldaca_wordflow.runtime_caches import route_unwritable_caches

pytestmark = pytest.mark.skipif(
    sys.platform == "win32" or (hasattr(os, "geteuid") and os.geteuid() == 0),
    reason="needs POSIX permissions that bind this user",
)


def _read_only_cache(root: Path) -> Path:
    """A Hugging Face style cache with one prefetched model, then made read-only."""

    model = root / "hub" / "models--org--model" / "snapshots" / "rev"
    model.mkdir(parents=True)
    (model / "config.json").write_text("{}", encoding="utf-8")
    for folder in (root / "hub" / "models--org--model", root / "hub", root):
        folder.chmod(0o555)
    return root


@pytest.fixture
def cache_env(monkeypatch: pytest.MonkeyPatch):
    for variable in ("HF_HOME", "XDG_CACHE_HOME", "LINDERA_DICT_PATH"):
        monkeypatch.delenv(variable, raising=False)
    return monkeypatch


def _restore_writable(root: Path) -> None:
    for folder in [root, *root.rglob("*")]:
        if folder.is_dir() and not folder.is_symlink():
            folder.chmod(0o755)


def test_writable_and_unset_caches_stay_where_they_are(
    tmp_path: Path, cache_env: pytest.MonkeyPatch
) -> None:
    cache_env.setenv("HF_HOME", str(tmp_path / "hf"))

    assert route_unwritable_caches(tmp_path / "data") == {}
    assert os.environ["HF_HOME"] == str(tmp_path / "hf")
    assert "XDG_CACHE_HOME" not in os.environ


def test_a_read_only_cache_moves_under_the_data_root_with_its_models_linked(
    tmp_path: Path, cache_env: pytest.MonkeyPatch
) -> None:
    prefetched = _read_only_cache(tmp_path / "opt" / "huggingface")
    cache_env.setenv("HF_HOME", str(prefetched))
    data_root = tmp_path / "data"
    try:
        moved = route_unwritable_caches(data_root)
    finally:
        _restore_writable(prefetched)

    target = data_root / ".cache" / "runtime" / "huggingface"
    assert moved == {"HF_HOME": target}
    assert os.environ["HF_HOME"] == str(target)
    linked = target / "hub" / "models--org--model"
    assert linked.is_symlink()
    assert (linked / "snapshots" / "rev" / "config.json").read_text(encoding="utf-8") == "{}"
    # New models download beside the linked ones.
    (target / "hub" / "models--org--other").mkdir()


def test_without_a_usable_data_root_the_cache_moves_to_the_temp_folder(
    tmp_path: Path, cache_env: pytest.MonkeyPatch
) -> None:
    prefetched = _read_only_cache(tmp_path / "opt" / "cache")
    cache_env.setenv("LINDERA_DICT_PATH", str(prefetched))
    cache_env.setattr(tempfile, "tempdir", str(tmp_path / "tmp"))
    (tmp_path / "tmp").mkdir()
    blocked = tmp_path / "blocked"
    blocked.mkdir(mode=0o555)
    try:
        moved = route_unwritable_caches(blocked / "data")
    finally:
        _restore_writable(prefetched)
        blocked.chmod(0o755)

    assert moved == {"LINDERA_DICT_PATH": tmp_path / "tmp" / "wordflow-cache" / "lindera"}
