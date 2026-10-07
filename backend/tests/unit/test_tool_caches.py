"""Tool cache sizes and manual clearing (issue 334)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ldaca_wordflow.infrastructure.storage.layout import user_cache_root
from ldaca_wordflow.main import create_app
from ldaca_wordflow.services.tool_caches import clear_tool_cache, tool_cache_size
from ldaca_wordflow.settings import Settings
from ldaca_wordflow.shared.errors import ToolCacheBusyError


def _write(path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)


def test_size_counts_the_database_and_its_write_ahead_log(tmp_path: Path) -> None:
    assert tool_cache_size(tmp_path, "topic_modeling") == 0
    _write(tmp_path / "embeddings.duckdb", 1000)
    _write(tmp_path / "embeddings.duckdb.wal", 24)
    _write(tmp_path / "tokens.duckdb", 7)

    assert tool_cache_size(tmp_path, "topic_modeling") == 1024
    assert tool_cache_size(tmp_path, "tokeniser") == 7


def test_clearing_one_cache_leaves_the_other(tmp_path: Path) -> None:
    _write(tmp_path / "embeddings.duckdb", 1000)
    _write(tmp_path / "embeddings.duckdb.wal", 24)
    _write(tmp_path / "tokens.duckdb", 7)

    assert clear_tool_cache(tmp_path, "topic_modeling") == 1024
    assert not (tmp_path / "embeddings.duckdb").exists()
    assert not (tmp_path / "embeddings.duckdb.wal").exists()
    assert (tmp_path / "tokens.duckdb").exists()
    assert clear_tool_cache(tmp_path, "topic_modeling") == 0


@pytest.mark.skipif(os.name == "nt", reason="flock is POSIX only")
def test_a_cache_locked_by_a_running_analysis_is_busy_and_kept(tmp_path: Path) -> None:
    import fcntl

    _write(tmp_path / "embeddings.duckdb", 1000)
    # polars-text holds this lock while it reads or writes the cache.
    with open(tmp_path / "embeddings.duckdb.lock", "w") as holder:
        fcntl.flock(holder, fcntl.LOCK_EX)
        with pytest.raises(ToolCacheBusyError):
            clear_tool_cache(tmp_path, "topic_modeling", wait_seconds=0.2)
    assert (tmp_path / "embeddings.duckdb").exists()
    assert clear_tool_cache(tmp_path, "topic_modeling") == 1000


def test_http_lists_and_clears_the_current_users_caches(tmp_path: Path) -> None:
    settings = Settings(
        data_root=tmp_path,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
    )
    app = create_app(settings, serve_frontend=False)
    with TestClient(app, base_url="http://testserver") as client:
        session = client.get("/api/session").json()
        user_id = session["user"]["id"]
        cache_root = user_cache_root(settings, user_id)
        _write(cache_root / "embeddings.duckdb", 2048)

        listed = client.get("/api/tool-caches")
        assert listed.status_code == 200
        assert listed.json() == {
            "caches": [
                {"kind": "topic_modeling", "size_bytes": 2048},
                {"kind": "tokeniser", "size_bytes": 0},
            ]
        }

        headers = {"Origin": "http://testserver", "X-CSRF-Token": session["csrf_token"]}
        cleared = client.delete("/api/tool-caches/topic_modeling", headers=headers)
        assert cleared.status_code == 200, cleared.text
        assert cleared.json() == {"kind": "topic_modeling", "freed_bytes": 2048}
        assert not (cache_root / "embeddings.duckdb").exists()

        assert client.delete("/api/tool-caches/everything", headers=headers).status_code == 422
