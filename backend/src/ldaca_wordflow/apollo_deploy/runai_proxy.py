"""Run:ai sign-in: identity headers from the login sidecar become a Wordflow session.

deploy/apollo branch only; active when ``APOLLO_AUTH=runai_proxy``.

Trust model:
- The server binds a loopback address only (checked in ``server_launcher``),
  and uvicorn runs without proxy-header rewriting, so ``scope["client"]`` is
  the real socket peer. Identity headers are read only when that peer is a
  loopback address, i.e. the Run:ai sidecar in the same pod.
- The sidecar replaces any identity headers a browser sends. Wordflow still
  rejects requests that carry an identity header more than once.
- ``X-Forwarded-For`` is never used for trust; the sidecar doesn't sanitise it.

On every request the middleware:
- drops every cookie except Wordflow's own session cookie, and any
  ``Authorization`` header, so the sidecar's credentials never reach a route;
- requires a subject and an email; anything less gets the sign-in page;
- reuses the presented Wordflow session if it belongs to the same Run:ai
  subject, otherwise provisions the user and issues a new session (an account
  switch revokes the old one).

Everything after that (CSRF, routes, streams, Apollo LLM's ``user`` field)
works through the ordinary hosted session machinery.
"""

from __future__ import annotations

import html
import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from ipaddress import ip_address
from typing import cast

from starlette.datastructures import MutableHeaders
from starlette.responses import HTMLResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .._middleware import normalized_scope_path
from ..api.error_response import api_error_response
from ..api.security import SESSION_COOKIE_NAME
from ..models.session import SessionUser
from ..runtime import Runtime
from ..services.sessions import SessionService
from ..shared.errors import ResourceConflictError
from .auth_config import ApolloAuthSettings, apollo_auth_settings

logger = logging.getLogger(__name__)

# Requests that never need an identity (in-pod probes and checks).
_EXEMPT_PREFIXES = ("/health/",)
_MAX_SUBJECT = 255
_MAX_EMAIL = 320
_MAX_NAME = 200


class IdentityError(Exception):
    """The request's identity is missing, malformed or can't be used."""

    def __init__(self, code: str, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _is_loopback(host: object) -> bool:
    if not isinstance(host, str):
        return False
    try:
        return ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


def _clean(value: bytes, limit: int) -> str:
    text = value.decode("latin-1").strip()
    if len(text) > limit or any(ord(c) < 32 or ord(c) == 127 for c in text):
        raise IdentityError(
            "runai_identity_invalid", "The Run:ai identity is malformed", 400
        )
    return text


def read_identity(
    headers: list[tuple[bytes, bytes]], auth: ApolloAuthSettings
) -> tuple[str, str, str]:
    """Return (subject, email, name) from the sidecar headers, or raise.

    Each identity header must appear at most once. Underscore variants are
    never read (only the configured hyphenated names count).
    """

    wanted = {
        auth.header_user.lower().encode(): "subject",
        auth.header_email.lower().encode(): "email",
        auth.header_username.lower().encode(): "name",
    }
    found: dict[str, bytes] = {}
    for raw_name, raw_value in headers:
        key = wanted.get(raw_name.lower())
        if key is None:
            continue
        if key in found:
            raise IdentityError(
                "runai_identity_duplicated",
                "The Run:ai identity header is repeated",
                400,
            )
        found[key] = raw_value
    subject = _clean(found.get("subject", b""), _MAX_SUBJECT)
    email = _clean(found.get("email", b""), _MAX_EMAIL).lower()
    if not subject or not email:
        raise IdentityError(
            "runai_sign_in_required", "Sign in through Run:ai to use Wordflow"
        )
    if email.count("@") != 1 or email.startswith("@") or email.endswith("@"):
        raise IdentityError(
            "runai_identity_invalid", "The Run:ai identity is malformed", 400
        )
    name = _clean(found.get("name", b""), _MAX_NAME) or email
    return subject, email, name


def strip_credentials(
    headers: list[tuple[bytes, bytes]],
) -> tuple[list[tuple[bytes, bytes]], str | None]:
    """Drop ``Authorization`` and every cookie except Wordflow's session cookie.

    Returns the cleaned headers and the presented Wordflow session token.
    """

    kept: list[tuple[bytes, bytes]] = []
    session_token: str | None = None
    for name, value in headers:
        lowered = name.lower()
        if lowered == b"authorization":
            continue
        if lowered == b"cookie":
            for part in value.decode("latin-1").split(";"):
                cookie_name, sep, cookie_value = part.strip().partition("=")
                if sep and cookie_name == SESSION_COOKIE_NAME and session_token is None:
                    session_token = cookie_value
            continue
        kept.append((name, value))
    if session_token is not None:
        kept.append(
            (b"cookie", f"{SESSION_COOKIE_NAME}={session_token}".encode("latin-1"))
        )
    return kept, session_token


async def resolve_user(
    sessions: SessionService,
    *,
    issuer: str,
    subject: str,
    email: str,
    name: str,
) -> SessionUser:
    """Provision or look up the user for one Run:ai identity.

    A re-created Run:ai account arrives with a new subject but the same email.
    If that email's user is linked only to this issuer, the identity is moved
    to the new subject and a warning is logged. This assumes the University
    never gives a used email address to a different person.
    """

    try:
        return await sessions.upsert_oidc_user(
            issuer=issuer, subject=subject, email=email, name=name, picture=None
        )
    except ResourceConflictError:
        pass
    async with sessions.hosted_database.connection() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        rows = await (
            await connection.execute(
                """
                SELECT i.issuer, i.subject, u.id AS user_id
                FROM users AS u
                JOIN user_identities AS i ON i.user_id = u.id
                WHERE u.email = ?
                """,
                (email,),
            )
        ).fetchall()
        identities = [cast(Mapping[str, object], row) for row in rows]
        same_issuer = [row for row in identities if row["issuer"] == issuer]
        if len(identities) != 1 or len(same_issuer) != 1:
            await connection.rollback()
            raise IdentityError(
                "runai_identity_conflict",
                "This email is already linked to another sign-in method",
                403,
            )
        old_subject = str(same_issuer[0]["subject"])
        await connection.execute(
            "UPDATE user_identities SET subject = ? WHERE issuer = ? AND subject = ?",
            (subject, issuer, old_subject),
        )
        await connection.commit()
    logger.warning(
        "Run:ai account re-created: relinked %s from subject %s to %s",
        email,
        old_subject,
        subject,
    )
    return await sessions.upsert_oidc_user(
        issuer=issuer, subject=subject, email=email, name=name, picture=None
    )


def _cookie_header(
    token: str, expires_seconds: int, root_path: str, secure: bool
) -> bytes:
    response = Response()
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=max(0, expires_seconds),
        path=root_path or "/",
        secure=secure,
        httponly=True,
        samesite="lax",
    )
    return response.headers["set-cookie"].encode("latin-1")


