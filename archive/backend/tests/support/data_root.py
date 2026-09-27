from __future__ import annotations
from pathlib import Path
from ldaca_wordflow.data_root_config import (
    DataRootConfigStore,
    DataRootPaths,
)
from ldaca_wordflow.settings import Settings


class _IdleWork:
    async def has_work(self) -> bool:
        return False


class _BusyWork:
    async def has_work(self) -> bool:
        return True


class _FakeRuntime:
    def __init__(self, root: Path) -> None:
        self.settings = Settings(data_root=root)
        self.analysis_execution: _IdleWork | _BusyWork = _IdleWork()
        self.user_file_import_service = _IdleWork()


def _store(tmp_path: Path) -> DataRootConfigStore:
    return DataRootConfigStore(
        DataRootPaths(
            config_file=tmp_path / "config" / "settings.json",
            suggested_data_root=tmp_path / "application-data" / "data",
        )
    )
