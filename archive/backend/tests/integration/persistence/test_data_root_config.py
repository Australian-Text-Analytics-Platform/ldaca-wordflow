from __future__ import annotations
from tests.support.data_root import _store
import json
from pathlib import Path
import pytest
from ldaca_wordflow.data_root_config import (
    DataRootConfigError,
    platform_cache_root,
    platform_data_root_paths,
    probe_data_root,
)



def test_platform_paths_use_the_wordflow_identifier_and_expected_leaf_names() -> None:
    paths = platform_data_root_paths()
    assert "au.edu.ldaca.wordflow" in str(paths.config_file)
    assert paths.config_file.name == "settings.json"
    assert paths.suggested_data_root.name == "data"
    assert "au.edu.ldaca.wordflow" in str(platform_cache_root())


def test_config_store_persists_selection_privately_and_preserves_legacy_file(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    legacy = store.paths.config_file.parent / "backend.json"
    legacy.parent.mkdir(parents=True)
    legacy.write_text('{"data_root":"/legacy"}', encoding="utf-8")

    assert store.read() is None
    selected = (tmp_path / "selected").resolve()
    store.write(selected)
    assert store.read() == selected
    assert legacy.read_text(encoding="utf-8") == '{"data_root":"/legacy"}'
    assert store.paths.config_file.read_text(encoding="utf-8")
    if store.paths.config_file.stat().st_mode & 0o777:
        assert store.paths.config_file.stat().st_mode & 0o777 == 0o600


@pytest.mark.parametrize(
    ("version", "path"),
    [
        pytest.param(1, "relative", id="relative-path"),
        pytest.param(2, "/absolute/path", id="unsupported-version"),
    ],
)
def test_config_store_rejects_relative_or_unknown_schema(
    tmp_path: Path, version, path
) -> None:
    store = _store(tmp_path)
    store.paths.config_file.parent.mkdir(parents=True)
    store.paths.config_file.write_text(
        json.dumps({"schema_version": version, "data_root": path}), encoding="utf-8"
    )
    with pytest.raises(DataRootConfigError):
        store.read()


def test_probe_creates_and_canonicalizes_directory_and_rejects_files(
    tmp_path: Path,
) -> None:
    candidate = tmp_path / "missing" / "data"
    assert probe_data_root(candidate) == candidate.resolve()
    assert list(candidate.glob(".wordflow-probe.*")) == []

    regular_file = tmp_path / "file"
    regular_file.write_text("not a directory", encoding="utf-8")
    with pytest.raises((OSError, ValueError)):
        probe_data_root(regular_file)
    with pytest.raises(ValueError):
        probe_data_root(Path("relative"))
