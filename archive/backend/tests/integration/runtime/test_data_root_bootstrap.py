from __future__ import annotations
from tests.support.data_root import _BusyWork, _FakeRuntime, _store

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import cast

import anyio
import pytest
from anyio.abc import TaskStatus

from ldaca_wordflow.data_root_config import (
    DataRootConfigStore,
)
from ldaca_wordflow.runtime import Runtime, RuntimeManager, runtime_manager_context
from ldaca_wordflow.settings import Settings
from ldaca_wordflow.shared.errors import (
    DataRootBusyError,
    DataRootInitializationError,
    DataRootManagedByOperatorError,
    DataRootTransitionError,
    format_exception_diagnostic,
    InternalServiceError,
)






















@pytest.mark.anyio
async def test_environment_wins_and_is_immutable(tmp_path: Path) -> None:
    store = _store(tmp_path)
    store.write((tmp_path / "configured").resolve())

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        yield cast(Runtime, _FakeRuntime(settings.get_data_root()))

    environment_root = (tmp_path / "environment").resolve()
    async with runtime_manager_context(
        Settings(data_root=environment_root),
        factory,
        config_store=store,
    ) as manager:
        snapshot = manager.snapshot()
        assert snapshot.state == "ready"
        assert snapshot.source == "environment"
        assert snapshot.data_root == environment_root
        assert snapshot.mutable is False
        with pytest.raises(DataRootManagedByOperatorError):
            await manager.configure(tmp_path / "other")


