"""Downloaded models live in the Data Root, and earlier downloads move there."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from ldaca_wordflow import runtime_caches
from ldaca_wordflow.runtime_caches import (
    SPACY_CACHE_VARIABLE,
    EarlierModelFolders,
    adopt_earlier_model_downloads,
    deployment_model_caches,
    use_data_root_model_caches,
)


def test_unset_variables_point_into_the_data_root(tmp_path: Path) -> None:
    environ: dict[str, str] = {}

    folders = use_data_root_model_caches(
        tmp_path, environ=environ, deployment=frozenset()
    )

    models = tmp_path / ".cache" / "models"
    assert folders == {
        "HF_HOME": models / "huggingface",
        "LINDERA_DICT_PATH": models / "lindera",
        SPACY_CACHE_VARIABLE: models / "spacy",
    }
    assert environ == {variable: str(folder) for variable, folder in folders.items()}


def test_folders_the_deployment_set_are_kept(tmp_path: Path) -> None:
    # The server image sets HF_HOME, and its spaCy model sits in the XDG cache.
    deployment = deployment_model_caches(
        {"HF_HOME": "/opt/models", "XDG_CACHE_HOME": "/opt/cache"}
    )
    environ = {"HF_HOME": "/opt/models"}

    folders = use_data_root_model_caches(
        tmp_path, environ=environ, deployment=deployment
    )

    assert deployment == {"HF_HOME", SPACY_CACHE_VARIABLE}
    assert set(folders) == {"LINDERA_DICT_PATH"}
    assert environ["HF_HOME"] == "/opt/models"
    assert SPACY_CACHE_VARIABLE not in environ


def _earlier_downloads(root: Path) -> EarlierModelFolders:
    """Downloads as an earlier Wordflow left them, beside another program's model."""

    hub = root / "huggingface" / "hub"
    bert = hub / "models--bert-base-uncased"
    (bert / "blobs").mkdir(parents=True)
    (bert / "blobs" / "abc").write_text("tokenizer", encoding="utf-8")
    snapshot = bert / "snapshots" / "rev"
    snapshot.mkdir(parents=True)
    (snapshot / "tokenizer.json").symlink_to(Path("..") / ".." / "blobs" / "abc")
    (hub / "models--someone--their-llm").mkdir()
    (hub / "coreml" / "bucket").mkdir(parents=True)
    (hub / "coreml" / "bucket" / "model.mlmodelc").write_text("c", encoding="utf-8")

    lindera = root / "ldaca"
    (lindera / "lindera-jieba-3.0.7").mkdir(parents=True)
    (lindera / "lindera-jieba-3.0.7" / "dict.da").write_text("d", encoding="utf-8")
    (lindera / "lindera-jieba-3.0.7.lock").write_text("", encoding="utf-8")

    spacy = root / "Caches" / "spacy"
    (spacy / "en_core_web_md").mkdir(parents=True)
    (spacy / "en_core_web_md" / "config.cfg").write_text("[nlp]", encoding="utf-8")
    (spacy / ".en_core_web_md.partial123").mkdir()
    return EarlierModelFolders(huggingface_hub=hub, lindera=lindera, spacy=spacy)


def _known(earlier: EarlierModelFolders) -> tuple[Path, Path, Path]:
    hub, lindera, spacy = earlier.huggingface_hub, earlier.lindera, earlier.spacy
    assert hub is not None and lindera is not None and spacy is not None
    return hub, lindera, spacy


def _data_root_folders(data_root: Path) -> dict[str, Path]:
    return use_data_root_model_caches(
        data_root, environ={}, deployment=frozenset()
    )


