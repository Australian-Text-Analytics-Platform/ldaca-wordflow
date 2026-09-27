"""First-use model cache publication must be complete, bounded, and repeatable."""


import hashlib
from contextlib import contextmanager

import httpx
import pytest
from ldaca_wordflow.infrastructure.providers import quotation_model as qm


@pytest.fixture
def cache(monkeypatch, tmp_path):
    payload = b"synthetic model payload"
    monkeypatch.setattr(qm, "platform_cache_root", lambda: tmp_path)
    monkeypatch.setattr(qm, "MODEL_SHA256", hashlib.sha256(payload).hexdigest())
    return tmp_path, payload


def response(monkeypatch, payload, *, status=200):
    @contextmanager
    def stream(*args, **kwargs):
        yield httpx.Response(
            status, content=payload, request=httpx.Request("GET", qm.MODEL_URL)
        )

    monkeypatch.setattr(qm.httpx, "stream", stream)


def test_first_use_download_then_offline_reuse(cache, monkeypatch):
    root, payload = cache
    response(monkeypatch, payload)
    path = qm.ensure_quotation_model()
    assert path == root / "udpipe" / qm.MODEL_FILENAME
    assert path.read_bytes() == payload
    monkeypatch.setattr(
        qm.httpx, "stream", lambda *a, **kw: pytest.fail("unexpected network call")
    )
    assert qm.ensure_quotation_model() == path


@pytest.mark.parametrize("mode", ["checksum", "size", "http"])
def test_failed_download_does_not_publish_partial_model(cache, monkeypatch, mode):
    root, payload = cache
    response(
        monkeypatch,
        b"bad" if mode == "checksum" else payload,
        status=503 if mode == "http" else 200,
    )
    if mode == "size":
        monkeypatch.setattr(qm, "_MAX_MODEL_BYTES", 1)
    with pytest.raises((ValueError, httpx.HTTPError)):
        qm.ensure_quotation_model()
    assert list((root / "udpipe").iterdir()) == []


def test_corrupt_cache_is_replaced_only_by_verified_content(cache, monkeypatch):
    root, payload = cache
    destination = root / "udpipe" / qm.MODEL_FILENAME
    destination.parent.mkdir()
    destination.write_bytes(b"corrupt")
    response(monkeypatch, b"wrong")
    with pytest.raises(ValueError):
        qm.ensure_quotation_model()
    assert destination.read_bytes() == b"corrupt"
    response(monkeypatch, payload)
    assert qm.ensure_quotation_model().read_bytes() == payload


def test_concurrent_verified_publications_are_equivalent(cache, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    root, payload = cache
    response(monkeypatch, payload)
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(lambda _: qm.ensure_quotation_model(), range(8)))
    assert all(path.read_bytes() == payload for path in paths)
    assert [path.name for path in (root / "udpipe").iterdir()] == [qm.MODEL_FILENAME]


def test_permission_failure_is_reported_without_download(cache, monkeypatch):
    from pathlib import Path

    def denied(*args, **kwargs):
        raise PermissionError("quotation cache is read-only")

    monkeypatch.setattr(Path, "mkdir", denied)
    monkeypatch.setattr(
        qm.httpx, "stream", lambda *a, **kw: pytest.fail("unexpected download")
    )
    with pytest.raises(PermissionError, match="read-only"):
        qm.ensure_quotation_model()
