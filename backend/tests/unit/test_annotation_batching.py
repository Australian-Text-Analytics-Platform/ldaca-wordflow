"""Annotation batches sized to the model's context window (issue 493)."""

import json
import uuid

import httpx
import pytest

from ldaca_wordflow.domain import AnnotationClass
from ldaca_wordflow.domain.annotation import text_too_long_message
from ldaca_wordflow.domain.workspace import (
    AnnotationAnalysisRequest,
    AnnotationRunAllAnalysisRequest,
)
from ldaca_wordflow.infrastructure.providers import context_window, model_descriptions
from ldaca_wordflow.infrastructure.providers.annotation_adapter import (
    AnnotationContextLimitError,
    InferenceConfig,
    completion_error,
    context_limit_numbers,
    report_prompt_tokens,
)
from ldaca_wordflow.infrastructure.providers.annotation_ai import (
    annotate_all,
    annotate_preview,
)
from ldaca_wordflow.infrastructure.providers.annotation_anthropic import (
    AnthropicAnnotationAdapter,
)
from ldaca_wordflow.infrastructure.providers.annotation_batching import (
    BatchPlanner,
    TokenBudget,
    estimate_text_tokens,
    estimate_tokens,
)
from ldaca_wordflow.infrastructure.providers.annotation_openai import (
    CustomOpenAICompatibleAnnotationAdapter,
    OpenAIAnnotationAdapter,
)
from ldaca_wordflow.models.analysis_results import AnnotationRunAllStoredResult

WINDOW = 20_000
ANSWER_RESERVE = 4_096


@pytest.fixture(autouse=True)
def _fresh_caches():
    context_window.clear_context_window_cache()
    model_descriptions.clear_model_info_cache()
    yield
    context_window.clear_context_window_cache()
    model_descriptions.clear_model_info_cache()


def _source() -> AnnotationAnalysisRequest:
    return AnnotationAnalysisRequest(
        node_id=uuid.uuid4(),
        text_column="text",
        annotation_column="annotation",
        class_node_id=uuid.uuid4(),
        class_column="class",
        description_column="description",
        classes=[AnnotationClass(name="positive")],
        provider_configuration_id=uuid.uuid4(),
        provider="openai",
        model="some-model",
        instruction="Classify the text",
    )


def _run(batch_size: int = 20, max_concurrency: int | None = None):
    return AnnotationRunAllAnalysisRequest(
        source=_source(), batch_size=batch_size, max_concurrency=max_concurrency
    )


def _tokens(text: str) -> int:
    """The stand-in model's own count: four characters to a token."""

    return len(text) // 4


class _StandInProvider:
    """A model with a context window, which refuses requests over it.

    It answers "positive" for every text and records every request, so a test
    can see what was sent and what was refused.
    """

    def __init__(self, *, window: int = WINDOW, says_window: bool = True) -> None:
        self.window = window
        self.says_window = says_window
        self.sent: list[list[str]] = []
        self.refused: list[list[str]] = []

    async def context_window(self, model: str, api_key: str | None) -> int | None:
        return self.window if self.says_window else None

    async def list_models(self, api_key: str | None) -> list[str]:
        return ["some-model"]

    async def complete(self, model, api_key, system, user, config) -> str:
        texts = json.loads(user.split("\n", 1)[1])
        prompt_tokens = _tokens(system) + _tokens(user)
        if prompt_tokens + ANSWER_RESERVE > self.window:
            self.refused.append(texts)
            raise completion_error(
                Exception(
                    f"This model's maximum context length is {self.window} tokens. "
                    f"However, you requested {prompt_tokens + ANSWER_RESERVE} tokens."
                ),
                "request failed",
            )
        self.sent.append(texts)
        report_prompt_tokens(config, prompt_tokens)
        return json.dumps({"labels": ["positive"] * len(texts)})


@pytest.fixture
def provider(monkeypatch):
    def use(stand_in: _StandInProvider) -> _StandInProvider:
        monkeypatch.setattr(
            "ldaca_wordflow.infrastructure.providers.annotation_ai.resolve_provider_adapter",
            lambda *_args, **_kwargs: stand_in,
        )
        return stand_in

    return use