def test_earlier_downloads_move_and_shared_models_are_linked(tmp_path: Path) -> None:
    earlier = _earlier_downloads(tmp_path / "home")
    old_hub, old_lindera, old_spacy = _known(earlier)
    folders = _data_root_folders(tmp_path / "data")

    adopt_earlier_model_downloads(folders, earlier)

    hub = folders["HF_HOME"] / "hub"
    old_bert = old_hub / "models--bert-base-uncased"
    new_bert = hub / "models--bert-base-uncased"
    # Shared cache: Wordflow's model is linked in, the original stays whole.
    assert (new_bert / "snapshots" / "rev" / "tokenizer.json").read_text(
        encoding="utf-8"
    ) == "tokenizer"
    assert (old_bert / "blobs" / "abc").is_file()
    assert (new_bert / "blobs" / "abc").stat().st_ino == (
        old_bert / "blobs" / "abc"
    ).stat().st_ino
    assert not (hub / "models--someone--their-llm").exists()
    # Wordflow's own folders move.
    assert (hub / "coreml" / "bucket" / "model.mlmodelc").is_file()
    assert not (old_hub / "coreml").exists()
    lindera = folders["LINDERA_DICT_PATH"]
    assert (lindera / "lindera-jieba-3.0.7" / "dict.da").is_file()
    assert (lindera / "lindera-jieba-3.0.7.lock").is_file()
    assert not old_lindera.exists()
    spacy = folders[SPACY_CACHE_VARIABLE]
    assert (spacy / "en_core_web_md" / "config.cfg").is_file()
    assert not old_spacy.exists()

    # Once done, it does nothing.
    adopt_earlier_model_downloads(folders, earlier)
    assert (new_bert / "blobs" / "abc").is_file()


def test_a_download_already_in_the_data_root_is_kept(tmp_path: Path) -> None:
    earlier = _earlier_downloads(tmp_path / "home")
    old_hub, old_lindera, old_spacy = _known(earlier)
    folders = _data_root_folders(tmp_path / "data")
    current = folders[SPACY_CACHE_VARIABLE] / "en_core_web_md"
    current.mkdir(parents=True)
    (current / "config.cfg").write_text("newer", encoding="utf-8")

    adopt_earlier_model_downloads(folders, earlier)

    assert (current / "config.cfg").read_text(encoding="utf-8") == "newer"
    assert (old_spacy / "en_core_web_md" / "config.cfg").is_file()


def test_on_another_disk_own_downloads_copy_and_core_ml_is_dropped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    earlier = _earlier_downloads(tmp_path / "home")
    old_hub, old_lindera, old_spacy = _known(earlier)
    folders = _data_root_folders(tmp_path / "data")
    home = tmp_path / "home"
    original_rename = Path.rename

    def rename_on_one_disk(self: Path, target):
        if self.is_relative_to(home):
            raise OSError(18, "Invalid cross-device link")
        return original_rename(self, target)

    monkeypatch.setattr(Path, "rename", rename_on_one_disk)

    adopt_earlier_model_downloads(folders, earlier)

    assert (folders[SPACY_CACHE_VARIABLE] / "en_core_web_md" / "config.cfg").is_file()
    assert not old_spacy.exists()
    assert (folders["LINDERA_DICT_PATH"] / "lindera-jieba-3.0.7" / "dict.da").is_file()
    # A rebuildable compiled cache is not worth copying to another disk.
    assert not (folders["HF_HOME"] / "hub" / "coreml").exists()
    assert not (old_hub / "coreml").exists()


@pytest.mark.skipif(
    sys.platform == "win32" or (hasattr(os, "geteuid") and os.geteuid() == 0),
    reason="needs POSIX permissions that bind this user",
)
def test_an_unreadable_earlier_folder_is_left_to_download_again(
    tmp_path: Path,
) -> None:
    earlier = _earlier_downloads(tmp_path / "home")
    old_hub, old_lindera, old_spacy = _known(earlier)
    folders = _data_root_folders(tmp_path / "data")
    old_spacy.chmod(0o000)
    try:
        adopt_earlier_model_downloads(folders, earlier)
    finally:
        old_spacy.chmod(0o755)

    assert not (folders[SPACY_CACHE_VARIABLE] / "en_core_web_md").exists()
    # The other downloads still came across.
    assert (folders["LINDERA_DICT_PATH"] / "lindera-jieba-3.0.7").is_dir()


def test_wordflow_names_only_its_own_hugging_face_models() -> None:
    assert runtime_caches._wordflow_hugging_face_repos() == [
        "models--bert-base-uncased",
        "models--sentence-transformers--all-MiniLM-L6-v2",
        "models--sentence-transformers--paraphrase-multilingual-MiniLM-L12-v2",
    ]
