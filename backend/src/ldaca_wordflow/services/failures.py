"""Build durable failures from exceptions (issue 205).

Used by:
- analysis admission and execution, user file imports.

Flow:
- A failure written for users (an ``AppError`` below 500, or a worker's
  written message) keeps that message and needs no diagnostic.
- Any other failure gets a plain message, and its exception type and text go
  in ``diagnostic``, which the UI shows under Details.
"""

from __future__ import annotations

from ..domain.background import Failure
from ..shared.errors import AppError, UNEXPECTED_ERROR_MESSAGE, format_exception_diagnostic


def failure_from_exception(exc: BaseException, *, code: str) -> Failure:
    """One failure for users, with the diagnostic kept for Details."""

    if isinstance(exc, AppError):
        written = exc.message if exc.message != exc.code else None
        if exc.status_code < 500 and written:
            return Failure(code=exc.code, message=written)
        return Failure(
            code=exc.code,
            message=written or UNEXPECTED_ERROR_MESSAGE,
            diagnostic=format_exception_diagnostic(exc),
        )
    user_message = getattr(exc, "user_message", None)
    if isinstance(user_message, str) and user_message:
        return Failure(code=code, message=user_message)
    return Failure(
        code=code,
        message=UNEXPECTED_ERROR_MESSAGE,
        diagnostic=format_exception_diagnostic(exc),
    )


__all__ = ["failure_from_exception"]
