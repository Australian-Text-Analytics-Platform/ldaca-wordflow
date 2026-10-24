"""The operator's notice to everyone signed in to a server (issue 438)."""

import json
import os

import pytest

from ldaca_wordflow.api import server_notice as server_notice_api
from ldaca_wordflow.services import server_notice
from ldaca_wordflow.services.server_notice import (
    ACKNOWLEDGEMENTS_FILE,
    MAX_NOTICE_BYTES,
    NOTICES_FILE,
    RECORDS_DIRECTORY,
    ServerNotice,
    acknowledge_notice,
    archive_notice,
    is_acknowledged,
    read_server_notice,
)


@pytest.fixture(autouse=True)
def _fresh_process(monkeypatch):
    monkeypatch.setattr(server_notice, "_cached", None)
    monkeypatch.setattr(server_notice, "_recorded", {})


def _bump_mtime(path):
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))


def _lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_no_file_or_empty_file_means_no_notice(tmp_path):
    assert read_server_notice(None) is None
    path = tmp_path / "notice.md"
    assert read_server_notice(path) is None
    path.write_text("  \n\n", encoding="utf-8")
    assert read_server_notice(path) is None


def test_a_changed_text_gets_a_new_id_without_a_restart(tmp_path):
    path = tmp_path / "notice.md"
    path.write_text("**Shared service.** Check your ethics approval.\r\n", encoding="utf-8")
    first = read_server_notice(path)
    assert first is not None
    assert first.text == "**Shared service.** Check your ethics approval."
    assert read_server_notice(path) == first

    path.write_text("A new passage.", encoding="utf-8")
    _bump_mtime(path)
    second = read_server_notice(path)
    assert second is not None
    assert second.text == "A new passage."
    assert second.id != first.id

    path.unlink()
    assert read_server_notice(path) is None


def test_an_oversized_or_undecodable_file_shows_nothing(tmp_path, monkeypatch):
    warnings: list[str] = []
    monkeypatch.setattr(
        server_notice.logger, "warning", lambda message, *args: warnings.append(message % args)
    )
    path = tmp_path / "notice.md"
    path.write_text("x" * (MAX_NOTICE_BYTES + 1), encoding="utf-8")
    assert read_server_notice(path) is None
    path.write_bytes(b"\xff\xfe not utf-8")
    _bump_mtime(path)
    assert read_server_notice(path) is None
    assert len(warnings) == 2
    assert "over the" in warnings[0]


def test_records_keep_each_text_once_and_each_got_it_with_name_email_and_time(
    tmp_path, monkeypatch
):
    first = ServerNotice(id="aaaa", text="First passage.")
    archive_notice(tmp_path, first)
    archive_notice(tmp_path, first)
    acknowledge_notice(tmp_path, first, email="ada@example.edu", name="Ada Lovelace")
    acknowledge_notice(tmp_path, first, email="ada@example.edu", name="Ada Lovelace")
    second = ServerNotice(id="bbbb", text="Second passage.")
    acknowledge_notice(tmp_path, second, email="ada@example.edu", name="Ada Lovelace")

    records = tmp_path / RECORDS_DIRECTORY
    notices = _lines(records / NOTICES_FILE)
    assert [(n["id"], n["text"]) for n in notices] == [
        ("aaaa", "First passage."),
        ("bbbb", "Second passage."),
    ]
    assert all(n["first_shown_at"] for n in notices)
    acks = _lines(records / ACKNOWLEDGEMENTS_FILE)
    assert [(a["notice_id"], a["email"], a["name"]) for a in acks] == [
        ("aaaa", "ada@example.edu", "Ada Lovelace"),
        ("bbbb", "ada@example.edu", "Ada Lovelace"),
    ]
    assert all(a["acknowledged_at"].endswith("+00:00") for a in acks)

    # A restarted or upgraded server (another pod on the same volume) reads
    # the records back, ignoring a line cut short by a crash.
    with (records / ACKNOWLEDGEMENTS_FILE).open("a", encoding="utf-8") as handle:
        handle.write('{"notice_id": "cccc", "ema')
    monkeypatch.setattr(server_notice, "_recorded", {})
    assert is_acknowledged(tmp_path, "aaaa", "ada@example.edu")
    assert not is_acknowledged(tmp_path, "aaaa", "grace@example.edu")
    archive_notice(tmp_path, first)
    assert len(_lines(records / NOTICES_FILE)) == 2


def test_a_multi_user_server_shows_records_and_refuses_a_stale_got_it(
    multi_user_test_client, tmp_path, monkeypatch
):
    notice_file = tmp_path / "notice.md"
    notice_file.write_text("Your data is stored on Apollo.", encoding="utf-8")
    monkeypatch.setattr(
        server_notice_api, "read_server_notice", lambda _path: read_server_notice(notice_file)
    )
    client = multi_user_test_client

    body = client.get("/api/server-notice").json()
    assert body["notice"]["text"] == "Your data is stored on Apollo."
    assert body["acknowledged"] is False
    notice_id = body["notice"]["id"]

    acknowledged = client.post(f"/api/server-notice/{notice_id}/acknowledgement")
    assert acknowledged.status_code == 200
    assert acknowledged.json()["acknowledged"] is True
    assert client.get("/api/server-notice").json()["acknowledged"] is True
    records = tmp_path / RECORDS_DIRECTORY
    (ack,) = _lines(records / ACKNOWLEDGEMENTS_FILE)
    assert (ack["notice_id"], ack["email"], ack["name"]) == (
        notice_id,
        "fixture@example.test",
        "Fixture User",
    )

    notice_file.write_text("A new passage.", encoding="utf-8")
    _bump_mtime(notice_file)
    changed = client.get("/api/server-notice").json()
    assert changed["notice"]["id"] != notice_id
    assert changed["acknowledged"] is False
    stale = client.post(f"/api/server-notice/{notice_id}/acknowledgement")
    assert stale.status_code == 409
    assert stale.json()["code"] == "server_notice_changed"
    assert [n["text"] for n in _lines(records / NOTICES_FILE)] == [
        "Your data is stored on Apollo.",
        "A new passage.",
    ]


def test_single_user_wordflow_shows_no_notice_and_keeps_no_records(
    files_test_client, tmp_path, monkeypatch
):
    notice_file = tmp_path / "notice.md"
    notice_file.write_text("Shared only.", encoding="utf-8")
    monkeypatch.setattr(
        server_notice_api, "read_server_notice", lambda _path: read_server_notice(notice_file)
    )
    assert files_test_client.get("/api/server-notice").json() == {
        "notice": None,
        "acknowledged": False,
    }
    assert not (tmp_path / RECORDS_DIRECTORY).exists()
