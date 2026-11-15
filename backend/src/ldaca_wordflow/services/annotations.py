"""Annotation provider discovery and the AI Code Designer."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

import anyio
import polars as pl
from anyio.to_thread import run_sync as run_sync_in_worker_thread

from ..domain.annotation import provider_failure_message
from ..infrastructure.providers.annotation_adapter import (
    InferenceConfig,
)
from ..infrastructure.providers.annotation_ai import (
    AnnotationAiError,
    list_model_options,
    resolve_provider_adapter,
)
from ..infrastructure.providers.codebook_designer import (
    CodebookAnswerError,
    build_designer_system_prompt,
    build_designer_user_prompt,
    codebook_schema,
    parse_codebook_answer,
    sample_texts,
)
from ..shared.errors import (
    AnnotationProviderError,
    AppError,
)
from ..models.annotations import (
    AnnotationModelsRequest,
    AnnotationModelsResource,
    CodebookDraftCode,
    CodebookDraftErrorEvent,
    CodebookDraftEvent,
    CodebookDraftRequest,
    CodebookDraftResultEvent,
    CodebookDraftStageEvent,
)
from .provider_credentials import ProviderCredentialStore

if TYPE_CHECKING:
    from .workspace import WorkspaceService

_DESIGNER_CONTEXT_LIMIT_MESSAGE = (
    "The sample is too long for this model. Use a smaller sample, or choose a "
    "model that takes longer texts."
)
_DESIGNER_ANSWER_MESSAGE = (
    "The model's answer couldn't be read as a codebook. Try again, or choose "
    "another model."
)


class AnnotationService:
    """Own Annotation provider discovery outside FastAPI routers."""

    def __init__(
        self,
        *,
        credentials: ProviderCredentialStore,
        workspaces: WorkspaceService | None = None,
        io_limiter: anyio.CapacityLimiter | None = None,
    ) -> None:
        self._credentials = credentials
        self._workspaces = workspaces
        self._io_limiter = io_limiter

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
            discovered = await list_model_options(
                resolve_provider_adapter(
                    request.provider,
                    request.provider_base_url,
                    request.provider_configuration_id,
                ),
                api_key,
            )
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
            models=[option.id for option in discovered],
            model_descriptions={
                option.id: option.description
                for option in discovered
                if option.description
            },
        )

    async def draft_codebook(
        self,
        user_id: str,
        workspace_id: uuid.UUID,
        node_id: uuid.UUID,
        request: CodebookDraftRequest,
    ) -> AsyncIterator[CodebookDraftEvent]:
        """One AI Code Designer request, as progress events then a draft or an error.

        Flow: sample the texts under a read lease (released before the model
        is called), resolve the key, send one request, and read the codes.
        Failures become an error event, so the stream always ends with a
        draft or an error. A client that disconnects (Stop) cancels the
        generator, and with it the provider request.
        """

        if self._workspaces is None:
            raise RuntimeError("AnnotationService has no workspace access")
        yield CodebookDraftStageEvent(stage="sampling")
        try:
            async with self._workspaces.read_context(user_id, workspace_id) as lease:
                node = lease.workspace.nodes.get(node_id)
                if node is None:
                    yield CodebookDraftErrorEvent(
                        message="The Annotation Data Block was not found."
                    )
                    return
                sample = await run_sync_in_worker_thread(
                    lambda: sample_texts(
                        node.data,
                        request.text_column,
                        size=request.sample_size,
                        seed=request.sample_seed,
                    ),
                    abandon_on_cancel=False,
                    limiter=self._io_limiter,
                )
        except pl.exceptions.ColumnNotFoundError:
            yield CodebookDraftErrorEvent(
                message=f"The text column “{request.text_column}” is not in this Data Block."
            )
            return
        except AppError as exc:
            yield CodebookDraftErrorEvent(message=exc.message)
            return
        if not sample.texts:
            yield CodebookDraftErrorEvent(
                message="The text column has no texts to sample."
            )
            return

        yield CodebookDraftStageEvent(
            stage="waiting", sampled=len(sample.texts), available=sample.available
        )
        try:
            api_key = await self._credentials.resolve_annotation_provider(
                request,
                supplied=request.api_key,
            )
            adapter = resolve_provider_adapter(
                request.provider,
                request.provider_base_url,
                request.provider_configuration_id,
            )
            config = InferenceConfig(
                temperature=0.0,
                reasoning_enabled=request.reasoning_effort != "none",
                reasoning_effort=(
                    "high"
                    if request.reasoning_effort == "none"
                    else request.reasoning_effort
                ),
                labels_schema=codebook_schema(request.max_classes),
            )
            content = await adapter.complete(
                request.model,
                api_key,
                build_designer_system_prompt(
                    request.system_prompt, request.max_classes
                ),
                build_designer_user_prompt(
                    brief=request.brief,
                    task_context=request.task_context,
                    max_classes=request.max_classes,
                    sample=sample,
                ),
                config,
            )
        except AnnotationAiError as exc:
            yield CodebookDraftErrorEvent(
                message=(
                    _DESIGNER_CONTEXT_LIMIT_MESSAGE
                    if exc.code == "annotation_provider_context_limit"
                    else provider_failure_message(exc.code, request.provider)
                ),
                detail=str(exc),
            )
            return
        except AppError as exc:
            yield CodebookDraftErrorEvent(message=exc.message)
            return

        yield CodebookDraftStageEvent(stage="reading")
        try:
            codes = parse_codebook_answer(content, request.max_classes)
        except CodebookAnswerError as exc:
            yield CodebookDraftErrorEvent(
                message=_DESIGNER_ANSWER_MESSAGE, detail=str(exc)
            )
            return
        yield CodebookDraftResultEvent(
            codes=[
                CodebookDraftCode(name=code.name, definition=code.definition)
                for code in codes
            ],
            sampled=len(sample.texts),
            model=request.model,
        )


__all__ = ["AnnotationService"]
