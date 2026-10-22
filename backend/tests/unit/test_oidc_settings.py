"""Sign-in settings are OIDC_*; the earlier CILOGON_* names still work."""

from __future__ import annotations

import pytest

from ldaca_wordflow.settings import Settings

KEYCLOAK = "https://sso.example.edu/auth/realms/research"
CALLBACK = "https://wordflow.example/api/auth/cilogon/callback"
NAMES = ("CLIENT_ID", "CLIENT_SECRET", "ISSUER", "SCOPES", "REDIRECT_URI")


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for prefix in ("OIDC_", "CILOGON_"):
        for name in NAMES:
            monkeypatch.delenv(prefix + name, raising=False)


def _set(monkeypatch: pytest.MonkeyPatch, prefix: str, issuer: str = KEYCLOAK) -> None:
    monkeypatch.setenv(prefix + "CLIENT_ID", f"{prefix.lower()}client")
    monkeypatch.setenv(prefix + "CLIENT_SECRET", f"{prefix.lower()}secret")
    monkeypatch.setenv(prefix + "ISSUER", issuer)
    monkeypatch.setenv(prefix + "SCOPES", '["openid","email","profile"]')
    monkeypatch.setenv(prefix + "REDIRECT_URI", CALLBACK)


@pytest.mark.parametrize("prefix", ["OIDC_", "CILOGON_"])
def test_sign_in_reads_oidc_and_the_earlier_cilogon_names(
    monkeypatch: pytest.MonkeyPatch, prefix: str
) -> None:
    _set(monkeypatch, prefix)

    settings = Settings()

    assert settings.oidc_client_id == f"{prefix.lower()}client"
    assert settings.oidc_client_secret.get_secret_value() == f"{prefix.lower()}secret"
    assert settings.get_oidc_issuer() == KEYCLOAK
    assert settings.oidc_scopes == ("openid", "email", "profile")
    assert settings.oidc_redirect_uri == CALLBACK


def test_oidc_names_win_over_the_earlier_ones(monkeypatch: pytest.MonkeyPatch) -> None:
    _set(monkeypatch, "CILOGON_", issuer="https://cilogon.aaf.edu.au")
    _set(monkeypatch, "OIDC_")

    settings = Settings()

    assert settings.oidc_client_id == "oidc_client"
    assert settings.get_oidc_issuer() == KEYCLOAK


def test_a_half_configured_client_names_the_new_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OIDC_CLIENT_ID", "client")
    with pytest.raises(ValueError, match="OIDC_CLIENT_ID and OIDC_CLIENT_SECRET"):
        Settings()
