#!/usr/bin/env bash
# Exact dependency pins for the server image, from backend/uv.lock (issue 427),
# so the image installs the versions CI tested rather than the newest ones.
# Usage: deploy/docker/lock-constraints.sh dist/constraints.txt
set -Eeuo pipefail

target=${1:?usage: lock-constraints.sh OUTPUT}
mkdir -p "$(dirname "$target")"
target="$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
cd "$(dirname "$0")/../../backend"

# Packages with a path source (sibling checkouts) are left out of the export
# and pinned below to the version the lock records, which is on PyPI.
path_packages=(polars-text polars-source-utils)
exclude=()
for package in "${path_packages[@]}"; do
  exclude+=(--no-emit-package "$package")
done
uv export --frozen --no-dev --no-hashes --no-emit-project --no-header --no-annotate \
  "${exclude[@]}" --output-file "$target" >/dev/null

for package in "${path_packages[@]}"; do
  version=$(awk -v name="$package" '
    $0 == "name = \"" name "\"" { found = 1; next }
    found && /^version = / { gsub(/version = |"/, ""); print; exit }
  ' uv.lock)
  [[ -n "$version" ]] || { echo "no $package version in uv.lock" >&2; exit 1; }
  echo "$package==$version" >>"$target"
done
