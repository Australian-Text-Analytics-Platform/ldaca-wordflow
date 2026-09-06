"""Synthetic ONI server for browser and packaged Wordflow acceptance."""

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def respond(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def record(identifier):
        suffix = identifier.rsplit(",", 1)[-1]
        return {
            "@id": identifier,
            "crateId": identifier,
            "@type": "Dataset",
            "name": "Australian Conversation Corpus"
            if suffix == "sdk-public"
            else suffix,
            "description": "Synthetic SDK acceptance collection",
        }

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        query = body.get("query", {}).get("multi_match", {}).get("query", "sdk-public")
        self.respond(
            {
                "hits": {
                    "total": {"value": 1},
                    "hits": [{"_source": self.record("arcp://name," + query)}],
                }
            }
        )

    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        identifier = query.get("id", ["arcp://name,sdk-public"])[0]
        if url.path.endswith("/object"):
            self.respond(self.record(identifier))
        elif url.path.endswith("/meta"):
            if "failure" in identifier:
                self.respond({"error": "not_authorized"}, 403)
                return
            self.respond(
                {
                    "@graph": [
                        {
                            "@id": "./",
                            "@type": "Dataset",
                            "name": self.record(identifier)["name"],
                        },
                        {
                            "@id": "data/doc.txt",
                            "@type": "File",
                            "encodingFormat": "text/plain",
                            "name": "Document",
                        },
                    ]
                }
            )
        elif url.path.endswith("/stream"):
            if "slow" in identifier:
                time.sleep(20)
            body = "Café 🎙 synthetic SDK document".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            self.respond({})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8873)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Synthetic ONI fixture: http://127.0.0.1:{args.port}/api", flush=True)
    server.serve_forever()
