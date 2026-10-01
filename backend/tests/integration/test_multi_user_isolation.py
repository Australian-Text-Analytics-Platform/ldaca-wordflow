"""Hosted users can neither see nor change one another's resources over HTTP.

User A builds a full set of resources (file, Workspace, Data Block, tab and a
finished analysis). User B, signed in to the same server, then tries every
route that names one of them. Each attempt must be refused without revealing
the resource (404), and A's resources must be unchanged afterwards.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

import anyio
import pytest
from fastapi.testclient import TestClient

from ldaca_wordflow.api.security import SESSION_COOKIE_NAME
from ldaca_wordflow.main import create_app
from ldaca_wordflow.runtime import Runtime, runtime_context
from ldaca_wordflow.settings import Settings

ORIGIN = "https://wordflow.example"
CSV = b"id,text,chamber\n" + b"".join(
    f"{i},the goods and services tax number {i},House\n".encode() for i in range(40)
)


@dataclass(frozen=True)
class Identity:
    cookie: str
    csrf: str


class Users:
    """One hosted app with several signed-in users sharing a single client."""

    def __init__(self, client: TestClient, runtime: Runtime) -> None:
        self.client = client
        self.runtime = runtime

    def sign_in(self, name: str) -> Identity:
        async def issue():
            user = await self.runtime.session_service.upsert_oidc_user(
                issuer="https://accounts.google.com",
                subject=f"subject-{name}",
                email=f"{name}@example.test",
                name=name,
                picture=None,
            )
            return await self.runtime.session_service.issue(user)

        issued = anyio.run(issue)
        return Identity(issued.session_token, issued.csrf_token)

    def request(self, who: Identity, method: str, path: str, **kwargs):
        self.client.cookies.set(SESSION_COOKIE_NAME, who.cookie)
        headers = {
            "Origin": ORIGIN,
            "X-CSRF-Token": who.csrf,
            **kwargs.pop("headers", {}),
        }
        return self.client.request(method, path, headers=headers, **kwargs)


@pytest.fixture
def users(tmp_path: Path, finite_quota_test_filesystem: None) -> Iterator[Users]:
    settings = Settings(
        data_root=tmp_path,
        multi_user=True,
        google_client_id="google-client",
        cors_allowed_origins=(),
        trusted_hosts=("wordflow.example",),
    )
    captured: dict[str, Runtime] = {}

    @asynccontextmanager
    async def capture_runtime(_settings: Settings) -> AsyncIterator[Runtime]:
        async with runtime_context(_settings) as runtime:
            captured["runtime"] = runtime
            yield runtime

    app = create_app(settings, capture_runtime, serve_frontend=False)
    with TestClient(app, base_url=ORIGIN) as client:
        yield Users(client, captured["runtime"])


def _ok(response, status: int = 200) -> dict:
    assert response.status_code == status, response.text
    return response.json() if response.content else {}


def _build_resources(users: Users, owner: Identity) -> dict[str, str]:
    _ok(
        users.request(
            owner, "POST", "/api/user-files/folders", json={"name": "corpus"}
        ),
        201,
    )
    _ok(
        users.request(
            owner,
            "POST",
            "/api/user-files/uploads",
            params={"path": "corpus/tax.csv"},
            content=CSV,
            headers={"Content-Type": "application/octet-stream"},
        ),
        201,
    )
    workspace = _ok(
        users.request(owner, "POST", "/api/workspaces", json={"name": "A's Project"}),
        201,
    )
    ws = workspace["id"]
    _ok(users.request(owner, "PUT", f"/api/workspaces/{ws}/open"))
    node = _ok(
        users.request(
            owner,
            "POST",
            f"/api/workspaces/{ws}/nodes",
            json={"kind": "file", "file_path": "corpus/tax.csv"},
        ),
        201,
    )
    nid = node["id"]
    _ok(
        users.request(
            owner,
            "PATCH",
            f"/api/workspaces/{ws}/nodes/{nid}",
            json={"document": "text"},
        )
    )
    tab = _ok(
        users.request(
            owner,
            "POST",
            f"/api/workspaces/{ws}/tabs",
            json={"kind": "concordance", "name": "Concordance"},
        ),
        201,
    )
    analysis = _ok(
        users.request(
            owner,
            "POST",
            f"/api/workspaces/{ws}/tabs/{tab['id']}/analyses",
            json={
                "execution_scope": "run_all",
                "request": {
                    "kind": "concordance",
                    "node_ids": [nid],
                    "node_columns": {nid: "text"},
                    "search_word": "tax",
                },
            },
        ),
        201,
    )
    deadline = time.monotonic() + 60
    while (
        state := _ok(
            users.request(
                owner, "GET", f"/api/workspaces/{ws}/analyses/{analysis['id']}"
            )
        )
    )["state"] not in {"succeeded", "failed", "cancelled"}:
        assert time.monotonic() < deadline
        time.sleep(0.1)
    assert state["state"] == "succeeded", state
    return {"ws": ws, "node": nid, "tab": tab["id"], "analysis": analysis["id"]}


def test_another_user_cannot_read_or_change_any_owned_resource(users: Users) -> None:
    alice = users.sign_in("alice")
    bob = users.sign_in("bob")
    ids = _build_resources(users, alice)
    ws, nid, tab, aid = ids["ws"], ids["node"], ids["tab"], ids["analysis"]
    base = f"/api/workspaces/{ws}"

    attempts = [
        ("GET", base, {}),
        ("PATCH", base, {"json": {"name": "taken"}}),
        ("PUT", f"{base}/open", {}),
        ("DELETE", f"{base}/open", {}),
        ("GET", f"{base}/archive", {}),
        ("GET", f"{base}/nodes", {}),
        (
            "POST",
            f"{base}/nodes",
            {"json": {"kind": "file", "file_path": "corpus/tax.csv"}},
        ),
        ("GET", f"{base}/nodes/{nid}", {}),
        ("PATCH", f"{base}/nodes/{nid}", {"json": {"name": "taken"}}),
        ("GET", f"{base}/nodes/{nid}/schema", {}),
        ("POST", f"{base}/nodes/{nid}/undo", {}),
        (
            "POST",
            f"{base}/nodes/exports",
            {"json": {"node_ids": [nid], "format": "csv"}},
        ),
        (
            "POST",
            f"{base}/sql",
            {"json": {"mode": "query", "node_ids": [nid], "sql": "select 1"}},
        ),
        ("GET", f"{base}/tabs", {}),
        ("GET", f"{base}/tabs/{tab}", {}),
        (
            "PATCH",
            f"{base}/tabs/{tab}",
            {"json": {"kind": "concordance", "name": "taken"}},
        ),
        ("GET", f"{base}/tabs/{tab}/analyses", {}),
        ("GET", f"{base}/analyses", {}),
        ("GET", f"{base}/analyses/{aid}", {}),
        ("GET", f"{base}/analyses/{aid}/result", {}),
        (
            "POST",
            f"{base}/analyses/{aid}/result/query",
            {"json": {"kind": "concordance", "node_id": nid}},
        ),
        ("POST", f"{base}/analyses/{aid}/cancel", {}),
        ("DELETE", f"{base}/tabs/{tab}/analyses", {}),
        ("DELETE", f"{base}/tabs/{tab}", {}),
        ("DELETE", f"{base}/nodes/{nid}", {}),
        ("DELETE", base, {}),
    ]
    leaks = []
    for method, path, kwargs in attempts:
        response = users.request(bob, method, path, **kwargs)
        if response.status_code != 404:
            leaks.append(
                f"{method} {path.replace(ws, '{ws}')} -> {response.status_code} {response.text[:120]}"
            )
    assert leaks == []

    # Bob's own view of the server is empty, and his file root is his own.
    assert _ok(users.request(bob, "GET", "/api/workspaces")) == []
    assert (
        users.request(
            bob, "GET", "/api/user-files/preview", params={"path": "corpus/tax.csv"}
        ).status_code
        == 404
    )
    assert (
        users.request(
            bob, "GET", "/api/user-files/raw", params={"path": "corpus/tax.csv"}
        ).status_code
        == 404
    )

    # Alice's resources are untouched, and her Project is still open (issue 253).
    project = _ok(users.request(alice, "GET", base))
    assert project["name"] == "A's Project"
    assert project["runtime_state"] == "open"
    assert [n["id"] for n in _ok(users.request(alice, "GET", f"{base}/nodes"))] == [nid]
    assert (
        _ok(users.request(alice, "GET", f"{base}/analyses/{aid}"))["state"]
        == "succeeded"
    )
    assert (
        users.request(
            alice, "GET", "/api/user-files/raw", params={"path": "corpus/tax.csv"}
        ).status_code
        == 200
    )


def test_signing_out_ends_only_that_session(users: Users) -> None:
    alice_laptop = users.sign_in("alice")
    alice_phone = users.sign_in("alice")
    bob = users.sign_in("bob")

    assert users.request(alice_laptop, "DELETE", "/api/session").status_code in {
        200,
        204,
    }

    users.client.cookies.clear()
    assert users.request(alice_laptop, "GET", "/api/workspaces").status_code == 401
    assert users.request(alice_phone, "GET", "/api/workspaces").status_code == 200
    assert users.request(bob, "GET", "/api/workspaces").status_code == 200


def test_a_project_removed_on_disk_is_still_unloaded(
    users: Users, tmp_path: Path
) -> None:
    """The owner-side clean-up the issue 253 fix keeps."""

    import shutil

    alice = users.sign_in("alice")
    workspace = _ok(
        users.request(alice, "POST", "/api/workspaces", json={"name": "Gone"}), 201
    )
    ws = workspace["id"]
    _ok(users.request(alice, "PUT", f"/api/workspaces/{ws}/open"))
    shutil.rmtree(tmp_path / "workspaces" / ws)

    assert (
        users.request(
            alice, "PATCH", f"/api/workspaces/{ws}", json={"name": "x"}
        ).status_code
        == 404
    )
    slot = users.runtime.workspace_service._residency._slots.get(uuid.UUID(ws))
    assert slot is None or slot.workspace is None
