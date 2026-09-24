"""Behavior and failure-boundary tests for the per-user file store."""

from __future__ import annotations

import uuid
from pathlib import Path

import anyio
import pytest

from ldaca_wordflow.shared.errors import (
    FileNotFoundError as FileResourceNotFoundError,
    InvalidInputError,
    NotFoundError,
    ResourceConflictError,
    UnsafePathError,
    UserFileTreeTooLargeError,
    UploadTooLargeError,
)
from ldaca_wordflow.services.user_files import UserFileStore, _resource_order_key
from ldaca_wordflow.services.response_snapshots import ResponseSnapshotService

from ._storage import unlimited_storage_admission


class ByteSource:
    """Small async upload source used to exercise the service stream contract."""

    def __init__(self, content: bytes, *, fail_after_reads: int | None = None) -> None:
        self._content = content
        self._offset = 0
        self._reads = 0
        self._fail_after_reads = fail_after_reads

    async def read(self, size: int) -> bytes:
        if self._fail_after_reads is not None and self._reads >= self._fail_after_reads:
            raise RuntimeError("upload interrupted")
        self._reads += 1
        chunk = self._content[self._offset : self._offset + size]
        self._offset += len(chunk)
        await anyio.sleep(0)
        return chunk


class BlockingSource:
    """Emit one chunk, then block so cancellation exercises temp cleanup."""

    def __init__(self) -> None:
        self.blocked = anyio.Event()
        self._sent = False

    async def read(self, size: int) -> bytes:
        if not self._sent:
            self._sent = True
            return b"partial"
        self.blocked.set()
        await anyio.sleep_forever()
        raise AssertionError("unreachable")


def _store(
    tmp_path: Path,
    *,
    max_upload_bytes: int = 64,
    max_tree_response_bytes: int = 1024 * 1024,
) -> UserFileStore:
    def user_root(user_id: str) -> Path:
        return tmp_path / user_id

    limiter = anyio.CapacityLimiter(4)
    admission = unlimited_storage_admission(tmp_path, limiter=limiter)
    return UserFileStore(
        user_root,
        storage_admission=admission,
        limiter=limiter,
        all_users_root=tmp_path,
        max_upload_bytes=max_upload_bytes,
        max_tree_response_bytes=max_tree_response_bytes,
        upload_chunk_size=4,
        response_snapshots=ResponseSnapshotService(
            tmp_path / ".responses" / "files",
            admission,
            max_snapshot_bytes=1024 * 1024,
            max_concurrent_snapshots=2,
            limiter=limiter,
        ),
    )


async def test_missing_file_paths_raise_the_canonical_domain_error(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)

    with pytest.raises(FileResourceNotFoundError):
        await store.response_snapshot("alice", "missing.txt")
    with pytest.raises(FileResourceNotFoundError):
        async with store.read_path("alice", "missing.txt"):
            raise AssertionError("missing file context should not be entered")
    with pytest.raises(FileResourceNotFoundError):
        await store.move(
            "alice",
            source_path="missing.txt",
            target_directory_path="",
        )


async def test_upload_enforces_actual_streamed_size_and_cleans_temp(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path, max_upload_bytes=5)

    with pytest.raises(UploadTooLargeError):
        await store.upload("alice", "data.csv", ByteSource(b"123456"))

    user_root = tmp_path / "alice"
    assert not (user_root / "data.csv").exists()
    assert list(user_root.glob(".*.upload")) == []


async def test_interrupted_upload_leaves_no_partial_destination_or_temp(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)

    with pytest.raises(RuntimeError, match="upload interrupted"):
        await store.upload(
            "alice",
            "data.csv",
            ByteSource(b"abcdefgh", fail_after_reads=1),
        )

    user_root = tmp_path / "alice"
    assert not (user_root / "data.csv").exists()
    assert list(user_root.glob(".*.upload")) == []


async def test_cancelled_upload_shields_temporary_file_cleanup(tmp_path: Path) -> None:
    store = _store(tmp_path)
    source = BlockingSource()

    async with anyio.create_task_group() as tasks:
        tasks.start_soon(store.upload, "alice", "data.csv", source)
        await source.blocked.wait()
        tasks.cancel_scope.cancel()

    user_root = tmp_path / "alice"
    assert not (user_root / "data.csv").exists()
    assert list(user_root.glob(".*.upload")) == []


