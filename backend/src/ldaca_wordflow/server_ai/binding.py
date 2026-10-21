"""Key-free credentials for server AI providers, bound to the signed-in user.

A server provider's key never leaves the server environment. Where Wordflow
passes an API key around (to the scheduler, a worker process, the adapter),
it passes a signed binding instead: which provider, which user, and whether
it is a Run or a Preview. The adapter checks the signature, sends the user as
the OpenAI ``user`` field when the provider asks for it, and adds the key
itself. The user always comes from the authenticated session, never from the
client.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, cast
from urllib.parse import urlsplit

from pydantic import SecretStr

from ..domain.annotation import AnnotationProviderSnapshot
from ..shared.errors import InvalidInputError, ProviderCredentialMissingError
from .config import PLACEHOLDER_HOST_SUFFIX, ServerAiProvider, server_ai_providers

if TYPE_CHECKING:
    from ..services.sessions import SessionService

Purpose = Literal["run", "preview"]

# What credential resolution returns for a server provider before the calling
# service binds it to its user. It holds no secret.
_UNBOUND_PREFIX = "server-ai:unbound:"
_BINDING_PREFIX = "server-ai:v1:"
_SIGNING_LABEL = b"wordflow-server-ai-binding-v1\x00"


@dataclass(frozen=True, slots=True)
class ServerAiBinding:
    slug: str
    purpose: Purpose
    user_id: str
    # Empty when the provider sends no user field.
    end_user: str


class ServerAiBindingError(ValueError):
    """A credential that claims to be a server binding but is not valid."""


def unbound_credential(provider: ServerAiProvider) -> str:
    return f"{_UNBOUND_PREFIX}{provider.slug}"


def _supplied_value(supplied: SecretStr | str | None) -> str | None:
    return supplied.get_secret_value() if isinstance(supplied, SecretStr) else supplied


def claims_annotation_provider(
    snapshot: AnnotationProviderSnapshot,
    supplied: SecretStr | str | None,
) -> ServerAiProvider | None:
    """The server provider this request uses, or None for any other provider.

    A key from the client is never used for a server provider, and a value
    that looks like a server credential is refused for every provider.
    """

    supplied_value = _supplied_value(supplied)
    if supplied_value is not None and supplied_value.startswith(
        (_BINDING_PREFIX, _UNBOUND_PREFIX)
    ):
        raise InvalidInputError("This API key is not accepted")
    provider = server_ai_providers().by_id(snapshot.provider_configuration_id)
    if provider is None:
        if _is_placeholder(snapshot.provider_base_url):
            # For example a Project made on another server.
            raise ProviderCredentialMissingError(
                "This server doesn't offer the AI provider this Analysis used. "
                "Choose another provider."
            )
        return None
    if snapshot.provider != "custom":
        raise InvalidInputError(
            "Annotation provider configuration does not match the request"
        )
    if supplied_value:
        raise InvalidInputError(f"{provider.name} does not take an API key")
    model = getattr(snapshot, "model", None)
    if isinstance(model, str) and provider.models and model not in provider.models:
        raise InvalidInputError(f"This model is not available through {provider.name}")
    return provider


def _is_placeholder(base_url: str | None) -> bool:
    host = (urlsplit(base_url).hostname or "") if base_url else ""
    return host.endswith(PLACEHOLDER_HOST_SUFFIX)


def unbound_provider(credential: str | None) -> ServerAiProvider | None:
    if credential is None or not credential.startswith(_UNBOUND_PREFIX):
        return None
    return server_ai_providers().by_slug(credential.removeprefix(_UNBOUND_PREFIX))


def _signature(provider: ServerAiProvider, payload: str) -> str:
    key = hashlib.sha256(
        _SIGNING_LABEL + provider.slug.encode() + b"\x00" + provider.api_key().encode()
    ).digest()
    return hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _b64(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _unb64(value: str) -> str:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8")


def encode_binding(binding: ServerAiBinding) -> str:
    provider = server_ai_providers().by_slug(binding.slug)
    if provider is None:
        raise RuntimeError("Unknown server AI provider")
    payload = (
        f"{_BINDING_PREFIX}{binding.slug}:{binding.purpose}:"
        f"{_b64(binding.user_id)}:{_b64(binding.end_user)}"
    )
    return f"{payload}:{_signature(provider, payload)}"


def is_binding(credential: str | None) -> bool:
    return credential is not None and credential.startswith(_BINDING_PREFIX)


def decode_binding(credential: str | None) -> tuple[ServerAiProvider, ServerAiBinding]:
    """Check the signature; the error never repeats the credential."""

    if credential is None or not is_binding(credential):
        raise ServerAiBindingError("Not a server AI credential")
    payload, _, signature = credential.rpartition(":")
    try:
        slug, purpose, user_id, end_user = payload.removeprefix(_BINDING_PREFIX).split(":")
        binding = ServerAiBinding(slug, cast(Purpose, purpose), _unb64(user_id), _unb64(end_user))
    except ValueError:
        raise ServerAiBindingError("Server AI credential is malformed") from None
    provider = server_ai_providers().by_slug(binding.slug)
    if provider is None or not hmac.compare_digest(signature, _signature(provider, payload)):
        raise ServerAiBindingError("Server AI credential signature is invalid")
    if binding.purpose not in ("run", "preview"):
        raise ServerAiBindingError("Server AI credential is malformed")
    return provider, binding


def run_binding(credential: str | None) -> tuple[ServerAiProvider, ServerAiBinding] | None:
    """The provider and binding of a server provider Run; None for anything else."""

    if not is_binding(credential):
        return None
    try:
        provider, binding = decode_binding(credential)
    except ServerAiBindingError:
        return None
    return (provider, binding) if binding.purpose == "run" else None


class EndUserResolver:
    """The value sent as the OpenAI ``user`` field, from the user's account."""

    def __init__(self, sessions: SessionService) -> None:
        self._sessions = sessions

    async def end_user(self, provider: ServerAiProvider, user_id: str) -> str:
        if provider.send_user == "none":
            return ""
        if not self._sessions.settings.multi_user:
            from ..services.sessions import SINGLE_USER

            return SINGLE_USER.email if provider.send_user == "email" else SINGLE_USER.id
        async with self._sessions.hosted_database.connection() as connection:
            if provider.send_user == "email":
                row = await (
                    await connection.execute(
                        "SELECT email AS value FROM users WHERE id = ?", (user_id,)
                    )
                ).fetchone()
            else:
                # One identity per account in practice (emails are unique);
                # the first one is stable if an account ever has more.
                row = await (
                    await connection.execute(
                        "SELECT subject AS value FROM user_identities "
                        "WHERE user_id = ? ORDER BY created_at, issuer LIMIT 1",
                        (user_id,),
                    )
                ).fetchone()
        value = (
            str(cast(Mapping[str, object], row)["value"]).strip() if row is not None else ""
        )
        if not value:
            raise ProviderCredentialMissingError(f"{provider.name} needs a signed-in account")
        return value


__all__ = [
    "EndUserResolver",
    "Purpose",
    "ServerAiBinding",
    "ServerAiBindingError",
    "claims_annotation_provider",
    "decode_binding",
    "encode_binding",
    "is_binding",
    "run_binding",
    "unbound_credential",
    "unbound_provider",
]
