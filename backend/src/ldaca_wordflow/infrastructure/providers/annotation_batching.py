"""Annotation batches sized to the model's context window (issue 493).

Batches used to be cut by the number of texts alone, so long texts made
requests the model had to refuse; each refusal was a wasted round trip before
the batch was halved and sent again. With a known context window, a batch is
filled up to ``batch_size`` texts or the token budget, whichever comes first.

Wordflow has no model's tokenizer, so tokens are estimated on the high side
and corrected during the Run by the prompt tokens providers report. With no
window known, batches are cut by the number of texts, exactly as before, and
a refusal that states the window teaches it for the rest of the Run.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field

# English text is about four characters to a token; three errs on the high side.
ASCII_CHARS_PER_TOKEN = 3
# A \uXXXX escape (a control character, or text that is not valid Unicode):
# six characters that tokenizers split into several tokens.
ESCAPE_TOKENS = 4
# Texts are sent as written. A Chinese, Japanese or Korean character is one to
# two tokens; other scripts are fewer per character, so two is on the high side.
NON_ASCII_TOKENS = 2
# Kept free below the window for what the estimate cannot see.
SAFETY_MARGIN = 0.10
# The provider's count over ours is trusted only within these bounds.
MIN_RATIO = 0.2
MAX_RATIO = 3.0
# Before a provider has reported any count, a lone text is refused without
# being sent only if even half the estimate cannot fit.
UNCALIBRATED_ALLOWANCE = 0.5
# A window that leaves fewer tokens than this for texts counts as not known.
MIN_TEXT_BUDGET = 256
# The wrapper around the texts: role markers, the instruction line, brackets.
REQUEST_OVERHEAD_TOKENS = 64


def estimate_tokens(text: str) -> int:
    """A token count for ``text`` as sent, on the high side."""

    if not text:
        return 0
    escapes = text.count("\\u")
    ascii_only = text.isascii()
    non_ascii = 0 if ascii_only else len(text) - len(text.encode("ascii", "ignore"))
    plain = max(len(text) - non_ascii - escapes * 6, 0)
    return (
        math.ceil(plain / ASCII_CHARS_PER_TOKEN)
        + escapes * ESCAPE_TOKENS
        + non_ascii * NON_ASCII_TOKENS
    )


def json_as_written(value: object) -> str:
    """JSON with every character as written, not as a \\uXXXX code.

    A Chinese character sent as its six-character code costs several tokens
    and is harder for a model to read (issue 493). Text that is not valid
    Unicode cannot be sent as written, so it alone keeps the codes.
    """

    rendered = json.dumps(value, ensure_ascii=False)
    try:
        rendered.encode("utf-8")
    except UnicodeEncodeError:
        return json.dumps(value)
    return rendered


def estimate_text_tokens(text: str) -> int:
    """One text's tokens inside the JSON array a batch is sent as."""

    return estimate_tokens(json_as_written(text)) + 1


