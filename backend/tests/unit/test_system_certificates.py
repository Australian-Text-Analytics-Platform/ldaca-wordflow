"""The backend trusts the operating system's certificates on macOS and Windows (issue 391)."""

import sys
import types

import pytest

from ldaca_wordflow.infrastructure import system_certificates


@pytest.fixture
def fake_truststore(monkeypatch):
    calls: list[str] = []
    module = types.ModuleType("truststore")
    monkeypatch.setattr(module, "inject_into_ssl", lambda: calls.append("inject"), raising=False)
    monkeypatch.setitem(sys.modules, "truststore", module)
    monkeypatch.setattr(system_certificates, "_applied", False)
    return module, calls


@pytest.mark.parametrize("platform", ["darwin", "win32"])
def test_macos_and_windows_use_the_system_store_once(monkeypatch, fake_truststore, platform):
    _module, calls = fake_truststore
    monkeypatch.setattr(system_certificates.sys, "platform", platform)

    system_certificates.use_system_certificates()
    system_certificates.use_system_certificates()

    assert calls == ["inject"]


def test_linux_keeps_its_certificates(monkeypatch, fake_truststore):
    _module, calls = fake_truststore
    monkeypatch.setattr(system_certificates.sys, "platform", "linux")

    system_certificates.use_system_certificates()

    assert calls == []


def test_a_failure_leaves_wordflow_running_with_the_bundled_certificates(
    monkeypatch, fake_truststore
):
    module, _calls = fake_truststore
    warnings: list[str] = []

    def broken() -> None:
        raise RuntimeError("no keychain")

    monkeypatch.setattr(module, "inject_into_ssl", broken)
    monkeypatch.setattr(system_certificates.sys, "platform", "darwin")
    monkeypatch.setattr(
        system_certificates.logger, "warning", lambda message, **_kwargs: warnings.append(message)
    )

    system_certificates.use_system_certificates()

    assert warnings == ["Could not use the system certificate store; using the bundled one"]
