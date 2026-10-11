"""OpenAI and Custom OpenAI-compatible Annotation adapters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from .annotation_adapter import (
    INFERENCE_TIMEOUT_SECONDS,
    MODEL_DISCOVERY_MAX_RETRIES,
    MODEL_DISCOVERY_TIMEOUT_SECONDS,
    AnnotationResponseError,
    InferenceConfig,
    completion_error,
    max_completion_tokens,
)


# Custom servers that rejected the thinking switch; it isn't sent to them
# again in this process.
_THINKING_SWITCH_REJECTED: set[str] = set()


@dataclass(frozen=True, slots=True)
class OpenAIAnnotationAdapter:
    base_url: str | None = None
    supports_json_response_format: bool = True
    # Send chat_template_kwargs.enable_thinking (vLLM, SGLang, oMLX), so a
    # model that thinks by default, such as Qwen, follows the Reasoning switch.
    send_thinking_switch: bool = False

    async def complete(
        self,
        model: str,
        api_key: str | None,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str:
        from openai import AsyncOpenAI, Omit, omit
        from openai.types import ReasoningEffort
        from openai.types.chat import ChatCompletionMessageParam

        client = AsyncOpenAI(
            api_key=api_key or "no-key-required",
            base_url=self.base_url,
            timeout=INFERENCE_TIMEOUT_SECONDS,
            max_retries=0,
        )
        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        reasoning_effort: ReasoningEffort | Omit = (
            cast(ReasoningEffort, config.reasoning_effort)
            if config.reasoning_enabled
            else omit
        )
        temperature: float | Omit = (
            omit if config.reasoning_enabled else config.temperature
        )
        thinking_switch = (
            self.send_thinking_switch
            and self.base_url not in _THINKING_SWITCH_REJECTED
        )

        async def create(extra_body: dict[str, object] | None):
            if self.supports_json_response_format:
                return await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    reasoning_effort=reasoning_effort,
                    max_completion_tokens=max_completion_tokens(config),
                    response_format={"type": "json_object"},
                    stream=False,
                    extra_body=extra_body,
                )
            return await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                reasoning_effort=reasoning_effort,
                max_completion_tokens=max_completion_tokens(config),
                stream=False,
                extra_body=extra_body,
            )

        try:
            try:
                completion = await create(
                    {
                        "chat_template_kwargs": {
                            "enable_thinking": config.reasoning_enabled
                        }
                    }
                    if thinking_switch
                    else None
                )
            except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
                rejected = completion_error(error, "OpenAI request failed")
                if (
                    not thinking_switch
                    or rejected.code != "annotation_provider_request_rejected"
                ):
                    raise
                # A server that rejects the switch gets the request without it.
                completion = await create(None)
                if self.base_url is not None:
                    _THINKING_SWITCH_REJECTED.add(self.base_url)
        except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
            raise completion_error(error, "OpenAI request failed") from error
        choice = completion.choices[0]
        if choice.finish_reason == "length":
            raise AnnotationResponseError(
                "Annotation response reached its output limit"
            )
        return choice.message.content or ""

    async def list_models(self, api_key: str | None) -> list[str]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=api_key or "no-key-required",
            base_url=self.base_url,
            timeout=MODEL_DISCOVERY_TIMEOUT_SECONDS,
            max_retries=MODEL_DISCOVERY_MAX_RETRIES,
        )
        ids: set[str] = set()
        try:
            async for model in client.models.list():
                if isinstance(model.id, str) and model.id:
                    ids.add(model.id)
        except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
            raise completion_error(error, "Model listing failed") from error
        return sorted(ids, key=str.lower)


@dataclass(frozen=True, slots=True)
class CustomOpenAICompatibleAnnotationAdapter:
    base_url: str

    async def complete(
        self,
        model: str,
        api_key: str | None,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str:
        return await OpenAIAnnotationAdapter(
            base_url=self.base_url,
            supports_json_response_format=False,
            send_thinking_switch=True,
        ).complete(model, api_key, system, user, config)

    async def list_models(self, api_key: str | None) -> list[str]:
        return await OpenAIAnnotationAdapter(
            base_url=self.base_url,
            supports_json_response_format=False,
        ).list_models(api_key)


__all__ = [
    "CustomOpenAICompatibleAnnotationAdapter",
    "OpenAIAnnotationAdapter",
]
