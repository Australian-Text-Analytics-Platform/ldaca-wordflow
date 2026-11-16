"""Ordered-scale codebooks: levels from the lowest to the highest (Chao, 16 Nov 2026)."""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from pydantic import ValidationError

from ldaca_wordflow.analysis.annotation_examples import AnnotationExample
from ldaca_wordflow.domain import AnnotationClass
from ldaca_wordflow.domain.annotation import SCALE_CODE, TASK_CONTEXT_CODE
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
from ldaca_wordflow.infrastructure.providers.codebook_designer import (
    NOT_APPLICABLE_CODE,
    OTHER_CODE,
    CodebookAnswerError,
    build_designer_system_prompt,
    build_designer_user_prompt,
    codebook_schema,
    parse_codebook_answer,
    SampledTexts,
)
from ldaca_wordflow.models.annotations import CodebookDraftRequest
from ldaca_wordflow.models.node_resources import AnnotationClassesNodeEditRequest

LEVELS = [AnnotationClass(name="Low"), AnnotationClass(name="Medium"), AnnotationClass(name="High")]
NOT_APPLICABLE = AnnotationClass(name="Not applicable", description="Not a request")


def _request(**update: Any) -> AnnotationAnalysisRequest:
    values: dict[str, Any] = {
        "node_id": uuid.uuid4(),
        "text_column": "text",
        "annotation_column": "annotation",
        "class_node_id": uuid.uuid4(),
        "class_column": "class",
        "description_column": "description",
        "classes": LEVELS,
        "provider_configuration_id": uuid.uuid4(),
        "provider": "openai",
        "model": "some-model",
        "instruction": "You are an expert text annotator.",
    }
    values.update(update)
    return AnnotationAnalysisRequest(**values)


# --- the annotation prompt ---------------------------------------------------


def test_a_scale_prompt_lists_the_levels_lowest_first_and_judges_texts_alone() -> None:
    prompt = build_annotation_system_prompt(
        "Rate.", [*LEVELS, NOT_APPLICABLE], scale=True, outside_scale=["Not applicable"]
    )

    assert "ordered scale" in prompt
    assert "lowest (first) to the highest (last)" in prompt
    assert prompt.index("- Low") < prompt.index("- Medium") < prompt.index("- High")
    # Not applicable is listed apart, after the levels, not as the top level.
    assert prompt.index("- High") < prompt.index("Outside the scale (these codes are not levels):")
    assert prompt.index("Outside the scale") < prompt.index("- Not applicable: Not a request")
    assert "not against the other texts in this batch" in prompt
    assert "If the scale does not apply to a text, use a code outside the scale." in prompt
    assert "Never answer null." in prompt
    assert "use null" not in prompt
    assert "Classify each input text" not in prompt


def test_a_scale_without_codes_outside_it_asks_for_the_closest_level() -> None:
    prompt = build_annotation_system_prompt("Rate.", LEVELS, scale=True)

    assert "Outside the scale" not in prompt
    assert "Give every text the closest level. Never answer null." in prompt


def test_a_category_prompt_asks_for_a_class_for_every_text() -> None:
    prompt = build_annotation_system_prompt("Classify.", LEVELS)

    assert "Classify each input text into exactly one of these classes:" in prompt
    assert "Give every text one class. Never answer null." in prompt
    assert '"Other", if there is one; otherwise use the closest class.' in prompt
    assert "use null" not in prompt
    assert "ordered scale" not in prompt


def test_on_a_scale_examples_do_not_extend_the_levels() -> None:
    examples = [AnnotationExample(text="t", label="Low")]

    assert "may extend the class list" not in build_annotation_system_prompt(
        "Rate.", LEVELS, examples, scale=True
    )
    assert "may extend the class list" in build_annotation_system_prompt(
        "Classify.", LEVELS, examples
    )


def test_stored_requests_leave_out_a_false_scale() -> None:
    # Earlier versions refuse unknown fields; a category codebook must not
    # stop them reading a Project saved by a newer build.
    stored = _request().model_dump(mode="json")
    assert "scale" not in stored
    assert "outside_scale" not in stored
    stored = _request(
        scale=True, classes=[*LEVELS, NOT_APPLICABLE], outside_scale=["Not applicable"]
    ).model_dump(mode="json")
    assert stored["scale"] is True
    assert stored["outside_scale"] == ["Not applicable"]
    restored = AnnotationAnalysisRequest.model_validate(stored)
    assert (restored.scale, restored.outside_scale) == (True, ["Not applicable"])


