"""Move a 0.7.6 server data folder to the current v0.7 format (issue 250).

0.7.6 stores each Data Block as a serialized Polars plan tied to its own Polars
build, which later versions cannot read. The migration therefore runs in two
phases, each with the matching install, and never writes to the old folder:

1. export (run with the 0.7.6 install's Python):
       python migrate_076_server_data.py export OLD_DATA_ROOT STAGING
   Reads every Project, collects each Data Block with 0.7.6's Polars, and writes
   STAGING/<project>/workspace.json (a current-format archive manifest),
   data/<node>.parquet and owner.json.

2. import (run with the new install's Python, with the service environment
   loaded, for example `set -a; . app.env; . secrets.env; set +a`):
       python migrate_076_server_data.py import OLD_DATA_ROOT STAGING NEW_DATA_ROOT
   Creates NEW_DATA_ROOT, copies the user database and each user's files and
   preferences, then imports each staged Project into its owner's account with
   the real archive importer. The backend upgrades the user database from
   version 6 to 7 on start. Prints every Project with its Data Blocks and rows.

Tabs and analysis results are not migrated: their record formats changed. Data
Blocks keep their names, colours, document columns and lineage.
"""

from __future__ import annotations

import io
import json
import shutil
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path


def _aware(timestamp: str) -> str:
    parsed = datetime.fromisoformat(timestamp)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.isoformat()


def export(old_root: Path, staging: Path) -> None:
    import polars as pl
    import polars_text  # noqa: F401  (registers the text namespace in saved plans)

    staging.mkdir(parents=True, exist_ok=False)
    for project in sorted((old_root / "workspaces").iterdir()):
        manifest_path = project / "workspace.json"
        if not manifest_path.is_file():
            continue
        stored = json.loads(manifest_path.read_text())
        owner_id = json.loads((project / "access.json").read_text())["owner_id"]
        out = staging / project.name
        (out / "data").mkdir(parents=True)
        nodes = []
        for entry in stored["nodes"]:
            meta = entry["node_metadata"]
            node_id = meta["id"]
            plan = pl.LazyFrame.deserialize(project / entry["data_path"], format="binary")
            frame = plan.collect(engine="streaming")
            frame.write_parquet(out / "data" / f"{node_id}.parquet")
            nodes.append(
                {
                    "id": node_id,
                    "name": meta["name"].replace("/", "_").replace("\\", "_"),
                    "provenance": meta["provenance"],
                    "document": meta.get("document"),
                    "color": meta.get("color"),
                    "tokenizer_model": meta.get("tokenizer_model"),
                    "data_file": f"data/{node_id}.parquet",
                }
            )
            print(f"  {meta['name']}: {frame.height} rows x {frame.width} columns")
        workspace = stored["workspace_metadata"]
        (out / "workspace.json").write_text(
            json.dumps(
                {
                    "format": "wordflow-materialized-workspace",
                    "data_schema_version": 1,
                    "workspace": {
                        "id": workspace["id"],
                        "name": workspace["name"],
                        "description": workspace.get("description") or "",
                        "created_at": _aware(workspace["created_at"]),
                        "modified_at": _aware(workspace["modified_at"]),
                    },
                    "nodes": nodes,
                    "tabs": [],
                    "analyses": [],
                },
                indent=2,
            )
        )
        (out / "owner.json").write_text(json.dumps({"owner_id": owner_id}))
        print(
            f"exported {workspace['name']!r}: {len(nodes)} Data Blocks, "
            f"{len(stored['tabs'])} tabs and {len(stored['analyses'])} analyses not migrated"
        )


class _ByteSource:
    def __init__(self, content: bytes) -> None:
        self._content = content
        self._offset = 0

    async def read(self, size: int) -> bytes:
        chunk = self._content[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk


def _archive(project: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(project / "workspace.json", "workspace/workspace.json")
        for data_file in sorted((project / "data").iterdir()):
            archive.write(data_file, f"workspace/data/{data_file.name}")
    return buffer.getvalue()


def _copy_users(old_root: Path, new_root: Path) -> None:
    shutil.copy2(old_root / "deployment.sqlite3", new_root / "deployment.sqlite3")
    for user in sorted((old_root / "users").iterdir()):
        target = new_root / "users" / user.name
        target.mkdir(parents=True)
        if (user / "files").is_dir():
            shutil.copytree(user / "files", target / "files", symlinks=False)
        if (user / "preferences.toml").is_file():
            shutil.copy2(user / "preferences.toml", target / "preferences.toml")
        # Past import task records are not carried over.


async def _import(old_root: Path, staging: Path, new_root: Path) -> None:
    import polars as pl

    from ldaca_wordflow.infrastructure.storage.workspace_store import WorkspaceStore
    from ldaca_wordflow.runtime import runtime_context
    from ldaca_wordflow.settings import Settings

    new_root.mkdir(parents=True, exist_ok=False)
    _copy_users(old_root, new_root)
    settings = Settings(data_root=new_root)
    imported = []
    async with runtime_context(settings) as runtime:
        for project in sorted(path for path in staging.iterdir() if path.is_dir()):
            owner_id = json.loads((project / "owner.json").read_text())["owner_id"]
            name = json.loads((project / "workspace.json").read_text())["workspace"]["name"]
            summary, omitted_tabs, omitted_analyses = (
                await runtime.workspace_archive_service.import_upload(
                    owner_id, f"{project.name}.zip", _ByteSource(_archive(project))
                )
            )
            imported.append((name, owner_id, str(summary["id"])))
            print(f"imported {name!r} for {owner_id} as {summary['id']}")
    store = WorkspaceStore(max_nodes=10_000, max_snapshot_bytes=1 << 34)
    for name, owner_id, workspace_id in imported:
        workspace = store.load(new_root / "workspaces" / workspace_id).workspace
        print(f"== {name} ({owner_id}): {len(workspace.nodes)} Data Blocks")
        for node in workspace.nodes.values():
            rows = node.data.select(pl.len()).collect().item()
            print(f"   {node.name}: {rows} rows, document={node.document}")


def main(argv: list[str]) -> None:
    if len(argv) == 3 and argv[0] == "export":
        export(Path(argv[1]), Path(argv[2]))
    elif len(argv) == 4 and argv[0] == "import":
        import anyio

        anyio.run(_import, Path(argv[1]), Path(argv[2]), Path(argv[3]))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
