"""Key-free Apollo credentials bound to the signed-in user.

The gateway key never leaves the server environment. Where upstream code
passes an API key around (to the scheduler, to a worker process, to the
adapter), this build passes a signed binding instead: which user the request
is for, and whether it is a Run or a Preview. The adapter checks the
signature, sends the user as the OpenAI ``user`` field and adds the real key
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

from pydantic import SecretStr

from ..domain.annotation import AnnotationProviderSnapshot
from ..shared.errors import InvalidInputError, ProviderCredentialMissingError
from .config import (
    APOLLO_CONFIGURATION_ID,
    APOLLO_PLACEHOLDER_BASE_URL,
    APOLLO_PROVIDER_NAME,
    apollo_settings,
)

if TYPE_CHECKING:
    from ..services.sessions import SessionService

Purpose = Literal["run", "preview"]

# What credential resolution returns for the Apollo provider before the
# calling service binds it to its user. It holds no secret.
UNBOUND_CREDENTIAL = "apollo-llm:unbound"
_BINDING_PREFIX = "apollo-user:v1:"
_SIGNING_LABEL = b"wordflow-apollo-user-binding-v1\x00"


@dataclass(frozen=True, slots=True)
class ApolloBinding:
    purpose: Purpose
    user_id: str
    end_user: str


class ApolloBindingError(ValueError):
    """A credential that claims to be an Apollo binding but is not valid."""


def is_apollo_base_url(base_url: str | None) -> bool:
    return base_url == APOLLO_PLACEHOLDER_BASE_URL


def claims_annotation_provider(
    snapshot: AnnotationProviderSnapshot,
    supplied: SecretStr | str | None,
) -> bool:
    """Whether the request uses the built-in Apollo provider.

    Raises for requests that only look like it: another configuration id with
    the placeholder URL, or the Apollo id with any other locator. A key from
    the client is never used for Apollo.
    """

    supplied_value = (
        supplied.get_secret_value() if isinstance(supplied, SecretStr) else supplied
    )
    if supplied_value is not None and supplied_value.startswith(
        (_BINDING_PREFIX, UNBOUND_CREDENTIAL)
    ):
        raise InvalidInputError("This API key is not accepted")
    uses_id = snapshot.provider_configuration_id == APOLLO_CONFIGURATION_ID
    uses_url = is_apollo_base_url(snapshot.provider_base_url)
    if not uses_id and not uses_url:
        return False
    if not (uses_id and uses_url and snapshot.provider == "custom"):
        raise InvalidInputError(
            "Annotation provider configuration does not match the request"
        )
    settings = apollo_settings()
    if not settings.enabled:
        raise ProviderCredentialMissingError(
            f"{APOLLO_PROVIDER_NAME} is not available on this server"
        )
    if supplied_value:
        raise InvalidInputError(f"{APOLLO_PROVIDER_NAME} does not take an API key")
    model = getattr(snapshot, "model", None)
    if isinstance(model, str) and settings.models and model not in settings.models:
        raise InvalidInputError(
            f"This model is not available through {APOLLO_PROVIDER_NAME}"
        )
    return True


def _signature(payload: str) -> str:
    key = hashlib.sha256(
        _SIGNING_LABEL + apollo_settings().gateway_key().encode("utf-8")
    ).digest()
    return hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _b64(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _unb64(value: str) -> str:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8")


def encode_binding(binding: ApolloBinding) -> str:
    payload = (
        f"{_BINDING_PREFIX}{binding.purpose}:{_b64(binding.user_id)}:"
        f"{_b64(binding.end_user)}"
    )
    return f"{payload}:{_signature(payload)}"


def is_binding(credential: str | None) -> bool:
    return credential is not None and credential.startswith(_BINDING_PREFIX)


def decode_binding(credential: str | None) -> ApolloBinding:
    """Check the signature; the error never repeats the credential."""

    if not is_binding(credential):
        raise ApolloBindingError("Not an Apollo LLM credential")
    assert credential is not None
    payload, _, signature = credential.rpartition(":")
    if not hmac.compare_digest(signature, _signature(payload)):
        raise ApolloBindingError("Apollo LLM credential signature is invalid")
    try:
        purpose, user_id, end_user = payload.removeprefix(_BINDING_PREFIX).split(":")
        binding = ApolloBinding(
            cast(Purpose, purpose), _unb64(user_id), _unb64(end_user)
        )
    except ValueError:
        raise ApolloBindingError("Apollo LLM credential is malformed") from None
    if binding.purpose not in ("run", "preview") or not binding.end_user:
        raise ApolloBindingError("Apollo LLM credential is malformed")
    return binding


def run_user(credential: str | None) -> str | None:
    """The user id of an Apollo Run's credential; None for anything else."""

    if not is_binding(credential):
        return None
    try:
        binding = decode_binding(credential)
    except ApolloBindingError:
        return None
    return binding.user_id if binding.purpose == "run" else None


class EndUserResolver:
    """The value sent as the OpenAI ``user`` field, from the user's account."""

    def __init__(self, sessions: SessionService) -> None:
        self._sessions = sessions

    async def end_user(self, user_id: str) -> str:
        field = apollo_settings().user_field
        if not self._sessions.settings.multi_user:
            from ..services.sessions import SINGLE_USER

            return SINGLE_USER.email if field == "email" else SINGLE_USER.id
        async with self._sessions.hosted_database.connection() as connection:
            if field == "email":
                row = await (
                    await connection.execute(
                        "SELECT email AS value FROM users WHERE id = ?",
                        (user_id,),
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
            str(cast(Mapping[str, object], row)["value"]).strip()
            if row is not None
            else ""
        )
        if not value:
            raise ProviderCredentialMissingError(
                f"{APOLLO_PROVIDER_NAME} needs a signed-in account"
            )
        return value


__all__ = [
    "UNBOUND_CREDENTIAL",
    "ApolloBinding",
    "ApolloBindingError",
    "EndUserResolver",
    "Purpose",
    "claims_annotation_provider",
    "decode_binding",
    "encode_binding",
    "is_apollo_base_url",
    "is_binding",
    "run_user",
]
