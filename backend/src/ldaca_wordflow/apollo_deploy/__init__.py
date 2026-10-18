"""Apollo LLM deployment build (branch deploy/apollo only; never released).

Upstream files call into this package at hooks marked ``# apollo-deploy:``.
With ``APOLLO_LLM_BASE_URL`` unset every hook is a no-op and the build
behaves like upstream Wordflow. See docs/deploy/apollo.md.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .binding import (
    UNBOUND_CREDENTIAL,
    ApolloBinding,
    EndUserResolver,
    Purpose,
    claims_annotation_provider,
    encode_binding,
    is_apollo_base_url,
    run_user,
)
from .config import APOLLO_MAX_CONCURRENCY, apollo_settings
from .gate import user_gate

if TYPE_CHECKING:
    from ..domain.background import Progress
    from ..infrastructure.providers.annotation_adapter import (
        AnnotationProviderAdapter,
    )
    from ..services.sessions import SessionService

_resolver: EndUserResolver | None = None


def install(sessions: SessionService) -> None:
    """Called once per runtime with the service that knows signed-in users.

    Reads the APOLLO_LLM_* settings here, so a wrong one stops start-up
    instead of failing the first Apollo request.
    """

    global _resolver
    apollo_settings.cache_clear()
    apollo_settings()
    _resolver = EndUserResolver(sessions)


async def bind_credential(
    credential: str | None, user_id: str, purpose: Purpose
) -> str | None:
    """Swap the key-free Apollo marker for a binding to this user; others pass."""

    if credential != UNBOUND_CREDENTIAL:
        return credential
    if _resolver is None:
        raise RuntimeError("Apollo LLM identity resolver is not installed")
    end_user = await _resolver.end_user(user_id)
    return encode_binding(ApolloBinding(purpose, user_id, end_user))


def annotation_adapter() -> AnnotationProviderAdapter:
    from .adapter import ApolloAnnotationAdapter

    return ApolloAnnotationAdapter()


def cap_concurrency(adapter: object, requested: int) -> int:
    """Requests at once for a Run: never more than one for Apollo."""

    from .adapter import ApolloAnnotationAdapter

    if isinstance(adapter, ApolloAnnotationAdapter):
        return min(requested, APOLLO_MAX_CONCURRENCY)
    return requested


def scheduler_eligible(credential: str | None) -> bool:
    """Whether queued work may start now; takes the user's Apollo slot if so."""

    owner = run_user(credential)
    if owner is None:
        return True
    return user_gate().try_start_run(owner)


def scheduler_finished(credential: str | None) -> None:
    owner = run_user(credential)
    if owner is not None:
        user_gate().finish_run(owner)


def queued_progress(credential: str | None, user_id: str) -> Progress | None:
    if run_user(credential) is None:
        return None
    return user_gate().queued_progress(user_id)


__all__ = [
    "UNBOUND_CREDENTIAL",
    "annotation_adapter",
    "apollo_settings",
    "bind_credential",
    "cap_concurrency",
    "claims_annotation_provider",
    "install",
    "is_apollo_base_url",
    "queued_progress",
    "scheduler_eligible",
    "scheduler_finished",
    "user_gate",
]
