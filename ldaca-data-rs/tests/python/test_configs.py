import pytest

from ldaca_data_rs import wordflow_config


@pytest.mark.parametrize(
    ("identifier", "table"),
    [
        pytest.param("arcp://name,hdl10.26180~23961609", "Place", id="cooee"),
        pytest.param(
            "https://data.ldaca.edu.au/collection?id=arcp%3A%2F%2Fname%2Chdl10.26181~23089559&_crateId=arcp%3A%2F%2Fname%2Chdl10.26181~23089559",
            "Dataset",
            id="portal-url",
        ),
        pytest.param(
            "arcp://name,hdl10.25949~24769173.v1", "CreativeWork", id="versioned-corpus"
        ),
        pytest.param(
            "arcp://name,unknown-corpus", "RepositoryObject", id="general-fallback"
        ),
    ],
)
def test_wordflow_profile_selects_corpus_configuration(identifier, table):
    tables = wordflow_config(identifier)["tables"]
    assert table in tables
    assert ("RepositoryObject" in tables) == (table == "RepositoryObject")
