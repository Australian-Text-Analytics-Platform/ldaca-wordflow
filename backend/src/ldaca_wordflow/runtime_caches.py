"""Where downloaded models live.

Data Root models: a Wordflow that opens a Data Root keeps the models it
downloads in ``<data root>/.cache/models`` (``use_data_root_model_caches``),
beside the projects, instead of folders spread over the user's account. A
desktop whose own app folders lost their permissions could not run Quotation
or the CJK tokenisers, and Windows has no ``HOME`` for the Lindera dictionaries.
Models an earlier Wordflow downloaded are moved there once
(``adopt_earlier_model_downloads``). A variable the deployment set (the server
image sets all of them) keeps its folder.

Writable model caches for a server running under any uid (issue 425): the
server image keeps the models it prefetched under /opt/wordflow, readable by
every uid and written by none: on a cluster the container may run as any
account. When a cache folder named by one of ``CACHE_VARIABLES`` can't be
written by this process, new downloads go to ``<data root>/.cache/runtime``
(or the temp folder when the Data Root can't take them), and the prefetched
entries are linked in so they still load without a download. Each move is
logged once. Desktops leave these variables unset at launch, so nothing
changes there.

Runs before the model libraries are imported: they read the variables once.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from collections.abc import MutableMapping
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# The Quotation spaCy model's folder; unset, the OS cache (data_root_config).
SPACY_CACHE_VARIABLE = "WORDFLOW_SPACY_CACHE"
# Variable -> folder in ``<data root>/.cache/models``.
DATA_ROOT_MODEL_FOLDERS = {
    "HF_HOME": "huggingface",
    "LINDERA_DICT_PATH": "lindera",
    SPACY_CACHE_VARIABLE: "spacy",
}


def deployment_model_caches(environ: MutableMapping[str, str]) -> frozenset[str]:
    """The model cache variables the deployment set itself."""

    configured = {
        variable
        for variable in DATA_ROOT_MODEL_FOLDERS
        if environ.get(variable, "").strip()
    }
    # The server image prefetches the spaCy model into its XDG cache.
    if environ.get("XDG_CACHE_HOME", "").strip():
        configured.add(SPACY_CACHE_VARIABLE)
    return frozenset(configured)


# Read once, before this process sets any of them.
_DEPLOYMENT_MODEL_CACHES = deployment_model_caches(os.environ)


def use_data_root_model_caches(
    data_root: Path,
    *,
    environ: MutableMapping[str, str] = os.environ,
    deployment: frozenset[str] | None = None,
) -> dict[str, Path]:
    """Point model downloads at ``<data root>/.cache/models``; returns the folders.

    Called whenever a Data Root opens, before any worker starts: workers
    inherit the variables, and the Rust model loaders read them on each use.
    """

    kept = _DEPLOYMENT_MODEL_CACHES if deployment is None else deployment
    folders: dict[str, Path] = {}
    for variable, name in DATA_ROOT_MODEL_FOLDERS.items():
        if variable in kept:
            continue
        folder = data_root / ".cache" / "models" / name
        environ[variable] = str(folder)
        folders[variable] = folder
    return folders


@dataclass(frozen=True, slots=True)
class EarlierModelFolders:
    """Where an earlier Wordflow kept its downloaded models (None: nowhere)."""

    huggingface_hub: Path | None
    lindera: Path | None
    spacy: Path | None


def earlier_model_folders(environ: MutableMapping[str, str] = os.environ) -> EarlierModelFolders:
    """The default folders earlier versions downloaded models into."""

    from .data_root_config import platform_cache_root

    # polars-text read only HOME, so Windows never had Lindera dictionaries.
    home = environ.get("HOME", "").strip()
    return EarlierModelFolders(
        huggingface_hub=Path.home() / ".cache" / "huggingface" / "hub",
        lindera=Path(home) / ".cache" / "ldaca" if home else None,
        spacy=platform_cache_root() / "spacy",
    )


def _wordflow_hugging_face_repos() -> list[str]:
    """Cache folder names of the Hugging Face models Wordflow downloads."""

    from polars_text import TOKENIZER_MODELS

    from .domain.workspace.analysis import TopicEmbeddingModel

    repos = [
        model.model_id.removeprefix("huggingface:")
        for model in TOKENIZER_MODELS
        if model.model_id.startswith("huggingface:")
    ]
    repos.extend(model.value for model in TopicEmbeddingModel)
    return ["models--" + repo.replace("/", "--") for repo in repos]


def _link_or_copy(source: Path, target: Path) -> None:
    """Copy a file or folder, hard-linking files where the disk allows it.

    A hard link takes no space and leaves the original whole for other
    programs. The copy is assembled beside the target and renamed into place.
    """

    staging = target.with_name(f".{target.name}.partial")
    shutil.rmtree(staging, ignore_errors=True)

    def link_or_copy_file(source_file: str, target_file: str) -> None:
        try:
            os.link(source_file, target_file)
        except OSError:
            shutil.copy2(source_file, target_file)

    if source.is_dir():
        shutil.copytree(
            source, staging, symlinks=True, copy_function=link_or_copy_file
        )
    else:
        link_or_copy_file(str(source), str(staging))
    staging.rename(target)


def _move(source: Path, target: Path, *, copy_across_disks: bool) -> str:
    """Move Wordflow's own download; across disks copy it, or drop it."""

    try:
        source.rename(target)
        return "moved"
    except OSError:
        pass
    if copy_across_disks:
        _link_or_copy(source, target)
    if source.is_dir():
        shutil.rmtree(source)
    else:
        source.unlink()
    return "copied" if copy_across_disks else "removed"


