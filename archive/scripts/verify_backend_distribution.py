"""Verify the backend wheel's public package and bundled-resource contract."""

from __future__ import annotations

import pathlib
import sys
import zipfile


def verify_distribution(dist_dir: pathlib.Path) -> None:
    wheels = list(dist_dir.glob("*.whl"))
    if len(wheels) != 1:
        raise RuntimeError(f"expected exactly one wheel in {dist_dir}, found {len(wheels)}")

    with zipfile.ZipFile(wheels[0]) as archive:
        names = archive.namelist()
        required = (
            "ldaca_wordflow/resources/frontend/build/index.html",
        )
        for suffix in required:
            if not any(name.endswith(suffix) for name in names):
                raise RuntimeError(f"wheel is missing {suffix}")

        metadata_name = next(
            name for name in names if name.endswith(".dist-info/METADATA")
        )
        metadata = archive.read(metadata_name).decode("utf-8")
        if "Requires-Dist: ldaca-data-rs" not in metadata:
            raise RuntimeError("wheel must require the native LDaCA data SDK")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify_backend_distribution.py <dist-directory>")
    verify_distribution(pathlib.Path(sys.argv[1]))
