"""Run:ai sign-in (APOLLO_AUTH=runai_proxy) on the deploy/apollo branch."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from ldaca_wordflow.apollo_deploy import auth_config, runai_proxy
from ldaca_wordflow.apollo_deploy.runai_proxy import (
    IdentityError,
    read_identity,
    strip_credentials,
)
from ldaca_wordflow.main import create_app
from ldaca_wordflow.runtime import Runtime, runtime_context
from ldaca_wordflow.server_launcher import _prepare_server
from ldaca_wordflow.settings import Settings

HOST = "wordflow.example"
ORIGIN = f"https://{HOST}"
LOOPBACK = ("127.0.0.1", 50000)


def identity(
    subject: str = "uuid-alice", email: str = "Alice@Uni.edu", name: str = "alice"
) -> dict[str, str]:
    return {
        "X-Forwarded-User": subject,
        "X-Forwarded-Email": email,
        "X-Forwarded-Preferred-Username": name,
    }


@pytest.fixture
def runai_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("APOLLO_AUTH", "runai_proxy")
    monkeypatch.setenv("APOLLO_PUBLIC_URL", ORIGIN)
    auth_config.apollo_auth_settings.cache_clear()
    yield
    auth_config.apollo_auth_settings.cache_clear()


def hosted_settings(tmp_path: Path, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "data_root": tmp_path,
        "multi_user": True,
        "session_cookie_secure": True,
        "trusted_hosts": (HOST,),
        "cors_allowed_origins": (ORIGIN,),
    }
    values.update(overrides)
    return Settings.model_validate(values)


@pytest.fixture
def app_and_runtime(
    tmp_path: Path, finite_quota_test_filesystem: None, runai_env: None
) -> Iterator[tuple[TestClient, dict[str, Runtime]]]:
    captured: dict[str, Runtime] = {}

    @asynccontextmanager
    async def capture(settings: Settings) -> AsyncIterator[Runtime]:
        async with runtime_context(settings) as runtime:
            captured["runtime"] = runtime
            yield runtime

    app = create_app(hosted_settings(tmp_path), capture, serve_frontend=False)
    with TestClient(app, base_url=ORIGIN, client=LOOPBACK) as client:
        yield client, captured


def test_identity_from_loopback_peer_becomes_a_session(app_and_runtime) -> None:
    client, _ = app_and_runtime
    response = client.get("/api/session", headers=identity())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "multi_user"
    assert body["authenticated"] is True
    assert body["user"]["email"] == "alice@uni.edu"
    assert body["user"]["name"] == "alice"
    assert body["csrf_token"]
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("wordflow_session=")
    assert (
        "HttpOnly" in cookie and "Secure" in cookie and "samesite=lax" in cookie.lower()
    )


def test_existing_session_is_reused(app_and_runtime) -> None:
    client, _ = app_and_runtime
    first = client.get("/api/session", headers=identity())
    second = client.get("/api/session", headers=identity())
    assert first.status_code == second.status_code == 200
    assert "set-cookie" not in second.headers
    assert second.json()["user"]["id"] == first.json()["user"]["id"]


def test_non_loopback_peer_is_refused_even_with_forwarded_for(
    tmp_path: Path, finite_quota_test_filesystem: None, runai_env: None
) -> None:
    app = create_app(hosted_settings(tmp_path), serve_frontend=False)
    with TestClient(app, base_url=ORIGIN, client=("10.1.2.3", 40000)) as client:
        response = client.get(
            "/api/session", headers={**identity(), "X-Forwarded-For": "127.0.0.1"}
        )
    assert response.status_code == 403
    assert response.json()["code"] == "runai_proxy_required"


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Forwarded-Email": "alice@uni.edu"},
        {"X-Forwarded-User": "uuid-alice"},
        {"X-Forwarded-User": " ", "X-Forwarded-Email": "alice@uni.edu"},
        {},
    ],
)
def test_missing_or_partial_identity_gets_sign_in(app_and_runtime, headers) -> None:
    client, captured = app_and_runtime
    api = client.get("/api/session", headers=headers)
    assert api.status_code == 401
    assert api.json()["code"] == "runai_sign_in_required"
    page = client.get("/", headers=headers)
    assert page.status_code == 401
    assert "Sign in through Run:ai" in page.text

    async def count_users() -> int:
        async with captured[
            "runtime"
        ].session_service.hosted_database.connection() as c:
            return (await (await c.execute("SELECT COUNT(*) FROM users")).fetchone())[0]

    assert anyio.run(count_users) == 0


def test_health_needs_no_identity(app_and_runtime) -> None:
    client, _ = app_and_runtime
    assert client.get("/health/live").status_code == 200


def test_duplicate_identity_header_is_rejected() -> None:
    auth = auth_config.ApolloAuthSettings(auth="runai_proxy", public_url=ORIGIN)
    raw = [
        (b"x-forwarded-user", b"uuid-alice"),
        (b"x-forwarded-email", b"alice@uni.edu"),
        (b"X-Forwarded-Email", b"mallory@uni.edu"),
    ]
    with pytest.raises(IdentityError) as error:
        read_identity(raw, auth)
    assert error.value.code == "runai_identity_duplicated"


def test_groups_and_underscore_variants_never_count() -> None:
    auth = auth_config.ApolloAuthSettings(auth="runai_proxy", public_url=ORIGIN)
    raw = [
        (b"x-forwarded-user", b"uuid-alice"),
        (b"x-forwarded-email", b"alice@uni.edu"),
        (b"x-forwarded-groups", b"a"),
        (b"x-forwarded-groups", b"b"),
        (b"x_forwarded_email", b"mallory@uni.edu"),
    ]
    assert read_identity(raw, auth) == ("uuid-alice", "alice@uni.edu", "alice@uni.edu")


def test_sidecar_credentials_are_stripped() -> None:
    cleaned, token = strip_credentials(
        [
            (b"authorization", b"Bearer eyJ.sidecar.jwt"),
            (
                b"cookie",
                b"InteractiveWorkload-runai-ns-wf-url=secret; wordflow_session=abc; other=x",
            ),
            (b"accept", b"*/*"),
        ]
    )
    assert token == "abc"
    assert (b"accept", b"*/*") in cleaned
    assert all(name.lower() != b"authorization" for name, _ in cleaned)
    assert [v for n, v in cleaned if n == b"cookie"] == [b"wordflow_session=abc"]


def test_account_switch_issues_a_new_session(app_and_runtime) -> None:
    client, _ = app_and_runtime
    alice = client.get("/api/session", headers=identity())
    bob = client.get(
        "/api/session",
        headers=identity(subject="uuid-bob", email="bob@uni.edu", name="bob"),
    )
    assert bob.status_code == 200
    assert "set-cookie" in bob.headers
    assert bob.json()["user"]["email"] == "bob@uni.edu"
    assert bob.json()["user"]["id"] != alice.json()["user"]["id"]


def test_recreated_account_is_relinked_by_email(
    app_and_runtime, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = app_and_runtime
    warnings: list[str] = []
    monkeypatch.setattr(
        runai_proxy.logger, "warning", lambda msg, *args: warnings.append(msg % args)
    )
    before = client.get("/api/session", headers=identity(subject="uuid-old")).json()[
        "user"
    ]
    client.cookies.clear()
    after = client.get("/api/session", headers=identity(subject="uuid-new")).json()[
        "user"
    ]
    assert after["id"] == before["id"]
    assert any("uuid-old" in w and "uuid-new" in w for w in warnings)


def test_email_owned_by_another_sign_in_method_is_refused(app_and_runtime) -> None:
    client, captured = app_and_runtime

    async def other_issuer() -> None:
        await captured["runtime"].session_service.upsert_oidc_user(
            issuer="https://other.example",
            subject="s",
            email="alice@uni.edu",
            name="A",
            picture=None,
        )

    anyio.run(other_issuer)
    response = client.get("/api/session", headers=identity())
    assert response.status_code == 403
    assert response.json()["code"] == "runai_identity_conflict"


def test_csrf_and_origin_still_apply(app_and_runtime) -> None:
    client, _ = app_and_runtime
    token = client.get("/api/session", headers=identity()).json()["csrf_token"]
    no_csrf = client.delete("/api/session", headers={**identity(), "Origin": ORIGIN})
    assert no_csrf.status_code == 403
    assert no_csrf.json()["code"] == "csrf_failed"
    wrong_origin = client.delete(
        "/api/session",
        headers={**identity(), "Origin": "https://evil.example", "X-CSRF-Token": token},
    )
    assert wrong_origin.status_code == 403
    ok = client.delete(
        "/api/session", headers={**identity(), "Origin": ORIGIN, "X-CSRF-Token": token}
    )
    assert ok.status_code == 204


def test_apollo_session_reports_sign_out_url(app_and_runtime) -> None:
    client, _ = app_and_runtime
    response = client.get("/api/apollo/session", headers=identity())
    assert response.status_code == 200
    assert response.json() == {
        "runai_proxy": True,
        "sign_out_url": "/oauth2/sign_out?rd=https%3A%2F%2Fwordflow.example%2F",
    }


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"multi_user": False, "server_host": "127.0.0.1"}, "requires MULTI_USER=true"),
        (
            {
                "cilogon_client_id": "c",
                "cilogon_client_secret": SecretStr("s"),
                "cilogon_redirect_uri": f"{ORIGIN}/api/auth/cilogon/callback",
            },
            "can't be combined",
        ),
        ({"session_cookie_secure": False}, "SESSION_COOKIE_SECURE"),
        ({"trusted_hosts": ("other.example",)}, "TRUSTED_HOSTS"),
        ({"cors_allowed_origins": ("https://other.example",)}, "CORS_ALLOWED_ORIGINS"),
    ],
)
def test_settings_must_agree_with_runai_sign_in(
    tmp_path: Path, runai_env: None, overrides: dict[str, object], message: str
) -> None:
    with pytest.raises(ValidationError, match=message):
        hosted_settings(tmp_path, **overrides)


def test_runai_sign_in_alone_satisfies_the_identity_provider_rule(
    tmp_path: Path, runai_env: None
) -> None:
    assert hosted_settings(tmp_path).multi_user is True


@pytest.mark.parametrize(
    "public_url", ["http://wordflow.example", "https://wordflow.example/app", None]
)
def test_public_url_must_be_an_https_origin(public_url: str | None) -> None:
    with pytest.raises(ValidationError):
        auth_config.ApolloAuthSettings(auth="runai_proxy", public_url=public_url)


@pytest.mark.parametrize("host", ["0.0.0.0", "localhost", "::", "10.1.2.3"])
def test_launcher_refuses_non_loopback_bind(
    tmp_path: Path, runai_env: None, host: str
) -> None:
    with pytest.raises(ValueError, match="requires --host 127.0.0.1 or ::1"):
        _prepare_server(
            serve_frontend=False,
            port=0,
            host=host,
            settings=hosted_settings(tmp_path),
            startup_file=tmp_path / "startup.json",
        )


def test_launcher_binds_loopback_without_proxy_headers(
    tmp_path: Path, finite_quota_test_filesystem: None, runai_env: None
) -> None:
    server, listener, current, _ = _prepare_server(
        serve_frontend=False,
        port=0,
        host="127.0.0.1",
        settings=hosted_settings(tmp_path),
        startup_file=tmp_path / "startup.json",
    )
    try:
        assert current.server_host == "127.0.0.1"
        assert server.config.proxy_headers is False
    finally:
        listener.close()


def test_upstream_behaviour_without_runai_sign_in(
    tmp_path: Path, finite_quota_test_filesystem: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("APOLLO_AUTH", raising=False)
    auth_config.apollo_auth_settings.cache_clear()
    try:
        app = create_app(
            Settings(data_root=tmp_path, multi_user=False), serve_frontend=False
        )
        with TestClient(app, base_url="http://localhost", client=LOOPBACK) as client:
            assert (
                client.get("/api/session", headers=identity()).json()["user"]["id"]
                == "root"
            )
            assert client.get("/api/apollo/session").json() == {
                "runai_proxy": False,
                "sign_out_url": None,
            }
    finally:
        auth_config.apollo_auth_settings.cache_clear()
