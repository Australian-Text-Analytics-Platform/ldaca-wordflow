"""Complete backend diagnostics without traceback disclosure."""

from __future__ import annotations

from ldaca_wordflow.domain.background import Failure
from ldaca_wordflow.shared.errors import format_exception_diagnostic


def test_formats_unwrapped_exception_type_and_message() -> None:
    assert format_exception_diagnostic(ValueError("invalid value")) == (
        "ValueError: invalid value"
    )


def test_follows_explicit_cause_to_the_originating_exception() -> None:
    cause = OSError("disk full")
    wrapper = RuntimeError("write failed")
    wrapper.__cause__ = cause

    assert format_exception_diagnostic(wrapper) == "OSError: disk full"


def test_follows_unsuppressed_implicit_context() -> None:
    cause = LookupError("missing record")
    wrapper = RuntimeError("load failed")
    wrapper.__context__ = cause

    assert format_exception_diagnostic(wrapper) == "LookupError: missing record"


def test_suppressed_context_is_not_exposed() -> None:
    wrapper = RuntimeError("load failed")
    wrapper.__context__ = LookupError("private context")
    wrapper.__suppress_context__ = True

    assert format_exception_diagnostic(wrapper) == "RuntimeError: load failed"


def test_empty_message_returns_only_the_exception_type() -> None:
    assert format_exception_diagnostic(RuntimeError()) == "RuntimeError"


def test_cause_cycles_are_bounded() -> None:
    first = RuntimeError("first")
    second = ValueError("second")
    first.__cause__ = second
    second.__cause__ = first

    assert format_exception_diagnostic(first) == "ValueError: second"


def test_message_is_not_truncated() -> None:
    message = "x" * 10_000

    assert format_exception_diagnostic(RuntimeError(message)) == (
        f"RuntimeError: {message}"
    )


def test_durable_failure_accepts_an_unbounded_multiline_diagnostic() -> None:
    message = "ValueError: first line\n" + ("x" * 10_000)

    failure = Failure(code="analysis_execution_failed", message=message)

    assert failure.message == message


def test_validation_message_names_the_field_in_plain_words() -> None:
    """Issue 205: one sentence, the field named, pydantic's prefix dropped."""

    from ldaca_wordflow.shared.errors import validation_message

    assert (
        validation_message(
            [
                {
                    "location": ["body", "parameters", "number_of_topics"],
                    "type": "value_error",
                    "message": "Value error, must be between 2 and 200",
                },
                {"location": ["body", "seed"], "type": "int_parsing", "message": "x"},
            ]
        )
        == "Number of topics: must be between 2 and 200. Seed: x."
    )
    assert validation_message([]) == "Some settings are not valid. Check them and try again."


def test_failure_from_exception_keeps_written_messages_and_diagnostics() -> None:
    """Issue 205: users read plain words; Details keep the diagnostic."""

    from ldaca_wordflow.services.failures import failure_from_exception
    from ldaca_wordflow.shared.errors import (
        UNEXPECTED_ERROR_MESSAGE,
        InvalidInputError,
    )

    written = failure_from_exception(InvalidInputError("Choose a text column."), code="x")
    assert (written.code, written.message, written.diagnostic) == (
        "invalid_input",
        "Choose a text column.",
        None,
    )
    unexpected = failure_from_exception(KeyError("tokens"), code="analysis_execution_failed")
    assert unexpected.message == UNEXPECTED_ERROR_MESSAGE
    assert unexpected.diagnostic == "KeyError: 'tokens'"


def test_provider_failure_messages_say_what_to_do() -> None:
    from ldaca_wordflow.domain.annotation import provider_failure_message

    assert (
        provider_failure_message("annotation_provider_authentication_failed", "anthropic")
        == "Anthropic rejected the API key. Check it in Settings."
    )
    assert provider_failure_message("annotation_provider_failed", "custom") == (
        "The request to the AI provider failed. Try again."
    )


def test_load_failures_say_why_and_what_to_do() -> None:
    """Issue 205: each kind of unreadable file gets its own advice."""

    import zipfile

    from ldaca_wordflow.infrastructure.storage.data_loading import (
        DataFileLoadError,
        describe_load_failure,
    )

    def wrapped(cause: BaseException) -> DataFileLoadError:
        error = DataFileLoadError("Data file could not be loaded")
        error.__cause__ = cause
        return error

    assert "password-protected" in describe_load_failure(
        wrapped(RuntimeError("File a.txt is encrypted, password required for extraction")),
        "texts.zip",
    )
    assert "damaged" in describe_load_failure(wrapped(zipfile.BadZipFile("bad")), "texts.zip")
    assert "UTF-8" in describe_load_failure(wrapped(UnicodeDecodeError("utf-8", b"\xff", 0, 1, "x")))
    assert "spreadsheet" in describe_load_failure(wrapped(ValueError("bad")), "book.xlsx")
    assert "isn't damaged" in describe_load_failure(wrapped(OSError("odd")), "notes.txt")
