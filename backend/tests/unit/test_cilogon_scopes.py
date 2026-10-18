"""Configurable OIDC scopes and issuers with a path (issue 403).

The hosted sign-in was built for CILogon; other OIDC providers such as the
Run:ai Keycloak realm on Apollo need their own scopes and a realm issuer.
The defaults stay exactly as before.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from ldaca_wordflow.main import create_app
from ldaca_wordflow.runtime import Runtime, runtime_context
from ldaca_wordflow.settings import Settings

DEFAULT_SCOPES = ("openid", "email", "profile", "org.cilogon.userinfo")
RUNAI_ISSUER = "https://gpu.sydney.edu.au/auth/realms/runai"


def test_default_scopes_are_unchanged() -> None:
    assert Settings().cilogon_scopes == DEFAULT_SCOPES


def test_scopes_come_from_json_in_the_environment(monkeypatch) -> None:
    monkeypatch.setenv("CILOGON_SCOPES", '["openid","email","profile"]')
    assert Settings().cilogon_scopes == ("openid", "email", "profile")


@pytest.mark.parametrize(
    ("scopes", "message"),
    [
        ((), "must not be empty"),
        (("email", "profile"), "must include openid"),
        (("openid", "profile"), "must include email"),
        (("openid", "email", "email"), "must be unique"),
        (("openid", "email", "two words"), "one scope token"),
        (("openid", "email", 'say"hi"'), "one scope token"),
        (("openid", "email", "back\\slash"), "one scope token"),
    ],
)
def test_bad_scopes_are_refused_at_startup(scopes, message) -> None:
    with pytest.raises(ValidationError, match=message):
        Settings(cilogon_scopes=scopes)


def test_an_issuer_may_have_a_path_such_as_a_keycloak_realm() -> None:
    settings = Settings(cilogon_issuer=f"{RUNAI_ISSUER}/")
    assert settings.get_cilogon_issuer() == RUNAI_ISSUER
    assert settings.get_cilogon_discovery_url() == (
        f"{RUNAI_ISSUER}/.well-known/openid-configuration"
    )
    assert Settings().get_cilogon_issuer() == "https://test.cilogon.aaf.edu.au"


@pytest.mark.parametrize(
    "issuer",
    [
        "http://gpu.sydney.edu.au/auth/realms/runai",
        "https://gpu.sydney.edu.au//realms/runai",
        "https://gpu.sydney.edu.au/auth/../realms/runai",
        "https://gpu.sydney.edu.au/auth/realms/runai?x=1",
        "https://gpu.sydney.edu.au/auth/realms/runai#top",
        "https://user@gpu.sydney.edu.au/auth/realms/runai",
        "https://gpu.sydney.edu.au:8443/auth/realms/runai",
        "https://gpu.sydney.edu.au/auth/realms/run ai",
    ],
)
def test_issuer_paths_stay_strict(issuer) -> None:
    with pytest.raises(ValidationError, match="HTTPS issuer URL"):
        Settings(cilogon_issuer=issuer)


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        (None, "openid email profile org.cilogon.userinfo"),
        (("openid", "email", "profile"), "openid email profile"),
    ],
)
def test_sign_in_asks_for_the_configured_scopes(
    tmp_path: Path,
    finite_quota_test_filesystem: None,
    monkeypatch,
    configured,
    expected,
) -> None:
    overrides = {} if configured is None else {"cilogon_scopes": configured}
    settings = Settings(
        data_root=tmp_path,
        multi_user=True,
        cilogon_client_id="wordflow-client",
        cilogon_client_secret=SecretStr("secret"),
        cilogon_issuer=RUNAI_ISSUER,
        cilogon_redirect_uri="https://wordflow.example/api/auth/cilogon/callback",
        cors_allowed_origins=(),
        trusted_hosts=("wordflow.example",),
        **overrides,
    )
    captured: dict[str, Runtime] = {}

    @asynccontextmanager
    async def capture_runtime(_settings: Settings) -> AsyncIterator[Runtime]:
        async with runtime_context(_settings) as runtime:
            captured["runtime"] = runtime
            yield runtime

    app = create_app(settings, capture_runtime, serve_frontend=False)
    with TestClient(app, base_url="https://wordflow.example") as client:

        async def discovered() -> dict[str, str]:
            return {
                "issuer": RUNAI_ISSUER,
                "authorization_endpoint": f"{RUNAI_ISSUER}/protocol/openid-connect/auth",
            }

        monkeypatch.setattr(captured["runtime"].oauth_service, "cilogon_config", discovered)
        response = client.get("/api/auth/cilogon/login", follow_redirects=False)

    assert response.status_code == 302, response.text
    location = urlsplit(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == (
        f"{RUNAI_ISSUER}/protocol/openid-connect/auth"
    )
    query = parse_qs(location.query)
    assert query["scope"] == [expected]
    assert query["code_challenge_method"] == ["S256"]
    assert query["client_id"] == ["wordflow-client"]
