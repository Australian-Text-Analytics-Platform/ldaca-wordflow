"""Generated names stay short so Windows paths fit in 260 characters (issue 232).

On Windows, where long paths are off by default, a path over 259 characters
fails with FileNotFoundError. A Project snapshot staged under the default
Data Root (``%LOCALAPPDATA%\\au.edu.ldaca.wordflow\\data``) reached 261.
"""

from pathlib import Path, PureWindowsPath

from ldaca_wordflow.infrastructure.storage.durable_fs import atomic_output_path

WINDOWS_MAX_PATH = 259
# A default Data Root for a longer-than-usual Windows user name.
DATA_ROOT = PureWindowsPath(
    r"C:\Users\firstname.lastname\AppData\Local\au.edu.ldaca.wordflow\data"
)
NODE_ID = "104b5519-9c2b-4722-80b7-a6a50522bca7"
REVISION_TOKEN = "615d0e763e9940eda2f911b9eabade46"


def test_temporary_names_do_not_repeat_the_target_name(tmp_path: Path) -> None:
    target = tmp_path / f"{NODE_ID}.r2-{REVISION_TOKEN}.plbin"
    with atomic_output_path(target) as temporary:
        assert temporary.parent == target.parent
        assert temporary.name.startswith(".")
        assert temporary.suffix == ".tmp"
        assert len(temporary.name) <= 16
        temporary.write_bytes(b"x")
    assert target.read_bytes() == b"x"


def test_a_staged_data_block_write_fits_the_windows_limit(tmp_path: Path) -> None:
    # The path from the report: a Data Block's plan written into a Project
    # snapshot being staged, through a same-directory temporary file.
    with atomic_output_path(tmp_path / "x.plbin") as temporary:
        temporary_name = temporary.name
    staged = (
        DATA_ROOT
        / "workspaces"
        / ".staging"
        / ".snapshot-0123456789ab"
        / "data"
        / temporary_name
    )
    published = (
        DATA_ROOT
        / "workspaces"
        / "ea4517ac-9ac3-4ae2-b41c-279c5d8b21d7"
        / "data"
        / f"{NODE_ID}.r2-{REVISION_TOKEN}.plbin"
    )
    assert len(str(staged)) < 200
    assert len(str(published)) <= WINDOWS_MAX_PATH