def _sign_in_page(message: str) -> HTMLResponse:
    body = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>Sign in through Run:ai</title></head>"
        "<body style='font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem'>"
        "<h1>Sign in through Run:ai</h1>"
        f"<p>{html.escape(message)}</p>"
        "<p>Wordflow on Apollo uses your Run:ai sign-in. If you are signed in and still "
        "see this page, ask the Wordflow administrators for help.</p>"
        "</body></html>"
    )
    return HTMLResponse(body, status_code=401, headers={"Cache-Control": "no-store"})


class RunaiProxyIdentityMiddleware:
    """Turn the Run:ai sidecar's identity into a Wordflow session (see module docs)."""

    def __init__(self, app: ASGIApp, *, auth: ApolloAuthSettings | None = None) -> None:
        self.app = app
        self.auth = auth or apollo_auth_settings()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = normalized_scope_path(scope)
        if path.startswith(_EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return
        state = cast(dict[str, object], scope.setdefault("state", {}))
        request_id = str(state.get("request_id", "missing-request-id"))
        is_api = path.startswith("/api")

        async def refuse(error: IdentityError) -> None:
            if is_api:
                await api_error_response(
                    request_id=request_id,
                    status_code=error.status_code,
                    code=error.code,
                    message=error.message,
                )(scope, receive, send)
            else:
                await _sign_in_page(error.message)(scope, receive, send)

        client = scope.get("client")
        if not client or not _is_loopback(client[0]):
            await refuse(
                IdentityError(
                    "runai_proxy_required",
                    "Wordflow accepts requests only through the Run:ai sign-in",
                    403,
                )
            )
            return

        headers = cast(list[tuple[bytes, bytes]], list(scope.get("headers", [])))
        try:
            subject, email, name = read_identity(headers, self.auth)
        except IdentityError as error:
            await refuse(error)
            return
        cleaned, presented = strip_credentials(headers)

        runtime = state.get("runtime")
        if not isinstance(runtime, Runtime):
            # The data folder is still opening; downstream middleware answers 503.
            scope["headers"] = cleaned
            await self.app(scope, receive, send)
            return
        sessions = runtime.session_service

        try:
            user = await resolve_user(
                sessions,
                issuer=self.auth.issuer(),
                subject=subject,
                email=email,
                name=name,
            )
        except IdentityError as error:
            await refuse(error)
            return

        principal = await sessions.current_principal(presented)
        set_cookie: bytes | None = None
        if principal is None or principal.user.id != user.id:
            if principal is not None:
                # Someone switched Run:ai accounts in this browser.
                await sessions.revoke(presented)
            issued = await sessions.issue(user)
            if await sessions.current_principal(issued.session_token) is None:
                await refuse(
                    IdentityError(
                        "runai_account_inactive",
                        "This Wordflow account is disabled",
                        403,
                    )
                )
                return
            cleaned = [(k, v) for k, v in cleaned if k.lower() != b"cookie"]
            cleaned.append(
                (
                    b"cookie",
                    f"{SESSION_COOKIE_NAME}={issued.session_token}".encode("latin-1"),
                )
            )
            expires = int((issued.expires_at - datetime.now(UTC)).total_seconds())
            set_cookie = _cookie_header(
                issued.session_token,
                expires,
                str(scope.get("root_path") or "").rstrip("/"),
                sessions.settings.session_cookie_secure,
            )

        scope["headers"] = cleaned
        if set_cookie is None:
            await self.app(scope, receive, send)
            return

        async def send_with_cookie(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).append(
                    "set-cookie", set_cookie.decode("latin-1")
                )
            await send(message)

        await self.app(scope, receive, send_with_cookie)


__all__ = [
    "IdentityError",
    "RunaiProxyIdentityMiddleware",
    "read_identity",
    "resolve_user",
    "strip_credentials",
]
