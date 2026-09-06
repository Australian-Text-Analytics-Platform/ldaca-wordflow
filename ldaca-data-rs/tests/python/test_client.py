import asyncio
import json
import pickle
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

from ldaca_data_rs import (
    AsyncClient,
    Client,
    InvalidInputError,
    SizeLimitError,
    TimeoutError,
)


@pytest.fixture
def server():
    requests = []
    started = threading.Event()
    release = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:
            pass

        def do_GET(self):
            url = urlparse(self.path)
            query = parse_qs(url.query, keep_blank_values=True)
            requests.append((url.path, query, self.headers.get("Authorization")))
            if url.path == "/api/stream":
                if query["path"] == ["slow"]:
                    started.set()
                    if not release.wait(timeout=5):
                        return
                body = "Café".encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
            elif url.path == "/api/object/meta":
                body = json.dumps(
                    {"@graph": [{"@id": "./", "@type": "Dataset"}]}
                ).encode()
                self.send_response(200)
                self.end_headers()
            else:
                body = b"{}"
                self.send_response(200)
                self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(
        target=lambda: httpd.serve_forever(poll_interval=0.01), daemon=True
    )
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}/api", requests, started, release
    finally:
        release.set()
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)


def test_sync_client_encoding_credentials_and_close(server):
    url, requests, _, _ = server
    with Client("secret", base_url=url) as client:
        assert client.get_crate("arcp://name,a/b?é").types() == ["Dataset"]
        with client.with_api_key("second") as second:
            second.configuration()
        client.configuration()
        assert "secret" not in repr(client)
        with pytest.raises(TypeError):
            pickle.dumps(client)
    assert requests[0][1]["id"] == ["arcp://name,a/b?é"]
    assert [r[2] for r in requests] == [
        "Bearer secret",
        "Bearer second",
        "Bearer secret",
    ]
    with pytest.raises(InvalidInputError, match="closed"):
        client.configuration()


def test_received_size_limit_and_atomic_download_cleanup(server, tmp_path):
    url, _, _, _ = server
    with Client(base_url=url) as client:
        with pytest.raises(SizeLimitError):
            client.download_texts("id", ["a", "b"], max_total_bytes=5)
        with pytest.raises(SizeLimitError):
            client.download_file("id", "a", tmp_path / "data", max_bytes=1)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["bulk-text", "destination-file"])
async def test_async_cancel_does_not_poison_client_or_block_event_loop(
    server, tmp_path, operation
):
    url, _, started, release = server
    async with AsyncClient("secret", base_url=url) as client:
        request = (
            client.download_texts("id", ["slow"], max_total_bytes=100)
            if operation == "bulk-text"
            else client.download_file(
                "id", "slow", tmp_path / "document.txt", max_bytes=100
            )
        )
        task = asyncio.create_task(request)
        try:
            async with asyncio.timeout(3):
                assert await asyncio.to_thread(started.wait, 2)
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
                # A different request finishes while the cancelled handler is held.
                assert await client.configuration() == {}
                assert list(tmp_path.iterdir()) == []
        finally:
            task.cancel()
            release.set()


def test_timeout_is_typed(server):
    url, _, _, _ = server
    with Client(base_url=url, timeout=0.01) as client, pytest.raises(TimeoutError):
        client.download_texts("id", ["slow"], max_total_bytes=100)


def test_byte_streams_and_explicit_document_table(server):
    url, _, _, _ = server
    with Client(base_url=url) as client:
        assert (
            b"".join(client.stream_file("id", "text", max_bytes=10)) == "Café".encode()
        )
        table = client.document_table("id", ["a", "b"], max_total_bytes=10)
        assert table.num_rows == 2
        assert json.loads(table.schema_json()) == {
            "crate_id": "String",
            "path": "String",
            "text": "String",
        }


@pytest.mark.asyncio
async def test_async_byte_stream(server):
    url, _, _, _ = server
    async with AsyncClient(base_url=url) as client:
        chunks = [
            chunk async for chunk in client.stream_file("id", "text", max_bytes=10)
        ]
        assert b"".join(chunks) == "Café".encode()
