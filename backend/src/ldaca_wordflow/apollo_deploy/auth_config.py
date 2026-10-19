"""Run:ai sign-in settings (deploy/apollo branch only).

``APOLLO_AUTH=runai_proxy`` makes hosted Wordflow trust the identity headers
that Run:ai's login sidecar adds in front of a workload's external URL. The
sidecar signs people in (Run:ai Keycloak, University SSO) and forwards each
request to the app over the pod's loopback interface. Wordflow then:

- binds only a loopback address, so nothing but the sidecar can reach it;
- reads the identity headers only from a loopback peer;
- turns that identity into an ordinary Wordflow session.

This module has no Wordflow imports so ``settings.py`` can use it during
validation without an import cycle.
"""

from __future__ import annotations

import functools
from ipaddress import ip_address
from typing import Literal
from urllib.parse import quote, urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Hosts the server may bind in this mode: loopback addresses only, never a
# name ("localhost" depends on name resolution) and never a wildcard.
LOOPBACK_BIND_HOSTS = frozenset({"127.0.0.1", "::1"})


class ApolloAuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APOLLO_",
        case_sensitive=False,
        extra="ignore",
        env_ignore_empty=True,
        frozen=True,
    )

    auth: Literal["runai_proxy"] | None = None
    # The externally visible URL, e.g. https://wordflow2026-pilot.gpu.sydney.edu.au.
    # It is the expected browser Origin and the sign-out return address.
    public_url: str | None = Field(default=None, max_length=2_000)
    header_email: str = "X-Forwarded-Email"
    header_user: str = "X-Forwarded-User"
    header_username: str = "X-Forwarded-Preferred-Username"
    # The sidecar's own sign-out path, relative to the public URL.
    sign_out_path: str = "/oauth2/sign_out"

    @field_validator("header_email", "header_user", "header_username")
    @classmethod
    def validate_header_name(cls, value: str) -> str:
        name = value.strip()
        if not name or "_" in name or not all(c.isalnum() or c == "-" for c in name):
            raise ValueError(
                "Identity header names use letters, digits and hyphens only"
            )
        return name

    @model_validator(mode="after")
    def validate_complete(self) -> ApolloAuthSettings:
        if self.auth is None:
            return self
        if not self.public_url:
            raise ValueError(
                "APOLLO_PUBLIC_URL is required with APOLLO_AUTH=runai_proxy"
            )
        parsed = urlsplit(self.public_url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "APOLLO_PUBLIC_URL must be an https origin, e.g. https://host"
            )
        if not self.sign_out_path.startswith("/") or self.sign_out_path.startswith(
            "//"
        ):
            raise ValueError("APOLLO_SIGN_OUT_PATH must be an absolute path")
        return self

    @property
    def runai_proxy(self) -> bool:
        return self.auth == "runai_proxy"

    def public_origin(self) -> str:
        """The exact https origin (scheme://host[:port]) of APOLLO_PUBLIC_URL."""

        if not self.public_url:
            raise RuntimeError("APOLLO_PUBLIC_URL is not configured")
        parsed = urlsplit(self.public_url)
        host = (parsed.hostname or "").casefold()
        port = f":{parsed.port}" if parsed.port not in (None, 443) else ""
        return f"https://{host}{port}"

    def public_host(self) -> str:
        return urlsplit(self.public_origin()).hostname or ""

    def issuer(self) -> str:
        """Identity namespace for these users, kept apart from OIDC issuers."""

        return f"runai-proxy:{self.public_host()}"

    def sign_out_url(self) -> str:
        """The sidecar's sign-out address, returning to Wordflow afterwards."""

        return f"{self.sign_out_path}?rd={quote(self.public_origin() + '/', safe='')}"


@functools.cache
def apollo_auth_settings() -> ApolloAuthSettings:
    """Read once per process (tests clear the cache)."""

    return ApolloAuthSettings()


def is_loopback_bind_host(host: str) -> bool:
    """True only for the literal loopback addresses this mode may bind."""

    candidate = host.strip().strip("[]")
    if candidate not in LOOPBACK_BIND_HOSTS:
        return False
    return ip_address(candidate).is_loopback


def validate_hosted_settings(
    *,
    multi_user: bool,
    has_google: bool,
    has_cilogon: bool,
    session_cookie_secure: bool,
    trusted_hosts: tuple[str, ...],
    cors_allowed_origins: tuple[str, ...],
) -> bool:
    """Check the core settings agree with Run:ai sign-in; return True if it's on.

    Called from ``Settings.validate_deployment_profile`` (apollo-deploy hook).
    """

    auth = apollo_auth_settings()
    if not auth.runai_proxy:
        return False
    if not multi_user:
        raise ValueError("APOLLO_AUTH=runai_proxy requires MULTI_USER=true")
    if has_google or has_cilogon:
        raise ValueError(
            "APOLLO_AUTH=runai_proxy can't be combined with Google or CILogon sign-in"
        )
    if not session_cookie_secure:
        raise ValueError("APOLLO_AUTH=runai_proxy requires SESSION_COOKIE_SECURE=true")
    host = auth.public_host()
    if host not in {h.casefold() for h in trusted_hosts}:
        raise ValueError(f"TRUSTED_HOSTS must include {host} (APOLLO_PUBLIC_URL)")
    if auth.public_origin() not in {
        o.rstrip("/").casefold() for o in cors_allowed_origins
    }:
        raise ValueError(
            f"CORS_ALLOWED_ORIGINS must include {auth.public_origin()} (APOLLO_PUBLIC_URL)"
        )
    return True


__all__ = [
    "LOOPBACK_BIND_HOSTS",
    "ApolloAuthSettings",
    "apollo_auth_settings",
    "is_loopback_bind_host",
    "validate_hosted_settings",
]
