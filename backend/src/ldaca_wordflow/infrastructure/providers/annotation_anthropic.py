"""Anthropic Annotation adapter."""

from __future__ import annotations

from dataclasses import dataclass

from .annotation_adapter import (
    ANSWER_TOKEN_HEADROOM,
    MODEL_DISCOVERY_MAX_RETRIES,
    MODEL_DISCOVERY_TIMEOUT_SECONDS,
    AnnotationAiError,
    InferenceConfig,
    INFERENCE_CONNECT_TIMEOUT_SECONDS,
    INFERENCE_TIMEOUT_SECONDS,
    completion_error,
    reasoning_budget_tokens,
)

_ADAPTIVE_THINKING_MODEL_PREFIXES = (
    "claude-fable-5",
    "claude-mythos-5",
    "claude-mythos-preview",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-sonnet-4-6",
    "claude-sonnet-4-7",
    "claude-sonnet-4-8",
    "claude-sonnet-5",
)


def _uses_adaptive_thinking(model: str) -> bool:
    normalized = model.strip().casefold()
    return normalized.startswith(_ADAPTIVE_THINKING_MODEL_PREFIXES)


@dataclass(frozen=True, slots=True)
class AnthropicAnnotationAdapter:
    async def complete(
        self,
        model: str,
        api_key: str | None,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str:
        if api_key is None:
            raise AnnotationAiError(
                "Anthropic requires an API key",
                code="annotation_provider_authentication_failed",
            )
        from anthropic import AsyncAnthropic, Omit, Timeout, omit
        from anthropic.types import OutputConfigParam, TextBlock, ThinkingConfigParam

        max_tokens = ANSWER_TOKEN_HEADROOM
        thinking: ThinkingConfigParam | Omit = omit
        output_config: OutputConfigParam | Omit = omit
        if config.reasoning_enabled:
            budget = reasoning_budget_tokens(config.reasoning_effort)
            max_tokens = budget + ANSWER_TOKEN_HEADROOM
            if _uses_adaptive_thinking(model):
                thinking = {"type": "adaptive"}
                output_config = {"effort": config.reasoning_effort}
            else:
                thinking = {"type": "enabled", "budget_tokens": budget}
        # Closed when the request ends, never left for the garbage collector.
        async with AsyncAnthropic(
            api_key=api_key,
            timeout=Timeout(
                INFERENCE_TIMEOUT_SECONDS, connect=INFERENCE_CONNECT_TIMEOUT_SECONDS
            ),
            max_retries=0,
        ) as client:
            try:
                message = await client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                    thinking=thinking,
                    output_config=output_config,
                )
            except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
                raise completion_error(error, "Anthropic request failed") from error
        return "".join(
            block.text for block in message.content if isinstance(block, TextBlock)
        )

    async def list_models(self, api_key: str | None) -> list[str]:
        if api_key is None:
            raise AnnotationAiError(
                "Anthropic requires an API key",
                code="annotation_provider_authentication_failed",
            )
        from anthropic import AsyncAnthropic

        ids: set[str] = set()
        async with AsyncAnthropic(
            api_key=api_key,
            timeout=MODEL_DISCOVERY_TIMEOUT_SECONDS,
            max_retries=MODEL_DISCOVERY_MAX_RETRIES,
        ) as client:
            try:
                async for model in client.models.list():
                    if isinstance(model.id, str) and model.id:
                        ids.add(model.id)
            except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
                raise completion_error(error, "Model listing failed") from error
        return sorted(ids, key=str.lower)


__all__ = ["AnthropicAnnotationAdapter"]
