"""Command-line interface contracts."""

import logging
from pathlib import Path

import pytest

from ldaca_wordflow.cli import _parse_args, main


def test_reverse_proxy_root_path_is_explicit() -> None:
    args = _parse_args(["--root-path", "/deployment/prefix"])

    assert args.root_path == "/deployment/prefix"


def test_an_unusable_data_folder_stops_before_the_server_starts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    blocker = tmp_path / "file"
    blocker.write_text("not a folder", encoding="utf-8")
    monkeypatch.setenv("DATA_ROOT", str(blocker / "data"))
    monkeypatch.setattr("ldaca_wordflow._logging.setup_logging", lambda **_: None)
    monkeypatch.setattr(
        "ldaca_wordflow.infrastructure.process_watchdog.start_parent_watchdog",
        lambda: None,
    )

    def started(**_: object) -> None:
        pytest.fail("the server started with an unusable data folder")

    monkeypatch.setattr("ldaca_wordflow.server_launcher.run_server", started)

    # Capture on the CLI's own logger: earlier tests' logging setup may stop
    # records from reaching the root logger.
    cli_logger = logging.getLogger("ldaca_wordflow.cli")
    cli_logger.addHandler(caplog.handler)
    try:
        with caplog.at_level(logging.ERROR, logger="ldaca_wordflow.cli"):
            with pytest.raises(SystemExit) as stopped:
                main([])
    finally:
        cli_logger.removeHandler(caplog.handler)

    assert stopped.value.code == 1
    assert f"can't use its data folder {blocker / 'data'} (running as" in caplog.text
