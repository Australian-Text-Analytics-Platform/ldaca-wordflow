"""Google GenAI Annotation adapter."""

from __future__ import annotations

from dataclasses import dataclass

from .annotation_adapter import (
    INFERENCE_TIMEOUT_SECONDS,
    MODEL_DISCOVERY_MAX_RETRIES,
    MODEL_DISCOVERY_TIMEOUT_SECONDS,
    AnnotationAiError,
    InferenceConfig,
    completion_error,
    max_completion_tokens,
    reasoning_budget_tokens,
)
from .model_descriptions import ModelOption, sanitize_description


def _strip_model_prefix(name: str) -> str:
    return name.removeprefix("models/")


@dataclass(frozen=True, slots=True)
class GoogleAnnotationAdapter:
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
                "Google requires an API key",
                code="annotation_provider_authentication_failed",
            )
        from google import genai
        from google.genai import types

        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=int(INFERENCE_TIMEOUT_SECONDS * 1000),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        thinking_config = (
            types.ThinkingConfig(
                thinking_budget=reasoning_budget_tokens(config.reasoning_effort)
            )
            if config.reasoning_enabled
            else None
        )
        # Both of the SDK's HTTP clients are closed when the request ends.
        try:
            async with client.aio as aio:
                response = await aio.models.generate_content(
                    model=model,
                    contents=user,
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        temperature=config.temperature,
                        max_output_tokens=max_completion_tokens(config),
                        response_mime_type="application/json",
                        thinking_config=thinking_config,
                    ),
                )
        except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
            raise completion_error(error, "Google request failed") from error
        finally:
            client.close()
        return response.text or ""

    async def list_models(self, api_key: str | None) -> list[str]:
        return [option.id for option in await self.list_model_options(api_key)]

    async def list_model_options(self, api_key: str | None) -> list[ModelOption]:
        if api_key is None:
            raise AnnotationAiError(
                "Google requires an API key",
                code="annotation_provider_authentication_failed",
            )
        from google import genai
        from google.genai import types

        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=int(MODEL_DISCOVERY_TIMEOUT_SECONDS * 1000),
                retry_options=types.HttpRetryOptions(
                    attempts=MODEL_DISCOVERY_MAX_RETRIES + 1
                ),
            ),
        )
        options: dict[str, str | None] = {}
        try:
            async with client.aio as aio:
                async for model in await aio.models.list():
                    if isinstance(model.name, str) and model.name:
                        name = _strip_model_prefix(model.name)
                        options[name] = options.get(name) or sanitize_description(
                            getattr(model, "description", None)
                        )
        except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
            raise completion_error(error, "Model listing failed") from error
        finally:
            client.close()
        return [ModelOption(name, options[name]) for name in sorted(options, key=str.lower)]


__all__ = ["GoogleAnnotationAdapter"]