def adopt_earlier_model_downloads(
    folders: dict[str, Path],
    earlier: EarlierModelFolders | None = None,
) -> None:
    """Bring models an earlier Wordflow downloaded into the Data Root folders.

    Wordflow's own folders (the spaCy model, the Lindera dictionaries and the
    compiled Core ML models) move, so they take no space twice; the Core ML
    cache is dropped rather than copied to another disk and rebuilds on use.
    The Hugging Face cache is shared with other programs, so Wordflow's models
    there are hard-linked or copied and the originals stay. A folder that
    can't be read, or any other failure, is skipped and downloads again.
    Nothing is replaced, so it does nothing once done.
    """

    if not folders:
        return
    earlier = earlier or earlier_model_folders()
    # (source, target, Wordflow's own, copy to another disk)
    plan: list[tuple[Path, Path, bool, bool]] = []
    hub = folders.get("HF_HOME")
    if hub is not None and earlier.huggingface_hub is not None:
        for name in _wordflow_hugging_face_repos():
            plan.append(
                (earlier.huggingface_hub / name, hub / "hub" / name, False, True)
            )
        plan.append(
            (earlier.huggingface_hub / "coreml", hub / "hub" / "coreml", True, False)
        )
    lindera = folders.get("LINDERA_DICT_PATH")
    if lindera is not None and earlier.lindera is not None:
        try:
            entries = sorted(earlier.lindera.iterdir())
        except OSError:
            entries = []
        for entry in entries:
            plan.append((entry, lindera / entry.name, True, True))
    spacy = folders.get(SPACY_CACHE_VARIABLE)
    if spacy is not None and earlier.spacy is not None:
        plan.append(
            (earlier.spacy / "en_core_web_md", spacy / "en_core_web_md", True, True)
        )

    for source, target, owned, copy_across_disks in plan:
        try:
            if not source.exists() or target.exists() or target.is_symlink():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if owned:
                how = _move(source, target, copy_across_disks=copy_across_disks)
            else:
                _link_or_copy(source, target)
                how = "copied"
        except OSError:
            logger.warning(
                "Could not bring the earlier download %s to %s; it downloads again",
                source,
                target,
                exc_info=True,
            )
            continue
        logger.info("Earlier model download %s: %s to %s", how, source, target)

    # Leave no empty folders of Wordflow's own behind; partial downloads go too.
    if earlier.spacy is not None:
        for leftover in earlier.spacy.glob(".en_core_web_md.*"):
            shutil.rmtree(leftover, ignore_errors=True)
    for folder in (earlier.spacy, earlier.lindera):
        if folder is not None:
            try:
                folder.rmdir()
            except OSError:
                pass

# Variable -> folder name in the fallback root.
CACHE_VARIABLES = {
    "HF_HOME": "huggingface",
    "XDG_CACHE_HOME": "xdg",
    "LINDERA_DICT_PATH": "lindera",
}
# Prefetched entries are linked at this depth (``hub/models--x`` in a Hugging
# Face cache, ``<app>/spacy`` in the XDG cache); shallower folders are made
# writable so new entries can sit beside them.
_LINK_DEPTH = 2


def _writable(folder: Path) -> bool:
    """Whether this process can create files in ``folder``, creating it if needed."""

    try:
        # Each new level private, as Wordflow's own folders are.
        for level in reversed([folder, *folder.parents]):
            if not level.exists():
                level.mkdir(mode=0o700, exist_ok=True)
        descriptor, probe = tempfile.mkstemp(prefix=".wordflow-probe.", dir=folder)
    except OSError:
        return False
    os.close(descriptor)
    Path(probe).unlink(missing_ok=True)
    return True


def _link_entries(source: Path, target: Path, depth: int) -> None:
    """Mirror ``source`` into ``target``: folders above ``depth``, links at it."""

    try:
        entries = list(source.iterdir())
    except OSError:
        return
    for entry in entries:
        destination = target / entry.name
        if depth > 1 and entry.is_dir() and not entry.is_symlink():
            destination.mkdir(exist_ok=True)
            _link_entries(entry, destination, depth - 1)
        elif not destination.exists() and not destination.is_symlink():
            try:
                destination.symlink_to(entry)
            except OSError:
                # Another process linked it first, or links aren't allowed:
                # the entry then downloads again on first use.
                continue


def _fallback_root(data_root: Path | None) -> Path:
    if data_root is not None:
        candidate = data_root / ".cache" / "runtime"
        if _writable(candidate):
            return candidate
    return Path(tempfile.gettempdir()) / "wordflow-cache"


def route_unwritable_caches(data_root: Path | None) -> dict[str, Path]:
    """Point unwritable cache variables at a writable folder; returns the moves."""

    moved: dict[str, Path] = {}
    root: Path | None = None
    for variable, name in CACHE_VARIABLES.items():
        configured = os.environ.get(variable, "").strip()
        if not configured:
            continue
        original = Path(configured)
        if _writable(original):
            continue
        if root is None:
            root = _fallback_root(data_root)
        target = root / name
        if not _writable(target):
            logger.warning(
                "%s (%s) isn't writable, and neither is %s: new downloads will fail",
                variable,
                original,
                target,
            )
            continue
        _link_entries(original, target, _LINK_DEPTH)
        os.environ[variable] = str(target)
        moved[variable] = target
        logger.info(
            "%s (%s) isn't writable by uid %s; new downloads go to %s",
            variable,
            original,
            os.getuid() if hasattr(os, "getuid") else "?",
            target,
        )
    return moved


__all__ = [
    "CACHE_VARIABLES",
    "DATA_ROOT_MODEL_FOLDERS",
    "SPACY_CACHE_VARIABLE",
    "EarlierModelFolders",
    "adopt_earlier_model_downloads",
    "deployment_model_caches",
    "earlier_model_folders",
    "route_unwritable_caches",
    "use_data_root_model_caches",
]
