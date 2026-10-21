"""OpenAI and Custom OpenAI-compatible Annotation adapters."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import cast

from .annotation_adapter import (
    MODEL_DISCOVERY_MAX_RETRIES,
    MODEL_DISCOVERY_TIMEOUT_SECONDS,
    AnnotationResponseError,
    InferenceConfig,
    INFERENCE_CONNECT_TIMEOUT_SECONDS,
    INFERENCE_TIMEOUT_SECONDS,
    completion_error,
    max_completion_tokens,
)
from .model_descriptions import (
    ModelOption,
    litellm_model_descriptions,
    sanitize_description,
)


# Custom servers that rejected the thinking switch, or the labels schema as
# response_format (issue 406); neither is sent to them again in this process.
_THINKING_SWITCH_REJECTED: set[str] = set()
_LABELS_SCHEMA_REJECTED: set[str] = set()


@dataclass(frozen=True, slots=True)
class OpenAIAnnotationAdapter:
    base_url: str | None = None
    supports_json_response_format: bool = True
    # Send chat_template_kwargs.enable_thinking (vLLM, SGLang, oMLX), so a
    # model that thinks by default, such as Qwen, follows the Reasoning switch.
    send_thinking_switch: bool = False
    # Send the batch's labels schema as a strict json_schema response_format,
    # so the server enforces one known label (or null) per text (issue 406).
    send_labels_schema: bool = False
    # Also look for model descriptions in LiteLLM's /model/info (Custom only).
    describe_from_model_info: bool = False
    # The OpenAI ``user`` field. Set only by server AI providers, from the
    # signed-in account (issue 411); never from the client.
    end_user: str | None = None

    async def complete(
        self,
        model: str,
        api_key: str | None,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str:
        from openai import AsyncOpenAI, Omit, Timeout, omit
        from openai.types import ReasoningEffort
        from openai.types.chat import ChatCompletionMessageParam
        from openai.types.chat.completion_create_params import ResponseFormat

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
        end_user: str | Omit = omit if self.end_user is None else self.end_user
        labels_schema = (
            config.labels_schema
            if self.send_labels_schema
            and self.base_url not in _LABELS_SCHEMA_REJECTED
            else None
        )

        def response_format(with_schema: bool) -> ResponseFormat | Omit:
            if with_schema and labels_schema is not None:
                return {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "labels",
                        "strict": True,
                        "schema": labels_schema,
                    },
                }
            if self.supports_json_response_format:
                return {"type": "json_object"}
            return omit

        # The full request first; a server that rejects an optional part (the
        # labels schema, the thinking switch) gets the request without it.
        schema_on = labels_schema is not None
        variants = [(schema_on, thinking_switch)]
        if schema_on:
            variants.append((False, thinking_switch))
        if thinking_switch:
            variants.append((schema_on, False))
        if schema_on and thinking_switch:
            variants.append((False, False))

        # Each request's client is closed when the request ends. Clients left
        # for the garbage collector made about 1 in 80 requests on a hosted
        # gateway hang until the timeout.
        async with AsyncOpenAI(
            api_key=api_key or "no-key-required",
            base_url=self.base_url,
            timeout=Timeout(
                INFERENCE_TIMEOUT_SECONDS, connect=INFERENCE_CONNECT_TIMEOUT_SECONDS
            ),
            max_retries=0,
        ) as client:
            try:
                for index, (with_schema, with_thinking) in enumerate(variants):
                    try:
                        completion = await client.chat.completions.create(
                            model=model,
                            messages=messages,
                            temperature=temperature,
                            reasoning_effort=reasoning_effort,
                            max_completion_tokens=max_completion_tokens(config),
                            response_format=response_format(with_schema),
                            stream=False,
                            user=end_user,
                            extra_body=(
                                {
                                    "chat_template_kwargs": {
                                        "enable_thinking": config.reasoning_enabled
                                    }
                                }
                                if with_thinking
                                else None
                            ),
                        )
                    except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
                        rejected = completion_error(error, "OpenAI request failed")
                        if (
                            index == len(variants) - 1
                            or rejected.code != "annotation_provider_request_rejected"
                        ):
                            raise
                        continue
                    # Remember only what the server took the request without.
                    if self.base_url is not None:
                        if schema_on and not with_schema:
                            _LABELS_SCHEMA_REJECTED.add(self.base_url)
                        if thinking_switch and not with_thinking:
                            _THINKING_SWITCH_REJECTED.add(self.base_url)
                    break
            except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
                raise completion_error(error, "OpenAI request failed") from error
        choice = completion.choices[0]
        if choice.finish_reason == "length":
            raise AnnotationResponseError(
                "Annotation response reached its output limit"
            )
        return choice.message.content or ""

    async def _listed_models(self, api_key: str | None) -> list[ModelOption]:
        """The /models list, sorted, with any description field it carries."""

        from openai import AsyncOpenAI

        options: dict[str, str | None] = {}
        async with AsyncOpenAI(
            api_key=api_key or "no-key-required",
            base_url=self.base_url,
            timeout=MODEL_DISCOVERY_TIMEOUT_SECONDS,
            max_retries=MODEL_DISCOVERY_MAX_RETRIES,
        ) as client:
            try:
                async for model in client.models.list():
                    if isinstance(model.id, str) and model.id:
                        # OpenRouter-style lists add a description field.
                        extra = getattr(model, "model_extra", None) or {}
                        options[model.id] = options.get(model.id) or sanitize_description(
                            extra.get("description")
                        )
            except Exception as error:  # noqa: BLE001 - normalize SDK failure shapes
                raise completion_error(error, "Model listing failed") from error
        return [
            ModelOption(model, options[model])
            for model in sorted(options, key=str.lower)
        ]

    async def list_models(self, api_key: str | None) -> list[str]:
        return [option.id for option in await self._listed_models(api_key)]

    async def list_model_options(self, api_key: str | None) -> list[ModelOption]:
        """Models with a one-line description where the server offers one."""

        if not self.describe_from_model_info or self.base_url is None:
            return await self._listed_models(api_key)
        # Asked at the same time, so /model/info (at most 5 s) adds no wait
        # beyond its own cap and never fails the list.
        listed, info = await asyncio.gather(
            self._listed_models(api_key),
            litellm_model_descriptions(self.base_url, api_key),
        )
        return [
            ModelOption(option.id, option.description or info.get(option.id))
            for option in listed
        ]


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
            send_labels_schema=True,
        ).complete(model, api_key, system, user, config)

    async def list_models(self, api_key: str | None) -> list[str]:
        return await OpenAIAnnotationAdapter(
            base_url=self.base_url,
            supports_json_response_format=False,
        ).list_models(api_key)

    async def list_model_options(self, api_key: str | None) -> list[ModelOption]:
        return await OpenAIAnnotationAdapter(
            base_url=self.base_url,
            supports_json_response_format=False,
            describe_from_model_info=True,
        ).list_model_options(api_key)


__all__ = [
    "CustomOpenAICompatibleAnnotationAdapter",
    "OpenAIAnnotationAdapter",
]