@dataclass(slots=True)
class TokenBudget:
    """How many tokens of texts one request may hold, and what it has learned."""

    window: int | None
    # The answer's reserve: max_completion_tokens, with room for thinking.
    reserve: int
    # Estimated tokens of everything but the texts: system prompt and schema.
    overhead: int
    ratio: float = 1.0
    calibrated: bool = False
    _estimated: int = field(default=0, repr=False)
    _reported: int = field(default=0, repr=False)

    def text_budget(self) -> int | None:
        """Estimated tokens of texts a batch may hold; None when not known."""

        if self.window is None:
            return None
        usable = math.floor(self.window * (1 - SAFETY_MARGIN)) - self.reserve
        budget = math.floor(usable / self.ratio) - self.overhead - REQUEST_OVERHEAD_TOKENS
        return budget if budget >= MIN_TEXT_BUDGET else None

    def cannot_fit(self, estimate: int) -> bool:
        """Whether one text alone is certainly too long for the window."""

        if self.window is None:
            return False
        hard_limit = self.window - self.reserve
        allowance = self.ratio if self.calibrated else UNCALIBRATED_ALLOWANCE
        return estimate * allowance > hard_limit

    def observe(self, estimate: int, reported: int) -> None:
        """Correct the estimate by a provider's count for one request."""

        if estimate <= 0 or reported <= 0:
            return
        self._estimated += estimate
        self._reported += reported
        self.ratio = min(max(self._reported / self._estimated, MIN_RATIO), MAX_RATIO)
        self.calibrated = True

    def learn(self, *, limit: int | None, requested: int | None, estimate: int) -> None:
        """Take what a refusal states: the window, and the request's real size."""

        if limit is not None and limit > 0:
            self.window = limit if self.window is None else min(self.window, limit)
        if requested is not None and requested > 0 and estimate > 0:
            # At least this many real tokens to one estimated token.
            self.ratio = min(max(self.ratio, requested / estimate), MAX_RATIO)
            self.calibrated = True


@dataclass(frozen=True, slots=True)
class Batch:
    start: int
    texts: list[str]
    # One text that cannot fit the window: failed without a request.
    too_long: bool = False


class BatchPlanner:
    """Cuts texts into batches in row order, one at a time.

    Batches are cut when they are about to be sent, so later ones use what
    earlier answers taught: the provider's token counts, or a window stated in
    a refusal.
    """

    def __init__(self, texts: list[str], batch_size: int, budget: TokenBudget) -> None:
        self._texts = texts
        self._size = batch_size
        self.budget = budget
        self._position = 0
        self._estimates: dict[int, int] = {}

    def estimate(self, index: int) -> int:
        cached = self._estimates.get(index)
        if cached is None:
            cached = self._estimates[index] = estimate_text_tokens(self._texts[index])
        return cached

    def request_estimate(self, start: int, count: int) -> int:
        """Estimated prompt tokens of the whole request for one batch."""

        return (
            self.budget.overhead
            + REQUEST_OVERHEAD_TOKENS
            + sum(self.estimate(index) for index in range(start, start + count))
        )

    def _cut(self, start: int, stop: int) -> Batch:
        """The next batch from ``start``, ending before ``stop``."""

        limit = min(stop, start + self._size)
        budget = self.budget.text_budget()
        if budget is None:
            return Batch(start, self._texts[start:limit])
        first = self.estimate(start)
        if first > budget:
            # Alone: sent if it may still fit, failed if it certainly cannot.
            return Batch(
                start, self._texts[start : start + 1], self.budget.cannot_fit(first)
            )
        used = first
        end = start + 1
        while end < limit:
            estimate = self.estimate(end)
            if used + estimate > budget:
                break
            used += estimate
            end += 1
        return Batch(start, self._texts[start:end])

    def next(self) -> Batch | None:
        """The next batch to send, or None when every text has been handed out."""

        if self._position >= len(self._texts):
            return None
        batch = self._cut(self._position, len(self._texts))
        self._position = batch.start + len(batch.texts)
        return batch

    def split(self, start: int, count: int) -> list[Batch]:
        """A refused batch as smaller ones; empty when it is one text.

        Cut by the budget where that gives smaller batches (the refusal may
        just have taught the window); otherwise in halves, as before.
        """

        if count <= 1:
            return []
        stop = start + count
        pieces: list[Batch] = []
        position = start
        while position < stop:
            piece = self._cut(position, stop)
            pieces.append(piece)
            position = piece.start + len(piece.texts)
        if len(pieces) > 1:
            return pieces
        midpoint = start + count // 2
        return [
            Batch(start, self._texts[start:midpoint]),
            Batch(midpoint, self._texts[midpoint:stop]),
        ]


__all__ = [
    "Batch",
    "BatchPlanner",
    "TokenBudget",
    "estimate_text_tokens",
    "estimate_tokens",
    "json_as_written",
]
