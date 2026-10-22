"""Server AI providers (issue 411): LLMs the server offers to every signed-in user.

Configured by the YAML file in SERVER_AI_PROVIDERS_FILE (see config.py and
docs/runbooks/server-ai-providers.md). Without it, nothing here changes how
Wordflow behaves.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .binding import (
    EndUserResolver,
    Purpose,
    ServerAiBinding,
    claims_annotation_provider,
    encode_binding,
    run_binding,
    unbound_credential,
    unbound_provider,
)
from .config import (
    ServerAiProvider,
    ServerEmbeddingEndpoint,
    clear_server_ai_providers,
    server_ai_providers,
)
from .gate import user_gate

if TYPE_CHECKING:
    import uuid

    from ..domain.background import Progress
    from ..infrastructure.providers.annotation_adapter import AnnotationProviderAdapter
    from ..services.sessions import SessionService

_resolver: EndUserResolver | None = None


def install(sessions: SessionService) -> None:
    """Called once per runtime: check the providers file, and remember who is signed in.

    A wrong file or a missing key stops start-up.
    """

    global _resolver
    clear_server_ai_providers()
    server_ai_providers()
    _resolver = EndUserResolver(sessions)


async def bind_credential(credential: str | None, user_id: str, purpose: Purpose) -> str | None:
    """Swap a server provider's key-free marker for a binding to this user; others pass."""

    provider = unbound_provider(credential)
    if provider is None:
        return credential
    if _resolver is None:
        raise RuntimeError("Server AI identity resolver is not installed")
    end_user = await _resolver.end_user(provider, user_id)
    return encode_binding(ServerAiBinding(provider.slug, purpose, user_id, end_user))


async def embedding_end_user(endpoint: ServerEmbeddingEndpoint, user_id: str) -> str | None:
    """The OpenAI ``user`` field for a server embedding endpoint, from the
    signed-in account (never from the client); None when it sends none."""

    if endpoint.send_user == "none":
        return None
    if _resolver is None:
        raise RuntimeError("Server AI identity resolver is not installed")
    return await _resolver.end_user(endpoint, user_id)


def annotation_adapter_for(
    configuration_id: uuid.UUID | str | None,
) -> AnnotationProviderAdapter | None:
    """The adapter for a server provider's configuration id; None for any other."""

    provider = server_ai_providers().by_id(configuration_id)
    if provider is None:
        return None
    from .adapter import ServerAiAnnotationAdapter

    return ServerAiAnnotationAdapter(provider)


def cap_concurrency(adapter: object, requested: int) -> int:
    """Requests at once for a Run, within a server provider's per-person limit."""

    from .adapter import ServerAiAnnotationAdapter

    if isinstance(adapter, ServerAiAnnotationAdapter):
        limit = adapter.provider.max_requests_per_user
        if limit is not None:
            return min(requested, limit)
    return requested


def scheduler_eligible(credential: str | None) -> bool:
    """Whether queued work may start now; takes the person's slot if so."""

    found = run_binding(credential)
    if found is None:
        return True
    provider, binding = found
    if provider.max_requests_per_user is None:
        return True
    return user_gate().try_start_run(provider.slug, binding.user_id)


def scheduler_finished(credential: str | None) -> None:
    found = run_binding(credential)
    if found is not None and found[0].max_requests_per_user is not None:
        user_gate().finish_run(found[0].slug, found[1].user_id)


def queued_progress(credential: str | None, user_id: str) -> Progress | None:
    found = run_binding(credential)
    if found is None or found[0].max_requests_per_user is None:
        return None
    return user_gate().queued_progress(found[0], user_id)


__all__ = [
    "ServerAiProvider",
    "ServerEmbeddingEndpoint",
    "annotation_adapter_for",
    "embedding_end_user",
    "bind_credential",
    "cap_concurrency",
    "claims_annotation_provider",
    "install",
    "queued_progress",
    "scheduler_eligible",
    "scheduler_finished",
    "server_ai_providers",
    "unbound_credential",
    "user_gate",
]