def _sizes(planner: BatchPlanner) -> list[int]:
    """The number of texts in each batch a planner hands out."""

    sizes: list[int] = []
    while (batch := planner.next()) is not None:
        sizes.append(len(batch.texts))
    return sizes


def _long_texts(count: int, characters: int) -> list[str]:
    return [f"{index:04d} " + "word " * (characters // 5) for index in range(count)]


def test_the_estimate_is_on_the_high_side_for_english_and_escaped_text() -> None:
    english = "The quick brown fox jumps over the lazy dog. " * 40
    assert estimate_tokens(english) >= len(english) / 4
    # json.dumps writes each CJK character as a \uXXXX escape: several tokens.
    chinese = "气候变化是一个全球性的问题" * 20
    assert estimate_text_tokens(chinese) >= 3 * len(chinese)
    # Text sent as it is (the instruction, examples) counts each character.
    assert estimate_tokens(chinese) >= len(chinese)
    assert estimate_tokens("") == 0


def test_a_batch_fills_to_the_text_limit_or_the_token_budget_whichever_is_first() -> None:
    texts = _long_texts(12, 3_000)
    by_count = BatchPlanner(texts, 5, TokenBudget(window=None, reserve=0, overhead=0))
    assert _sizes(by_count) == [5, 5, 2]

    budget = TokenBudget(window=WINDOW, reserve=ANSWER_RESERVE, overhead=200)
    planner = BatchPlanner(texts, 20, budget)
    handed_out: list[str] = []
    while (batch := planner.next()) is not None:
        assert not batch.too_long
        assert 1 <= len(batch.texts) < 20
        estimate = planner.request_estimate(batch.start, len(batch.texts))
        assert estimate + ANSWER_RESERVE <= WINDOW
        handed_out.extend(batch.texts)
    assert handed_out == texts


def test_reported_prompt_tokens_correct_later_batches() -> None:
    budget = TokenBudget(window=WINDOW, reserve=ANSWER_RESERVE, overhead=200)
    before = budget.text_budget()
    assert before is not None
    # The provider counted 3,000 tokens where the estimate said 4,000.
    budget.observe(4_000, 3_000)
    assert budget.calibrated
    assert budget.ratio == pytest.approx(0.75)
    after = budget.text_budget()
    assert after is not None and after > before
    # A refusal that states the request's real size never lowers the ratio.
    budget.learn(limit=16_000, requested=9_000, estimate=6_000)
    assert budget.window == 16_000
    assert budget.ratio == pytest.approx(1.5)


def test_a_window_too_small_for_the_prompt_counts_as_not_known() -> None:
    budget = TokenBudget(window=6_000, reserve=ANSWER_RESERVE, overhead=5_000)
    assert budget.text_budget() is None
    planner = BatchPlanner(["a", "b", "c"], 2, budget)
    assert _sizes(planner) == [2, 1]


@pytest.mark.parametrize(
    ("message", "limit", "requested"),
    [
        (
            "This model's maximum context length is 262144 tokens. However, you "
            "requested 366000 tokens (361904 in the messages, 4096 in the completion).",
            262_144,
            366_000,
        ),
        ("prompt is too long: 213000 tokens > 200000 maximum", 200_000, 213_000),
        (
            "The input token count (1234567) exceeds the maximum number of tokens "
            "allowed (1048576).",
            1_048_576,
            1_234_567,
        ),
        ("context_length_exceeded", None, None),
    ],
)
def test_a_refusal_gives_the_window_and_the_request_size(message, limit, requested) -> None:
    assert context_limit_numbers(message) == (limit, requested)
    error = completion_error(Exception(message), "failed")
    assert isinstance(error, AnnotationContextLimitError)
    assert (error.limit, error.requested) == (limit, requested)


def test_model_lists_give_the_window_in_their_own_fields() -> None:
    windows = context_window.windows_from_model_list(
        {
            "data": [
                {"id": "openrouter/a", "context_length": 128_000,
                 "top_provider": {"context_length": 64_000}},
                {"id": "vllm/b", "max_model_len": 262_144},
                {"id": "plain/c"},
                {"id": "tiny/d", "context_length": 8},
            ]
        }
    )
    assert windows == {"openrouter/a": 64_000, "vllm/b": 262_144}
    assert context_window.windows_from_model_list({"object": "error"}) == {}
    info = model_descriptions._parse_model_info(
        {
            "data": [
                {"model_name": "m", "model_info": {"max_input_tokens": 262_144}},
                {"model_name": "m", "model_info": {"max_input_tokens": 131_072}},
                {"model_name": "n", "model_info": {"max_tokens": 32_768}},
            ]
        }
    )
    assert info.context_windows == {"m": 131_072, "n": 32_768}


async def test_a_run_never_sends_a_batch_over_a_known_window(provider) -> None:
    stand_in = provider(_StandInProvider())
    texts = _long_texts(60, 6_000)

    outcome = await annotate_all(_run(batch_size=20), "key", texts)

    assert stand_in.refused == []
    assert outcome.labels == ["positive"] * len(texts)
    assert outcome.failed_rows == [False] * len(texts)
    assert outcome.failed_batch_count == 0
    assert outcome.context_window == WINDOW
    # Every text was sent once, and every batch is smaller than the text limit.
    assert sorted(text for batch in stand_in.sent for text in batch) == sorted(texts)
    assert all(len(batch) < 20 for batch in stand_in.sent)
    assert len(stand_in.sent) < len(texts)


async def test_a_window_learned_from_a_refusal_sizes_the_later_batches(provider) -> None:
    stand_in = provider(_StandInProvider(says_window=False))
    texts = _long_texts(60, 6_000)

    outcome = await annotate_all(_run(batch_size=20, max_concurrency=1), "key", texts)

    # One batch was wasted finding the window; none after it.
    assert len(stand_in.refused) == 1
    assert outcome.labels == ["positive"] * len(texts)
    assert outcome.failed_row_count == 0
    assert outcome.context_window == WINDOW
    # The window is remembered for the next Run with this model.
    later = provider(_StandInProvider(says_window=False))
    await annotate_all(_run(batch_size=20, max_concurrency=1), "key", texts)
    assert later.refused == []


async def test_without_a_window_batches_go_by_the_number_of_texts_as_before(
    provider,
) -> None:
    stand_in = provider(_StandInProvider(window=10**9, says_window=False))
    texts = [str(index) for index in range(45)]

    outcome = await annotate_all(_run(batch_size=20), "key", texts)

    assert sorted(len(batch) for batch in stand_in.sent) == [5, 20, 20]
    assert outcome.labels == ["positive"] * 45
    assert outcome.context_window is None


async def test_a_text_too_long_for_the_window_fails_only_its_row(provider) -> None:
    stand_in = provider(_StandInProvider())
    texts = _long_texts(6, 2_000)
    texts[3] = "x" * 400_000

    outcome = await annotate_all(_run(batch_size=20), "key", texts)

    assert outcome.labels == ["positive"] * 3 + [None] + ["positive"] * 2
    assert outcome.failed_rows == [False, False, False, True, False, False]
    assert outcome.too_long_rows == [False, False, False, True, False, False]
    assert (outcome.failed_batch_count, outcome.failed_row_count) == (1, 1)
    # It was never sent, so nothing was refused.
    assert stand_in.refused == []
    assert all(texts[3] not in batch for batch in stand_in.sent)


async def test_a_preview_page_is_sent_in_batches_that_fit_the_window(provider) -> None:
    stand_in = provider(_StandInProvider())
    texts = _long_texts(20, 9_000)

    labels = await annotate_preview(_source(), "key", texts)

    assert labels == ["positive"] * 20
    assert stand_in.refused == []
    assert len(stand_in.sent) > 1
    assert [text for batch in sorted(stand_in.sent) for text in batch] == texts


async def test_a_preview_page_that_fits_is_still_one_request(provider) -> None:
    stand_in = provider(_StandInProvider())

    labels = await annotate_preview(_source(), "key", ["one", "two", "three"])

    assert labels == ["positive"] * 3
    assert stand_in.sent == [["one", "two", "three"]]


async def test_a_refused_preview_page_is_cut_smaller_and_sent_again(provider) -> None:
    stand_in = provider(_StandInProvider(says_window=False))
    texts = _long_texts(20, 9_000)

    labels = await annotate_preview(_source(), "key", texts)

    assert labels == ["positive"] * 20
    assert len(stand_in.refused) == 1


async def test_a_preview_with_a_text_too_long_says_which_window(provider) -> None:
    stand_in = provider(_StandInProvider())

    with pytest.raises(AnnotationContextLimitError) as raised:
        await annotate_preview(_source(), "key", ["short", "x" * 400_000])

    assert raised.value.limit == WINDOW
    assert all("x" * 100 not in text for batch in stand_in.sent for text in batch)
    assert stand_in.refused == []
    message = text_too_long_message("some-model", raised.value.limit)
    assert "some-model" in message
    assert "20,000 tokens" in message
    assert "20,000" not in text_too_long_message("some-model", None)


def test_usage_reports_never_fail_a_request() -> None:
    seen: list[int] = []
    config = InferenceConfig(
        temperature=0.0,
        reasoning_enabled=False,
        reasoning_effort="medium",
        on_usage=seen.append,
    )
    for value in (1_200, None, 0, "many", True):
        report_prompt_tokens(config, value)
    assert seen == [1_200]


def test_a_run_result_says_how_many_rows_were_too_long_only_when_some_were() -> None:
    counts = {
        "affected_node_id": uuid.uuid4(),
        "annotation_column": "annotation",
        "committed_workspace_revision": 1,
        "record_count": 10,
        "attempted_count": 10,
        "failed_batch_count": 2,
        "failed_row_count": 2,
        "annotated_count": 8,
    }
    plain = AnnotationRunAllStoredResult.model_validate(counts)
    # Left out, so earlier versions read Results with no too-long rows.
    assert "too_long_row_count" not in plain.model_dump(mode="json")
    assert "context_window_tokens" not in plain.model_dump(mode="json")
    with_long = AnnotationRunAllStoredResult.model_validate(
        {**counts, "too_long_row_count": 1, "context_window_tokens": 262_144}
    )
    assert with_long.model_dump(mode="json")["too_long_row_count"] == 1
    with pytest.raises(ValueError, match="too-long"):
        AnnotationRunAllStoredResult.model_validate({**counts, "too_long_row_count": 3})


def _install_server(monkeypatch, responses: dict[str, httpx.Response]) -> list[httpx.Request]:
    """A stand-in server: each path answers from ``responses``, else 404."""

    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return responses.get(request.url.path, httpx.Response(404))

    def client() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(model_descriptions, "_http_client", client)
    monkeypatch.setattr(context_window, "_http_client", client)
    return seen


async def test_a_gateway_gives_the_window_in_its_model_info(monkeypatch) -> None:
    seen = _install_server(
        monkeypatch,
        {
            "/v1/model/info": httpx.Response(
                200,
                json={"data": [{"model_name": "qwen", "model_info": {"max_input_tokens": 262144}}]},
            )
        },
    )
    adapter = CustomOpenAICompatibleAnnotationAdapter("https://gateway.example.edu/v1")

    assert await adapter.context_window("qwen", "sk-key") == 262_144
    assert await adapter.context_window("qwen", "sk-key") == 262_144
    # Asked once with the key, then answered from the cache.
    assert [request.url.path for request in seen] == ["/v1/model/info"]
    assert seen[0].headers["authorization"] == "Bearer sk-key"


async def test_a_model_list_gives_the_window_when_model_info_does_not(monkeypatch) -> None:
    seen = _install_server(
        monkeypatch,
        {
            "/api/v1/models": httpx.Response(
                200, json={"data": [{"id": "vendor/model", "context_length": 128000}]}
            )
        },
    )
    openrouter = OpenAIAnnotationAdapter(base_url="https://openrouter.ai/api/v1")

    assert await openrouter.context_window("vendor/model", "sk-key") == 128_000
    assert await openrouter.context_window("vendor/other", "sk-key") is None
    assert [request.url.path for request in seen] == ["/api/v1/models"]


async def test_a_provider_that_does_not_say_leaves_the_window_unknown(monkeypatch) -> None:
    seen = _install_server(monkeypatch, {"/v1/models": httpx.Response(500)})

    assert await OpenAIAnnotationAdapter().context_window("gpt", "sk-key") is None
    assert not hasattr(AnthropicAnnotationAdapter(), "context_window")
    custom = CustomOpenAICompatibleAnnotationAdapter("http://127.0.0.1:7888/v1")
    assert await custom.context_window("local-model", None) is None
    # OpenAI's own list is never asked; the local server's two lists were.
    assert {request.url.path for request in seen} == {"/v1/model/info", "/v1/models"}
