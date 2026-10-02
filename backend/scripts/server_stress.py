"""Simulate workshop participants against a running hosted or dev Wordflow server.

Each virtual participant keeps a browser-style event stream (/api/events) open
and, until the run ends, repeats a weighted mix of what people do in the web
app: browse Projects and Data Blocks, run word frequency and concordance and
read their result pages, derive a filtered Data Block, and occasionally run
topic modelling. Think time between actions is random.

The server must run in single-user mode (every participant then shares the one
user and works in one shared Project) and sit behind HTTP basic auth, as the dev
server does. Run it close to the server to keep network noise out:

    python server_stress.py --url https://HOST --auth-file loadtest.pw \\
        --users 20 --minutes 10 --csv gst_5k.csv --out run.json

It prints a summary and writes every request and analysis timing to --out.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import httpx

TERMINAL = {"succeeded", "failed", "cancelled"}
SEARCH_WORDS = ["tax", "goods", "services", "government", "price", "small business", "the"]
TOKENIZER = "native:plain_words_en"


@dataclass
class Recorder:
    requests: list[dict] = field(default_factory=list)
    analyses: list[dict] = field(default_factory=list)
    streams: list[dict] = field(default_factory=list)

    def request(self, name: str, status: int | str, seconds: float) -> None:
        self.requests.append({"name": name, "status": status, "seconds": seconds, "at": time.time()})


class Participant:
    def __init__(self, number: int, run: "Run") -> None:
        self.number = number
        self.run = run
        self.client = run.client
        self.random = random.Random(number)
        self.node_id: str | None = None

    async def call(self, name: str, method: str, path: str, **kwargs) -> httpx.Response | None:
        started = time.monotonic()
        try:
            response = await self.client.request(method, path, **kwargs)
        except httpx.HTTPError as error:
            self.run.recorder.request(name, type(error).__name__, time.monotonic() - started)
            return None
        self.run.recorder.request(name, response.status_code, time.monotonic() - started)
        return response

    async def think(self) -> None:
        await asyncio.sleep(self.random.uniform(*self.run.think_seconds))

    async def setup(self) -> bool:
        path = f"{self.run.folder}/participant-{self.number:03d}.csv"
        data = self.run.heavy_csv if self.number in self.run.heavy else self.run.csv
        if self.run.args.unique_text:
            data = _prefix_text(data, f"p{self.number:03d}{self.run.name[-6:]}")
        response = await self.call(
            "upload", "POST", "/api/user-files/uploads", params={"path": path},
            content=data, headers={"Content-Type": "application/octet-stream"},
        )
        if response is None or response.status_code != 201:
            return False
        ws = self.run.workspace_id
        response = await self.call(
            "node create (file)", "POST", f"/api/workspaces/{ws}/nodes",
            json={"kind": "file", "file_path": path, "name": f"participant {self.number}"},
        )
        if response is None or response.status_code != 201:
            return False
        self.node_id = response.json()["id"]
        response = await self.call(
            "node patch", "PATCH", f"/api/workspaces/{ws}/nodes/{self.node_id}", json={"document": "text"},
        )
        return response is not None and response.status_code == 200

    async def analysis(self, kind: str, request: dict) -> str | None:
        ws = self.run.workspace_id
        tab = await self.call("tab create", "POST", f"/api/workspaces/{ws}/tabs",
                              json={"kind": kind, "name": f"{kind} {self.number}"})
        if tab is None or tab.status_code != 201:
            return None
        submitted = time.time()
        created = await self.call(
            f"analysis submit ({kind})", "POST", f"/api/workspaces/{ws}/tabs/{tab.json()['id']}/analyses",
            json={"execution_scope": "run_all", "request": request},
        )
        if created is None or created.status_code != 201:
            return None
        analysis_id = created.json()["id"]
        state = None
        while time.time() - submitted < self.run.analysis_timeout:
            await asyncio.sleep(1.0)
            status = await self.call("analysis status", "GET", f"/api/workspaces/{ws}/analyses/{analysis_id}")
            if status is None or status.status_code != 200:
                continue
            state = status.json()
            if state["state"] in TERMINAL:
                break
        record = {"kind": kind, "participant": self.number, "submitted": submitted,
                  "state": state["state"] if state else "unknown", "error": state.get("error") if state else None}
        if state and state.get("started_at") and state.get("finished_at"):
            started = _epoch(state["started_at"])
            record["queued_seconds"] = started - _epoch(state["created_at"])
            record["run_seconds"] = _epoch(state["finished_at"]) - started
        self.run.recorder.analyses.append(record)
        return analysis_id if record["state"] == "succeeded" else None

    async def browse(self) -> None:
        ws = self.run.workspace_id
        await self.call("workspaces list", "GET", "/api/workspaces")
        await self.call("nodes list", "GET", f"/api/workspaces/{ws}/nodes")
        await self.call("node schema", "GET", f"/api/workspaces/{ws}/nodes/{self.node_id}/schema")
        await self.call("storage", "GET", "/api/storage")

    async def word_frequency(self) -> None:
        nid = self.node_id
        analysis_id = await self.analysis("token_frequency", {
            "kind": "token_frequency", "node_ids": [nid], "node_columns": {nid: "text"},
            "node_tokenizer_models": {nid: TOKENIZER},
        })
        if analysis_id:
            ws = self.run.workspace_id
            result = await self.call("result (token_frequency)", "GET", f"/api/workspaces/{ws}/analyses/{analysis_id}/result")
            if result is not None and result.status_code == 200:
                for node in result.json()["tables"]["nodes"]:
                    await self.call("result table", "GET", node["table"]["url"])

    async def concordance(self) -> None:
        nid = self.node_id
        ws = self.run.workspace_id
        analysis_id = await self.analysis("concordance", {
            "kind": "concordance", "node_ids": [nid], "node_columns": {nid: "text"},
            "search_word": self.random.choice(SEARCH_WORDS),
        })
        if analysis_id:
            for page in (1, 2, 3):
                await self.call(
                    "result query (concordance)", "POST", f"/api/workspaces/{ws}/analyses/{analysis_id}/result/query",
                    json={"kind": "concordance", "node_id": nid, "page": page, "page_size": 50},
                )
                await asyncio.sleep(self.random.uniform(0.5, 2.0))

    async def filtered_block(self) -> None:
        ws = self.run.workspace_id
        created = await self.call("node create (filter)", "POST", f"/api/workspaces/{ws}/nodes", json={
            "kind": "filter", "source_node_id": self.node_id, "name": f"filtered {self.number} {uuid.uuid4().hex[:6]}",
            "conditions": [{"column": "chamber", "operator": "eq", "value": "House of Reps"}],
        })
        if created is not None and created.status_code == 201:
            await self.think()
            await self.call("node delete", "DELETE", f"/api/workspaces/{ws}/nodes/{created.json()['id']}")

    async def topic_modelling(self) -> None:
        nid = self.node_id
        await self.analysis("topic_modeling", {"kind": "topic_modeling", "node_ids": [nid], "node_columns": {nid: "text"}})

    async def events(self) -> None:
        # A browser tab holds this stream open for the whole session.
        record = {"participant": self.number, "events": 0, "ended": None}
        self.run.recorder.streams.append(record)
        try:
            async with self.client.stream("GET", "/api/events", timeout=httpx.Timeout(10, read=None)) as stream:
                record["status"] = stream.status_code
                async for line in stream.aiter_lines():
                    if line.startswith("event:"):
                        record["events"] += 1
            record["ended"] = "closed by server"
        except asyncio.CancelledError:
            record["ended"] = record["ended"] or "run finished"
            raise
        except httpx.HTTPError as error:
            record["ended"] = type(error).__name__

    async def session(self) -> None:
        events = asyncio.create_task(self.events())
        await asyncio.sleep(self.random.uniform(0, self.run.ramp_seconds))
        try:
            if not await self.setup():
                return
            actions = [(self.browse, 4), (self.word_frequency, 3), (self.concordance, 3), (self.filtered_block, 2)]
            did_topics = False
            while time.time() < self.run.deadline:
                if not did_topics and self.number in self.run.topic_users and self.random.random() < 0.3:
                    did_topics = True
                    await self.topic_modelling()
                else:
                    action = self.random.choices([a for a, _ in actions], [w for _, w in actions])[0]
                    await action()
                await self.think()
        finally:
            events.cancel()
            await asyncio.gather(events, return_exceptions=True)


def _prefix_text(data: bytes, prefix: str) -> bytes:
    """Give one participant's copy its own text, so no embedding cache is shared.

    On a hosted server each user has their own embedding cache; in single-user
    mode every participant shares one, which would hide that cost.
    """

    import io

    import polars as pl

    frame = pl.read_csv(io.BytesIO(data))
    frame = frame.with_columns((pl.lit(prefix + " ") + pl.col("text")).alias("text"))
    return frame.write_csv().encode()


def _epoch(value: str) -> float:
    from datetime import datetime

    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


class Run:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.recorder = Recorder()
        self.csv = Path(args.csv).read_bytes()
        self.heavy_csv = Path(args.heavy_csv).read_bytes() if args.heavy_csv else self.csv
        users = list(range(1, args.users + 1))
        picker = random.Random(0)
        self.heavy = set(picker.sample(users, round(args.users * args.heavy_share))) if args.heavy_csv else set()
        # Topic modelling runs on the normal file only: the large one takes many minutes.
        normal = [user for user in users if user not in self.heavy]
        self.topic_users = set(picker.sample(normal, min(len(normal), round(args.users * args.topic_share))))
        self.think_seconds = (args.think_min, args.think_max)
        self.ramp_seconds = args.ramp
        self.analysis_timeout = args.analysis_timeout
        self.name = f"stress-{time.strftime('%Y%m%d-%H%M%S')}"
        self.folder = self.name
        self.workspace_id = ""
        self.deadline = 0.0
        password = Path(args.auth_file).read_text().strip()
        limits = httpx.Limits(max_connections=args.users * 3, max_keepalive_connections=args.users * 2)
        self.client = httpx.AsyncClient(base_url=args.url, auth=(args.auth_user, password),
                                        timeout=httpx.Timeout(args.request_timeout), limits=limits)

    async def prepare(self) -> None:
        session = (await self.client.get("/api/session")).raise_for_status().json()
        self.client.headers.update({"X-CSRF-Token": session["csrf_token"], "Origin": self.args.url})
        (await self.client.post("/api/user-files/folders", json={"name": self.folder})).raise_for_status()
        created = (await self.client.post("/api/workspaces", json={"name": self.name})).raise_for_status().json()
        self.workspace_id = created["id"]
        (await self.client.put(f"/api/workspaces/{self.workspace_id}/open")).raise_for_status()

    async def cleanup(self) -> None:
        await self.client.delete(f"/api/workspaces/{self.workspace_id}/open")
        await self.client.delete(f"/api/workspaces/{self.workspace_id}")
        await self.client.request("DELETE", "/api/user-files", params={"path": self.folder})

    async def main(self) -> dict:
        await self.prepare()
        started = time.time()
        self.deadline = started + self.args.minutes * 60
        try:
            await asyncio.gather(*(Participant(n, self).session() for n in range(1, self.args.users + 1)))
        finally:
            if not self.args.keep:
                await self.cleanup()
            await self.client.aclose()
        return {"run": self.name, "started": started, "finished": time.time(), "args": vars(self.args),
                "requests": self.recorder.requests, "analyses": self.recorder.analyses,
                "streams": self.recorder.streams}


def summarise(result: dict) -> str:
    lines = [f"{result['run']}: {result['args']['users']} participants for {result['args']['minutes']} min"]
    by_name: dict[str, list[dict]] = {}
    for item in result["requests"]:
        by_name.setdefault(item["name"], []).append(item)
    lines.append(f"{'request':32} {'count':>6} {'errors':>6} {'p50 s':>7} {'p95 s':>7} {'max s':>7}  statuses")
    for name, items in sorted(by_name.items()):
        seconds = sorted(i["seconds"] for i in items)
        errors = [i for i in items if not (isinstance(i["status"], int) and i["status"] < 400)]
        statuses: dict[str, int] = {}
        for i in errors:
            statuses[str(i["status"])] = statuses.get(str(i["status"]), 0) + 1
        p95 = seconds[min(len(seconds) - 1, int(len(seconds) * 0.95))]
        lines.append(f"{name:32} {len(items):6} {len(errors):6} {statistics.median(seconds):7.2f} {p95:7.2f} {seconds[-1]:7.2f}  {statuses or ''}")
    by_kind: dict[str, list[dict]] = {}
    for item in result["analyses"]:
        by_kind.setdefault(item["kind"], []).append(item)
    lines.append(f"{'analysis':18} {'count':>6} {'ok':>5} {'queue p50':>10} {'queue max':>10} {'run p50':>8} {'run max':>8}")
    for kind, items in sorted(by_kind.items()):
        ok = [i for i in items if i["state"] == "succeeded" and "run_seconds" in i]
        queued = sorted(i["queued_seconds"] for i in ok) or [0]
        run = sorted(i["run_seconds"] for i in ok) or [0]
        lines.append(f"{kind:18} {len(items):6} {len(ok):5} {statistics.median(queued):10.1f} {queued[-1]:10.1f} {statistics.median(run):8.1f} {run[-1]:8.1f}")
        for failed in [i for i in items if i["state"] != "succeeded"][:3]:
            lines.append(f"    {failed['state']}: {json.dumps(failed.get('error'))[:200]}")
    endings: dict[str, int] = {}
    for stream in result["streams"]:
        endings[str(stream.get("ended"))] = endings.get(str(stream.get("ended")), 0) + 1
    lines.append(f"event streams: {endings}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True)
    parser.add_argument("--auth-user", default="loadtest")
    parser.add_argument("--auth-file", required=True, help="file holding the basic auth password")
    parser.add_argument("--users", type=int, default=10)
    parser.add_argument("--minutes", type=float, default=5)
    parser.add_argument("--csv", required=True)
    parser.add_argument("--heavy-csv", help="larger file for a share of participants")
    parser.add_argument("--heavy-share", type=float, default=0.1)
    parser.add_argument("--topic-share", type=float, default=0.25, help="share of participants who run topic modelling once")
    parser.add_argument("--think-min", type=float, default=2)
    parser.add_argument("--think-max", type=float, default=8)
    parser.add_argument("--ramp", type=float, default=30, help="participants start spread over this many seconds")
    parser.add_argument("--request-timeout", type=float, default=120)
    parser.add_argument("--analysis-timeout", type=float, default=1800)
    parser.add_argument("--unique-text", action="store_true",
                        help="prefix each participant's text so no embedding cache is shared (as between hosted users)")
    parser.add_argument("--keep", action="store_true", help="keep the Project and files afterwards")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    result = asyncio.run(Run(args).main())
    Path(args.out).write_text(json.dumps(result))
    print(summarise(result))


if __name__ == "__main__":
    main()
