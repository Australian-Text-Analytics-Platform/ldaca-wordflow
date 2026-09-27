from __future__ import annotations
from typing import Any


def _terms(*words: str) -> list[dict[str, Any]]:
    return [{"word": word, "occurrence_count": 1} for word in words]
