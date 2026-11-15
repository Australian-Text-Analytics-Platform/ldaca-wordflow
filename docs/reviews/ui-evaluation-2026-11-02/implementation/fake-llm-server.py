"""Stand-in OpenAI-compatible server for checking the AI Code Designer.

GET /v1/models lists one model; POST /v1/chat/completions waits the number of
seconds in delay.txt (next to this file), logs the request to requests.jsonl,
and answers with a fixed codebook.
"""

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).parent
ANSWER = {
    "codes": [
        {"name": "Housing", "definition": "Texts mainly about rent, homes, tenancy or the cost of housing."},
        {"name": "Transport", "definition": "Texts mainly about trains, buses, roads, traffic or commuting."},
        {"name": "Health", "definition": "Texts mainly about hospitals, doctors, patients or medical care."},
        {"name": "Other", "definition": "Texts about schools, the climate or anything else outside the classes above."},
    ]
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/").endswith("/models"):
            self._send({"object": "list", "data": [{"id": "fake-model", "object": "model"}]})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length) or b"{}")
        with (HERE / "requests.jsonl").open("a") as log:
            log.write(json.dumps({"at": time.time(), "request": request}) + "\n")
        try:
            delay = float((HERE / "delay.txt").read_text().strip())
        except (OSError, ValueError):
            delay = 1.0
        time.sleep(delay)
        self._send(
            {
                "id": "fake",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.get("model", "fake-model"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": json.dumps(ANSWER)},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            }
        )

    def log_message(self, *_args) -> None:
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
