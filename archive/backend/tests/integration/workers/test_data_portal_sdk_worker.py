"""Materialize SDK output through the real application worker and loopback ONI."""


from __future__ import annotations



import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import SimpleQueue
from urllib.parse import urlparse

import polars as pl
import pytest

from ldaca_wordflow.workers.data_portal import _safe_name, data_portal_import_process
from ldaca_wordflow.workers.invocations import DataPortalImportInput


@pytest.mark.parametrize("has_documents", [True, False])
def test_sdk_worker_materializes_expected_table_and_keeps_secrets_out_of_files(
    tmp_path, has_documents
):
    seen = []
    graph = [{"@id": "./", "@type": "Dataset", "name": "Example"}]
    if has_documents:
        graph.append(
            {
                "@id": "data/doc.txt",
                "@type": "File",
                "encodingFormat": "text/plain",
                "name": "Document",
            }
        )
    else:
        graph.append({"@id": "work", "@type": "RepositoryObject", "name": "Café"})

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_GET(self):
            seen.append(self.headers.get("Authorization"))
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            if urlparse(self.path).path.endswith("/meta"):
                self.wfile.write(json.dumps({"@graph": graph}).encode())
            else:
                self.wfile.write("Café 🎙 source text".encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(
        target=lambda: server.serve_forever(poll_interval=0.01), daemon=True
    )
    thread.start()
    try:
        result = data_portal_import_process(
            progress_queue=SimpleQueue(),
            invocation=DataPortalImportInput(
                identifier="arcp://name,example",
                requested_name=None,
                api_base_url=f"http://127.0.0.1:{server.server_port}/api",
                api_token="execution-secret",
                timeout=2,
                download_concurrency=2,
                staging_dir=str(tmp_path),
                max_output_bytes=1024 * 1024,
            ),
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    output = tmp_path / "Example.parquet"
    assert result["destination_path"] == "LDaCA/Example"
    frame = pl.read_parquet(output)
    assert frame.height == 1
    if has_documents:
        assert frame["text"][0] == "Café 🎙 source text"
    else:
        assert frame["name"][0] == "Café"
    assert result["file_count"] == 2
    assert result["bytes_written"] == sum(
        path.stat().st_size for path in tmp_path.iterdir()
    )
    assert set(seen) == {"Bearer execution-secret"}
    assert all(
        b"execution-secret" not in path.read_bytes() for path in tmp_path.iterdir()
    )


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Australian Conversation Corpus", "Australian Conversation Corpus"),
        ("Café 🎙 collection", "Café 🎙 collection"),
        ("Corpus: spoken/English", "Corpus - spoken - English"),
        ("NUL", "LDaCA NUL"),
        ("...", "LDaCA collection"),
    ],
)
def test_portal_storage_names_preserve_metadata_titles(title, expected):
    assert _safe_name(title) == expected
