"""Annotation provider-discovery application service."""

from __future__ import annotations

from ..domain.annotation import provider_failure_message
from ..infrastructure.providers.annotation_ai import (
    AnnotationAiError,
    resolve_provider_adapter,
)
from ..shared.errors import (
    AnnotationProviderError,
)
from ..models.annotations import (
    AnnotationModelsRequest,
    AnnotationModelsResource,
)
from .provider_credentials import ProviderCredentialStore


class AnnotationService:
    """Own Annotation provider discovery outside FastAPI routers."""

    def __init__(
        self,
        *,
        credentials: ProviderCredentialStore,
    ) -> None:
        self._credentials = credentials

    async def models(
        self,
        request: AnnotationModelsRequest,
    ) -> AnnotationModelsResource:
        """List models for one verified built-in or trusted Custom configuration."""

        api_key = await self._credentials.resolve_annotation_provider(
            request,
            supplied=request.api_key,
        )
        try:
            discovered = await resolve_provider_adapter(
                request.provider,
                request.provider_base_url,
            ).list_models(api_key)
        except AnnotationAiError as exc:
            # A plain sentence for users; the provider's text is the cause,
            # shown under Details (issue 205).
            raise AnnotationProviderError(
                exc.code,
                provider_failure_message(exc.code, request.provider),
                provider=request.provider,
            ) from exc
        return AnnotationModelsResource(
            provider_configuration_id=request.provider_configuration_id,
            provider=request.provider,
            provider_base_url=request.provider_base_url,
            models=discovered,
        )

__all__ = ["AnnotationService"]
