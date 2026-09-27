from __future__ import annotations
from pathlib import Path
import pytest
from pydantic import ValidationError
from ldaca_wordflow.models.data_root import DataRootUpdateRequest



@pytest.mark.parametrize(
    ("raw_path", "expected"),
    [
        ("~", Path.home()),
        ("~/Documents/ldaca", Path.home() / "Documents" / "ldaca"),
    ],
)
def test_data_root_update_expands_the_backend_user_home(
    raw_path: str,
    expected: Path,
) -> None:
    request = DataRootUpdateRequest(data_root=raw_path)

    assert request.data_root == expected


@pytest.mark.parametrize("raw_path", ["relative/path", "~another-user/data"])
def test_data_root_update_rejects_other_non_absolute_paths(raw_path: str) -> None:
    with pytest.raises(ValidationError):
        DataRootUpdateRequest(data_root=raw_path)