@pytest.mark.anyio
async def test_unconfigured_manager_switches_and_same_root_is_idempotent(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    opened: list[Path] = []

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        opened.append(settings.get_data_root())
        yield cast(Runtime, _FakeRuntime(settings.get_data_root()))

    async with runtime_manager_context(
        Settings(), factory, config_store=store
    ) as manager:
        assert manager.snapshot().state == "unconfigured"
        assert manager.snapshot().runtime_generation == 0

        selected = tmp_path / "selected"
        first = await manager.configure(selected)
        second = await manager.configure(selected / ".")
        assert first.state == second.state == "ready"
        assert first.runtime_generation == second.runtime_generation == 1
        assert opened == [selected.resolve()]
        assert store.read() == selected.resolve()
        assert first.change_token == second.change_token


@pytest.mark.anyio
async def test_switch_rejects_active_work_without_closing_the_runtime(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    closed: list[Path] = []

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        runtime = _FakeRuntime(settings.get_data_root())
        runtime.analysis_execution = _BusyWork()
        try:
            yield cast(Runtime, runtime)
        finally:
            closed.append(settings.get_data_root())

    original = tmp_path / "original"
    store.write(original.resolve())
    async with runtime_manager_context(
        Settings(data_root=None), factory, config_store=store
    ) as manager:
        with pytest.raises(DataRootBusyError):
            await manager.configure(tmp_path / "candidate")
        assert manager.snapshot().state == "ready"
        assert manager.snapshot().data_root == original.resolve()
        assert closed == []


@pytest.mark.anyio
async def test_failed_candidate_reconstructs_previous_runtime(tmp_path: Path) -> None:
    store = _store(tmp_path)
    original = (tmp_path / "original").resolve()
    candidate = (tmp_path / "candidate").resolve()
    store.write(original)
    opened: list[Path] = []
    closed: list[Path] = []

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        root = settings.get_data_root()
        opened.append(root)
        if root == candidate:
            raise RuntimeError("candidate failed")
        try:
            yield cast(Runtime, _FakeRuntime(root))
        finally:
            closed.append(root)

    async with runtime_manager_context(
        Settings(), factory, config_store=store
    ) as manager:
        with pytest.raises(DataRootInitializationError) as captured:
            await manager.configure(candidate)
        assert format_exception_diagnostic(captured.value) == (
            "RuntimeError: candidate failed"
        )
        assert manager.snapshot().state == "ready"
        assert manager.snapshot().data_root == original
        assert manager.snapshot().runtime_generation == 1
        assert opened == [original, candidate, original]
        assert closed == [original]
        assert store.read() == original


@pytest.mark.anyio
async def test_persistence_failure_closes_candidate_and_restores_previous_runtime(
    tmp_path: Path,
) -> None:
    original = (tmp_path / "original").resolve()
    candidate = (tmp_path / "candidate").resolve()
    seeded = _store(tmp_path)
    seeded.write(original)

    class FailingWriteStore(DataRootConfigStore):
        def write(self, data_root: Path) -> None:
            raise OSError("persistence failed")

    closed: list[Path] = []

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        root = settings.get_data_root()
        try:
            yield cast(Runtime, _FakeRuntime(root))
        finally:
            closed.append(root)

    async with runtime_manager_context(
        Settings(),
        factory,
        config_store=FailingWriteStore(seeded.paths),
    ) as manager:
        with pytest.raises(InternalServiceError):
            await manager.configure(candidate)
        assert manager.snapshot().state == "ready"
        assert manager.snapshot().data_root == original
        assert manager.snapshot().runtime_generation == 1
        assert closed == [original, candidate]
        assert seeded.read() == original


@pytest.mark.anyio
async def test_concurrent_transition_is_rejected_instead_of_queued(
    tmp_path: Path,
) -> None:
    @asynccontextmanager
    async def unused_factory(settings: Settings) -> AsyncIterator[Runtime]:
        yield cast(Runtime, _FakeRuntime(settings.get_data_root()))

    async with runtime_manager_context(
        Settings(),
        unused_factory,
        config_store=_store(tmp_path),
    ) as manager:
        await manager._transition_lock.acquire()
        try:
            with pytest.raises(DataRootTransitionError):
                await manager.configure(tmp_path / "candidate")
        finally:
            manager._transition_lock.release()


@pytest.mark.anyio
async def test_switch_waits_for_finite_request_leases_to_drain(tmp_path: Path) -> None:
    store = _store(tmp_path)
    original = (tmp_path / "original").resolve()
    candidate = (tmp_path / "candidate").resolve()
    store.write(original)
    opened: list[Path] = []
    completed: list[Path] = []

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        opened.append(settings.get_data_root())
        yield cast(Runtime, _FakeRuntime(settings.get_data_root()))

    async with runtime_manager_context(
        Settings(), factory, config_store=store
    ) as manager:

        async def switch() -> None:
            snapshot = await manager.configure(candidate)
            completed.append(snapshot.data_root or Path())

        async with anyio.create_task_group() as tasks:
            async with manager.lease():
                tasks.start_soon(switch)
                while manager.state != "reconfiguring":
                    await anyio.sleep(0)
                assert opened == [original]
                assert completed == []
        assert opened == [original, candidate]
        assert completed == [candidate]


@pytest.mark.anyio
async def test_switch_from_another_task_replaces_the_runtime_without_stopping_the_owner(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    original = (tmp_path / "original").resolve()
    candidate = (tmp_path / "candidate").resolve()
    store.write(original)
    opened: list[Path] = []
    closed: list[Path] = []

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        root = settings.get_data_root()
        opened.append(root)
        try:
            async with anyio.create_task_group():
                yield cast(Runtime, _FakeRuntime(root))
        finally:
            closed.append(root)

    stop_owner = anyio.Event()

    async def own_manager(*, task_status: TaskStatus[RuntimeManager]) -> None:
        async with runtime_manager_context(
            Settings(), factory, config_store=store
        ) as manager:
            task_status.started(manager)
            await stop_owner.wait()

    async with anyio.create_task_group() as tasks:
        manager = await tasks.start(own_manager)
        try:
            with anyio.fail_after(2):
                snapshot = await manager.configure(candidate)
        finally:
            stop_owner.set()

    assert snapshot.state == "ready"
    assert snapshot.data_root == candidate
    assert snapshot.runtime_generation == 2
    assert store.read() == candidate
    assert opened == [original, candidate]
    assert closed == [original, candidate]
