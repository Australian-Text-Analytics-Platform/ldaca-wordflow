"""The codebook's optional Task context (issue 408)."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from pydantic import ValidationError

from ldaca_wordflow.domain import AnnotationClass
from ldaca_wordflow.domain.annotation import TASK_CONTEXT_CODE
from ldaca_wordflow.domain.workspace import (
    AnnotationAnalysisRequest,
    AnnotationRunAllAnalysisRequest,
)
from ldaca_wordflow.infrastructure.providers import annotation_ai
from ldaca_wordflow.infrastructure.providers.annotation_ai import (
    annotate_all,
    annotate_preview,
    build_annotation_system_prompt,
)
from ldaca_wordflow.models.node_resources import AnnotationClassesNodeEditRequest

CONTEXT = "Tweets by Australian politicians during the 2025 election campaign."


def _request(**update: Any) -> AnnotationAnalysisRequest:
    values: dict[str, Any] = {
        "node_id": uuid.uuid4(),
        "text_column": "text",
        "annotation_column": "annotation",
        "class_node_id": uuid.uuid4(),
        "class_column": "class",
        "description_column": "description",
        "classes": [AnnotationClass(name="Promise"), AnnotationClass(name="Critic")],
        "provider_configuration_id": uuid.uuid4(),
        "provider": "openai",
        "model": "some-model",
        "instruction": "You are an expert text annotator.",
    }
    values.update(update)
    return AnnotationAnalysisRequest(**values)


def test_task_context_comes_after_the_prompt_and_before_the_codes() -> None:
    prompt = build_annotation_system_prompt(
        "You are an expert text annotator.",
        [AnnotationClass(name="Promise")],
        task_context=f"  {CONTEXT}\n",
    )

    instruction_at = prompt.index("You are an expert text annotator.")
    context_at = prompt.index(f"Task context:\n{CONTEXT}\n")
    codes_at = prompt.index("Classify each input text")
    assert instruction_at < context_at < codes_at


@pytest.mark.parametrize("context", ["", "   \n "])
def test_an_empty_task_context_leaves_the_prompt_unchanged(context: str) -> None:
    classes = [AnnotationClass(name="Promise")]
    assert build_annotation_system_prompt(
        "Classify.", classes, task_context=context
    ) == build_annotation_system_prompt("Classify.", classes)


def test_stored_requests_leave_out_an_empty_task_context() -> None:
    # 0.7.14 and earlier refuse unknown fields; an unused Task context must not
    # stop them reading a Project saved by a newer build.
    assert "task_context" not in _request().model_dump(mode="json")
    stored = _request(task_context=CONTEXT).model_dump(mode="json")
    assert stored["task_context"] == CONTEXT
    assert AnnotationAnalysisRequest.model_validate(stored).task_context == CONTEXT
    assert AnnotationAnalysisRequest.model_validate(
        _request().model_dump(mode="json")
    ).task_context == ""


def test_task_context_is_at_most_2000_characters() -> None:
    _request(task_context="x" * 2_000)
    with pytest.raises(ValidationError):
        _request(task_context="x" * 2_001)


def test_the_reserved_row_is_never_a_code() -> None:
    with pytest.raises(ValidationError, match="reserved for the Task context"):
        _request(classes=[AnnotationClass(name="Promise"), AnnotationClass(name="__TASK_CONTEXT__")])


@pytest.mark.anyio
async def test_preview_and_run_send_the_task_context(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    class _Adapter:
        async def complete(self, model, api_key, system, user, config) -> str:
            prompts.append(system)
            return '{"labels": ["Promise"]}'

        async def list_models(self, api_key) -> list[str]:
            return []

    monkeypatch.setattr(annotation_ai, "resolve_provider_adapter", lambda *_args: _Adapter())
    request = _request(task_context=CONTEXT)

    await annotate_preview(request, "key", ["one"])
    await annotate_all(
        AnnotationRunAllAnalysisRequest(source=request, batch_size=1), "key", ["two"]
    )

    assert len(prompts) == 2
    assert all(f"Task context:\n{CONTEXT}" in prompt for prompt in prompts)


def _rows(count: int) -> list[dict[str, str]]:
    return [{"class": f"code {index}", "description": ""} for index in range(count)]


def test_a_codebook_holds_200_codes_plus_the_task_context_row() -> None:
    AnnotationClassesNodeEditRequest(
        class_column="class",
        description_column="description",
        rows=[*_rows(200), {"class": TASK_CONTEXT_CODE, "description": CONTEXT}],
    )
    with pytest.raises(ValidationError, match="at most 200 codes"):
        AnnotationClassesNodeEditRequest(
            class_column="class", description_column="description", rows=_rows(201)
        )
