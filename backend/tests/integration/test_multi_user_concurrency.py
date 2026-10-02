"""Many hosted users working at once on one server (opt-in stress test).

Run with WORDFLOW_STRESS_USERS=N (for example 20). Each user, in parallel,
uploads a file, creates and opens a Project, makes a Data Block, runs
concordance and word frequency, reads result pages and renames the Project.
Every request must succeed, every analysis must finish, and no user may see
another user's Projects.

Optional: WORDFLOW_STRESS_CSV=path uses a real file (needs a `text` column)
instead of the built-in 40 rows, WORDFLOW_STRESS_TOPIC_USERS=K makes the first K
users also run topic modelling, and WORDFLOW_STRESS_TIMEOUT sets the per-analysis
limit in seconds. Each analysis's queue and run time is printed at the end.
"""

from __future__ import annotations

import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import pytest

from .test_multi_user_isolation import CSV, Identity, Users, _ok, users  # noqa: F401

USERS = int(os.environ.get("WORDFLOW_STRESS_USERS", "0"))
TOPIC_USERS = int(os.environ.get("WORDFLOW_STRESS_TOPIC_USERS", "0"))
TIMEOUT = float(os.environ.get("WORDFLOW_STRESS_TIMEOUT", "300"))
DATA = (
    Path(os.environ["WORDFLOW_STRESS_CSV"]).read_bytes()
    if os.environ.get("WORDFLOW_STRESS_CSV")
    else CSV
)
TIMINGS: list[tuple[str, float, float]] = []

pytestmark = pytest.mark.skipif(USERS < 2, reason="set WORDFLOW_STRESS_USERS to run")


def _run_analysis(
    server: Users, who: Identity, ws: str, kind: str, request: dict
) -> str:
    tab = _ok(
        server.request(
            who, "POST", f"/api/workspaces/{ws}/tabs", json={"kind": kind, "name": kind}
        ),
        201,
    )
    created = _ok(
        server.request(
            who,
            "POST",
            f"/api/workspaces/{ws}/tabs/{tab['id']}/analyses",
            json={"execution_scope": "run_all", "request": request},
        ),
        201,
    )
    deadline = time.monotonic() + TIMEOUT
    while True:
        state = _ok(
            server.request(who, "GET", f"/api/workspaces/{ws}/analyses/{created['id']}")
        )
        if state["state"] in {"succeeded", "failed", "cancelled"}:
            break
        assert time.monotonic() < deadline, f"{kind} still {state['state']}"
        time.sleep(0.2)
    assert state["state"] == "succeeded", state
    started = datetime.fromisoformat(state["started_at"].replace("Z", "+00:00"))
    TIMINGS.append(
        (
            kind,
            (
                started
                - datetime.fromisoformat(state["created_at"].replace("Z", "+00:00"))
            ).total_seconds(),
            (
                datetime.fromisoformat(state["finished_at"].replace("Z", "+00:00"))
                - started
            ).total_seconds(),
        )
    )
    return created["id"]


def _participant(server: Users, who: Identity, number: int) -> str:
    _ok(
        server.request(who, "POST", "/api/user-files/folders", json={"name": "corpus"}),
        201,
    )
    _ok(
        server.request(
            who,
            "POST",
            "/api/user-files/uploads",
            params={"path": "corpus/tax.csv"},
            content=DATA,
            headers={"Content-Type": "application/octet-stream"},
        ),
        201,
    )
    ws = _ok(
        server.request(
            who, "POST", "/api/workspaces", json={"name": f"Project {number}"}
        ),
        201,
    )["id"]
    _ok(server.request(who, "PUT", f"/api/workspaces/{ws}/open"))
    nid = _ok(
        server.request(
            who,
            "POST",
            f"/api/workspaces/{ws}/nodes",
            json={"kind": "file", "file_path": "corpus/tax.csv"},
        ),
        201,
    )["id"]
    _ok(
        server.request(
            who, "PATCH", f"/api/workspaces/{ws}/nodes/{nid}", json={"document": "text"}
        )
    )
    concordance = _run_analysis(
        server,
        who,
        ws,
        "concordance",
        {
            "kind": "concordance",
            "node_ids": [nid],
            "node_columns": {nid: "text"},
            "search_word": "tax",
        },
    )
    for page in (1, 2):
        _ok(
            server.request(
                who,
                "POST",
                f"/api/workspaces/{ws}/analyses/{concordance}/result/query",
                json={
                    "kind": "concordance",
                    "node_id": nid,
                    "page": page,
                    "page_size": 10,
                },
            )
        )
    frequency = _run_analysis(
        server,
        who,
        ws,
        "token_frequency",
        {
            "kind": "token_frequency",
            "node_ids": [nid],
            "node_columns": {nid: "text"},
            "node_tokenizer_models": {nid: "native:plain_words_en"},
        },
    )
    result = _ok(
        server.request(who, "GET", f"/api/workspaces/{ws}/analyses/{frequency}/result")
    )
    for node in result["tables"]["nodes"]:
        # Result tables are Arrow IPC, not JSON.
        table = server.request(who, "GET", node["table"]["url"])
        assert table.status_code == 200, table.text
    if number < TOPIC_USERS:
        _run_analysis(
            server,
            who,
            ws,
            "topic_modeling",
            {
                "kind": "topic_modeling",
                "node_ids": [nid],
                "node_columns": {nid: "text"},
            },
        )
    _ok(
        server.request(
            who,
            "PATCH",
            f"/api/workspaces/{ws}",
            json={"name": f"Project {number} renamed"},
        )
    )
    return ws


def test_many_users_work_at_once_without_errors_or_crosstalk(users: Users) -> None:  # noqa: F811
    people = [users.sign_in(f"user{number:03d}") for number in range(USERS)]
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=USERS) as pool:
        projects = list(
            pool.map(
                lambda pair: _participant(users, pair[1], pair[0]), enumerate(people)
            )
        )
    elapsed = time.monotonic() - started
    print(f"\n{USERS} users finished in {elapsed:.1f} s")
    for kind in sorted({timing[0] for timing in TIMINGS}):
        queued = sorted(t[1] for t in TIMINGS if t[0] == kind)
        ran = sorted(t[2] for t in TIMINGS if t[0] == kind)
        print(
            f"{kind:16} n={len(queued):3}  queue p50 {statistics.median(queued):6.1f} s"
            f"  max {queued[-1]:6.1f} s  run p50 {statistics.median(ran):6.1f} s  max {ran[-1]:6.1f} s"
        )

    for number, (who, ws) in enumerate(zip(people, projects, strict=True)):
        listed = _ok(users.request(who, "GET", "/api/workspaces"))
        assert [project["id"] for project in listed] == [ws]
        assert listed[0]["name"] == f"Project {number} renamed"
        assert listed[0]["runtime_state"] == "open"
