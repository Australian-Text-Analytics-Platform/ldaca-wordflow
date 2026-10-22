"""Fail the image build unless every installed package matches the lock (issue 427).

`pip install -c` only pins packages it is asked about; a dependency missing
from the constraints would still arrive at its newest version. This compares
everything installed with the constraints file.
"""

from __future__ import annotations

import re
import sys
from importlib.metadata import distributions

# Installed with Python or the wheel itself, not dependencies.
IGNORED = {"pip", "setuptools", "wheel", "ldaca-wordflow"}


def normalise(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def main(constraints_path: str) -> int:
    pins: dict[str, str] = {}
    for line in open(constraints_path, encoding="utf-8"):
        requirement = line.split(";", 1)[0].strip()
        if requirement and not requirement.startswith("#"):
            name, version = requirement.split("==", 1)
            pins[normalise(name)] = version.strip()
    problems = []
    for dist in distributions():
        name = normalise(dist.metadata["Name"])
        if name in IGNORED:
            continue
        pinned = pins.get(name)
        if pinned is None:
            problems.append(f"{name} {dist.version} is not in the lock")
        elif pinned != dist.version:
            problems.append(f"{name} {dist.version} installed, lock has {pinned}")
    for problem in sorted(problems):
        print(problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