async def test_concurrent_same_name_upload_never_overwrites_winner(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    outcomes: list[str] = []

    async def upload(content: bytes) -> None:
        try:
            await store.upload("alice", "same.csv", ByteSource(content))
            outcomes.append("stored")
        except ResourceConflictError:
            outcomes.append("conflict")

    async with anyio.create_task_group() as tasks:
        tasks.start_soon(upload, b"first")
        tasks.start_soon(upload, b"second")

    assert sorted(outcomes) == ["conflict", "stored"]
    assert (tmp_path / "alice" / "same.csv").read_bytes() in {
        b"first",
        b"second",
    }
    assert list((tmp_path / "alice").glob(".*.upload")) == []


async def test_upload_rejects_traversal_and_symlink_parent(tmp_path: Path) -> None:
    store = _store(tmp_path)

    with pytest.raises(UnsafePathError):
        await store.upload("alice", "../outside.csv", ByteSource(b"no"))

    user_root = tmp_path / "alice"
    outside = tmp_path / "outside"
    outside.mkdir()
    link = user_root / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except NotImplementedError, OSError:
        pytest.skip("symlinks are unavailable on this platform")

    with pytest.raises(UnsafePathError):
        await store.upload("alice", "linked/outside.csv", ByteSource(b"no"))


async def test_file_store_owns_folder_move_delete_and_download_resolution(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    await store.create_folder("alice", name="incoming", parent_path="")
    await store.create_folder("alice", name="archive", parent_path="")
    await store.upload("alice", "incoming/data.csv", ByteSource(b"text\nhello"))

    moved = await store.move(
        "alice",
        source_path="incoming/data.csv",
        target_directory_path="archive",
    )

    assert moved["path"] == "archive/data.csv"
    assert (tmp_path / "alice" / "incoming").is_dir()
    async with store.read_path("alice", "archive/data.csv") as downloaded:
        assert downloaded == tmp_path / "alice" / "archive" / "data.csv"
    tree = await store.list_tree("alice")
    assert [item["path"] for item in tree] == [
        "archive",
        "archive/data.csv",
        "incoming",
    ]

    await store.delete("alice", "archive/data.csv")
    assert not (tmp_path / "alice" / "archive" / "data.csv").exists()
    assert (tmp_path / "alice" / "archive").is_dir()


async def test_deleting_a_file_never_deletes_a_sibling_readme_or_parent(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    await store.create_folder("alice", name="collection", parent_path="")
    await store.upload("alice", "collection/data.csv", ByteSource(b"value\n1"))
    readme = tmp_path / "alice" / "collection" / "README.md"
    readme.write_text("User-authored documentation", encoding="utf-8")

    await store.delete("alice", "collection/data.csv")

    assert readme.read_text(encoding="utf-8") == "User-authored documentation"
    assert readme.parent.is_dir()


async def test_import_staging_is_private_and_atomically_published(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    import_id = "39ea27ac-dde8-4b9b-8727-e97b5949b3f3"
    staging = await store.prepare_import_staging("alice", import_id)
    (staging / "data.parquet").write_bytes(b"complete")

    assert await store.list_tree("alice") == []
    with pytest.raises(InvalidInputError):
        await store.response_snapshot(
            "alice",
            f".wordflow-import-staging/{import_id}/data.parquet",
        )

    installed = await store.install_import_staging(
        "alice",
        import_id,
        "LDaCA/corpus",
    )
    assert installed == "LDaCA/corpus"
    assert (tmp_path / "alice" / installed / "data.parquet").read_bytes() == b"complete"
    assert not staging.exists()
    assert (
        await store.install_import_staging(
            "alice",
            import_id,
            "LDaCA/corpus",
        )
        == "LDaCA/corpus"
    )

    tree = await store.list_tree("alice")
    assert all(item["name"] != ".wordflow-import-owner" for item in tree)


async def test_user_file_tree_is_complete_depth_first_and_deterministic(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    root = tmp_path / "alice"
    (root / "beta" / "empty").mkdir(parents=True)
    (root / "Alpha").mkdir()
    (root / "beta" / "nested.csv").write_text("value\n1", encoding="utf-8")
    (root / "z.txt").write_text("z", encoding="utf-8")
    (root / "A.txt").write_text("a", encoding="utf-8")
    (root / ".private").mkdir()
    (root / ".hidden.txt").write_text("hidden", encoding="utf-8")

    first = await store.list_tree("alice")
    second = await store.list_tree("alice")

    expected_paths = [
        "Alpha",
        "beta",
        "beta/empty",
        "beta/nested.csv",
        "A.txt",
        "z.txt",
    ]
    assert [item["path"] for item in first] == expected_paths
    assert first == second
    assert next(item for item in first if item["path"] == "beta/empty")["type"] == (
        "directory"
    )


@pytest.mark.parametrize(
    ("filename", "loadable"),
    [
        ("data.tsv", True),
        ("data.jsonl", True),
        ("data.xlsx", True),
        ("notes.txt", True),
        ("documents.zip", True),
        ("figure.png", False),
    ],
)
async def test_tree_marks_only_allowlisted_files_as_loadable(
    tmp_path: Path,
    filename: str,
    loadable: bool,
) -> None:
    store = _store(tmp_path)
    root = tmp_path / "alice"
    root.mkdir()
    (root / filename).write_bytes(b"placeholder")

    [resource] = await store.list_tree("alice")

    assert resource["loadable"] is loadable


def test_user_file_tree_uses_exact_paths_to_break_casefold_collisions() -> None:
    resources = [
        {"type": "file", "name": "alpha", "path": "alpha"},
        {"type": "file", "name": "Alpha", "path": "Alpha"},
        {"type": "directory", "name": "zeta", "path": "zeta"},
    ]

    assert [
        resource["path"] for resource in sorted(resources, key=_resource_order_key)
    ] == ["zeta", "Alpha", "alpha"]


async def test_user_file_tree_skips_links_and_special_entries(tmp_path: Path) -> None:
    store = _store(tmp_path)
    root = tmp_path / "alice"
    root.mkdir()
    (root / "visible.txt").write_text("visible", encoding="utf-8")
    outside = tmp_path / "outside"
    outside.mkdir()
    try:
        (root / "linked").symlink_to(outside, target_is_directory=True)
    except NotImplementedError, OSError:
        pytest.skip("symlinks are unavailable on this platform")

    assert [item["path"] for item in await store.list_tree("alice")] == ["visible.txt"]


async def test_user_file_tree_fails_atomically_above_response_limit(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path, max_tree_response_bytes=2)
    (tmp_path / "alice" / "visible").mkdir(parents=True)

    with pytest.raises(UserFileTreeTooLargeError):
        await store.list_tree("alice")


async def test_import_staging_publish_never_replaces_existing_data(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    import_id = "6225407a-bbd8-41ee-b9e1-0cf0460e1dbf"
    staging = await store.prepare_import_staging("alice", import_id)
    (staging / "new.txt").write_text("new")
    existing = tmp_path / "alice" / "LDaCA" / "corpus"
    existing.mkdir(parents=True)
    (existing / "old.txt").write_text("old")

    with pytest.raises(ResourceConflictError):
        await store.install_import_staging("alice", import_id, "LDaCA/corpus")
    assert (existing / "old.txt").read_text() == "old"
    assert staging.is_dir()

    await store.cleanup_import_staging("alice", import_id)
    assert not staging.exists()


async def test_startup_reconciliation_removes_unowned_private_staging(
    tmp_path: Path,
) -> None:
    users_root = tmp_path / "users"
    data_root = users_root / "root" / "files"
    limiter = anyio.CapacityLimiter(4)
    admission = unlimited_storage_admission(tmp_path, limiter=limiter)
    store = UserFileStore(
        lambda _user_id: data_root,
        storage_admission=admission,
        limiter=limiter,
        all_users_root=users_root,
        response_snapshots=ResponseSnapshotService(
            tmp_path / ".responses" / "files",
            admission,
            max_snapshot_bytes=1024 * 1024,
            max_concurrent_snapshots=2,
            limiter=limiter,
        ),
    )
    active_id = str(uuid.uuid4())
    orphan_id = str(uuid.uuid4())
    active = await store.prepare_import_staging("owner", active_id)
    orphan = await store.prepare_import_staging("owner", orphan_id)

    interrupted_upload = data_root / ".dataset.csv.deadbeef.upload"
    interrupted_upload.write_bytes(b"partial")

    await store.reconcile_transient_storage({active_id})

    assert active.is_dir()
    assert not orphan.exists()
    assert not interrupted_upload.exists()


async def test_folders_move_with_their_contents_but_never_into_themselves(
    tmp_path: Path,
) -> None:
    """#137: a whole folder can be dragged to another folder or the root."""

    store = _store(tmp_path)
    await store.create_folder("alice", name="speeches", parent_path="")
    await store.create_folder("alice", name="2020", parent_path="speeches")
    await store.create_folder("alice", name="archive", parent_path="")
    await store.upload("alice", "speeches/2020/a.txt", ByteSource(b"hello"))

    moved = await store.move(
        "alice", source_path="speeches", target_directory_path="archive"
    )

    assert moved["path"] == "archive/speeches"
    assert moved["type"] == "directory"
    assert (
        tmp_path / "alice" / "archive" / "speeches" / "2020" / "a.txt"
    ).read_bytes() == (b"hello")
    assert not (tmp_path / "alice" / "speeches").exists()

    for target in ("archive/speeches", "archive/speeches/2020"):
        with pytest.raises(InvalidInputError, match="into itself"):
            await store.move(
                "alice", source_path="archive/speeches", target_directory_path=target
            )

    await store.create_folder("alice", name="speeches", parent_path="")
    with pytest.raises(ResourceConflictError, match="already exists"):
        await store.move(
            "alice", source_path="archive/speeches", target_directory_path=""
        )
    assert (tmp_path / "alice" / "archive" / "speeches" / "2020" / "a.txt").exists()


async def test_batch_delete_covers_nested_selections_and_skips_missing(
    tmp_path: Path,
) -> None:
    """#138: one call deletes a selection, such as every root file."""

    store = _store(tmp_path)
    await store.create_folder("alice", name="corpus", parent_path="")
    for path in ("one.txt", "two.txt", "corpus/three.txt", "keep.txt"):
        await store.upload("alice", path, ByteSource(b"x"))

    deleted = await store.delete_many(
        "alice", ["one.txt", "two.txt", "corpus", "corpus/three.txt", "gone.txt"]
    )

    assert deleted == 3
    assert [item["path"] for item in await store.list_tree("alice")] == ["keep.txt"]
    with pytest.raises(InvalidInputError, match="root"):
        await store.delete_many("alice", ["/"])
    with pytest.raises(InvalidInputError, match="Hidden"):
        await store.delete_many("alice", [".wordflow-imports"])


async def test_selection_downloads_as_one_zip_with_structure(tmp_path: Path) -> None:
    """#139: paths are kept relative to the selection's common parent."""

    import io
    import zipfile

    store = _store(tmp_path)
    await store.create_folder("alice", name="speeches", parent_path="")
    await store.create_folder("alice", name="2020", parent_path="speeches")
    await store.create_folder("alice", name="empty", parent_path="")
    for path in ("one.csv", "speeches/a.txt", "speeches/2020/b.txt"):
        await store.upload("alice", path, ByteSource(b"x"))

    prepared = await store.prepare_archive(
        "alice", ["one.csv", "speeches", "speeches/a.txt", "empty"]
    )
    assert prepared["file_count"] == 3
    assert prepared["filename"] == "wordflow_files.zip"
    snapshot, filename = await store.archive_snapshot("alice", prepared["id"])
    try:
        names = sorted(
            zipfile.ZipFile(io.BytesIO(snapshot.path.read_bytes())).namelist()
        )
    finally:
        await snapshot.cleanup()
    assert filename == "wordflow_files.zip"
    assert names == ["empty/", "one.csv", "speeches/2020/b.txt", "speeches/a.txt"]

    # Single use, and bound to its user.
    with pytest.raises(NotFoundError, match="expired"):
        await store.archive_snapshot("alice", prepared["id"])
    nested = await store.prepare_archive(
        "alice", ["speeches/2020/b.txt", "speeches/a.txt"]
    )
    with pytest.raises(NotFoundError, match="expired"):
        await store.archive_snapshot("bob", nested["id"])

    single = await store.prepare_archive("alice", ["speeches/2020"])
    snapshot, filename = await store.archive_snapshot("alice", single["id"])
    try:
        names = zipfile.ZipFile(io.BytesIO(snapshot.path.read_bytes())).namelist()
    finally:
        await snapshot.cleanup()
    assert filename == "2020.zip"
    assert names == ["2020/b.txt"]