@pytest.mark.parametrize(
    ("update", "message"),
    [
        ({"outside_scale": ["Low"]}, "need an ordered-scale codebook"),
        ({"scale": True, "outside_scale": ["Unknown"]}, "must be classes"),
        ({"scale": True, "outside_scale": ["Low", "Medium", "High"]}, "at least one level"),
    ],
)
def test_codes_outside_the_scale_are_checked(update: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        _request(**update)


@pytest.mark.parametrize("name", ["__scale__", "__SCALE__", "__task_context__"])
def test_reserved_rows_are_never_codes(name: str) -> None:
    with pytest.raises(ValidationError, match="is reserved for"):
        _request(classes=[AnnotationClass(name="Low"), AnnotationClass(name=name)])


@pytest.mark.anyio
async def test_preview_and_run_rate_on_the_scale_with_level_examples_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    class _Adapter:
        async def complete(self, model, api_key, system, user, config) -> str:
            calls.append((system, config.labels_schema))
            return '{"labels": ["High"]}'

        async def list_models(self, api_key) -> list[str]:
            return []

    monkeypatch.setattr(annotation_ai, "resolve_provider_adapter", lambda *_args: _Adapter())
    request = _request(
        scale=True, classes=[*LEVELS, NOT_APPLICABLE], outside_scale=["Not applicable"]
    )
    examples = [
        AnnotationExample(text="a level example", label="Medium"),
        AnnotationExample(text="an off-scale example", label="Sarcasm"),
    ]

    assert await annotate_preview(request, "key", ["one"], examples) == ["High"]
    await annotate_all(
        AnnotationRunAllAnalysisRequest(source=request, batch_size=1), "key", ["two"], examples
    )

    assert len(calls) == 2
    for system, schema in calls:
        assert "ordered scale" in system
        assert "Outside the scale" in system
        assert "a level example" in system
        assert "an off-scale example" not in system
        assert schema["properties"]["labels"]["items"]["enum"] == [
            "Low",
            "Medium",
            "High",
            "Not applicable",
        ]


def test_a_codebook_holds_200_codes_plus_both_reserved_rows() -> None:
    rows = [{"class": f"level {index}", "description": ""} for index in range(200)]
    AnnotationClassesNodeEditRequest(
        class_column="class",
        description_column="description",
        rows=[
            *rows,
            {"class": SCALE_CODE, "description": "Ordered scale"},
            {"class": TASK_CONTEXT_CODE, "description": "Context"},
        ],
    )


# --- the designer --------------------------------------------------------------


def test_designer_scale_format_asks_for_ordered_levels_then_not_applicable() -> None:
    prompt = build_designer_system_prompt("Design.", 5, scale=True)

    assert "between 2 and 5 levels of one ordered scale" in prompt
    assert "from the lowest to the highest" in prompt
    assert f'named exactly "{NOT_APPLICABLE_CODE}" as the last code' in prompt
    assert "It is not a level." in prompt
    assert f'named exactly "{OTHER_CODE}"' not in prompt
    assert codebook_schema(5, scale=True)["properties"]["codes"]["maxItems"] == 6
    assert codebook_schema(5)["properties"]["codes"]["maxItems"] == 6


def test_designer_scale_user_prompt_counts_levels() -> None:
    prompt = build_designer_user_prompt(
        brief="How urgent is the request?",
        task_context="",
        max_classes=4,
        sample=SampledTexts(texts=["a"], available=1),
        scale=True,
    )

    assert f'Maximum levels: 4 (not counting "{NOT_APPLICABLE_CODE}")' in prompt
    assert OTHER_CODE not in prompt


def _answer(*names: str) -> str:
    return json.dumps({"codes": [{"name": name, "definition": f"{name} def"} for name in names]})


def test_designer_scale_keeps_the_level_order_and_ends_with_not_applicable() -> None:
    codes = parse_codebook_answer(
        _answer("None", "not applicable", "Some", "Strong", "Extreme"), 2, scale=True
    )

    assert [code.name for code in codes] == ["None", "Some", "Not applicable"]
    assert [code.outside_scale for code in codes] == [False, False, True]
    assert codes[-1].definition == "not applicable def"


def test_designer_scale_adds_a_missing_not_applicable() -> None:
    codes = parse_codebook_answer(_answer("Low", "__scale__", "High"), 5, scale=True)
    assert [code.name for code in codes] == ["Low", "High", "Not applicable"]
    assert codes[-1].outside_scale is True
    with pytest.raises(CodebookAnswerError, match="fewer than two levels"):
        parse_codebook_answer(_answer("Only"), 5, scale=True)


def test_designer_request_defaults_to_categories() -> None:
    request = CodebookDraftRequest(
        provider_configuration_id=uuid.uuid4(),
        provider="openai",
        model="m",
        text_column="text",
        brief="b",
        system_prompt="p",
    )
    assert request.scale is False
