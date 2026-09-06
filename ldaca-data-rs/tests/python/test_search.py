import json
from pathlib import Path

import pytest

from ldaca_data_rs import (
    InvalidInputError,
    build_search_body,
    jsonld_value,
)
from ldaca_data_rs import (
    extract_identifier as extract_ldaca_identifier,
)


def test_extract_ldaca_identifier_from_portal_collection_url() -> None:
    identifier = extract_ldaca_identifier(
        "https://data.ldaca.edu.au/collection?"
        "id=arcp%3A%2F%2Fname%2Chdl10.26180~23961609&"
        "_crateId=arcp%3A%2F%2Fname%2Chdl10.26180~23961609"
    )

    assert identifier == "arcp://name,hdl10.26180~23961609"


def test_extract_ldaca_identifier_accepts_raw_arcp_id() -> None:
    assert (
        extract_ldaca_identifier(" arcp://name,hdl10.26180~23961609 ")
        == "arcp://name,hdl10.26180~23961609"
    )


def test_jsonld_value_normalizes_common_oni_shapes() -> None:
    assert jsonld_value([{"@value": "COOEE"}]) == "COOEE"
    assert jsonld_value({"@id": "arcp://name,cooee"}) == "arcp://name,cooee"
    assert jsonld_value(["text/plain", {"@id": "https://example.org/pronom"}]) == [
        "text/plain",
        "https://example.org/pronom",
    ]
    assert jsonld_value(None) is None


@pytest.mark.parametrize(
    ("limit", "offset"),
    [(0, 0), (101, 0), (1, -1)],
)
def test_build_search_body_rejects_invalid_pagination(
    limit: int,
    offset: int,
) -> None:
    with pytest.raises(InvalidInputError):
        build_search_body(
            method="keyword",
            query="conversation",
            limit=limit,
            offset=offset,
        )


_SEARCH_FIXTURES = json.loads(
    (Path(__file__).parent.parent / "fixtures/search-baseline.json").read_text()
)


@pytest.mark.parametrize(
    "fixture",
    _SEARCH_FIXTURES,
    ids=lambda f: f"{f['method']}-{f['query'] or 'empty'}-{f['limit']}-{f['offset']}",
)
def test_search_bodies_match_wordflow_baseline(fixture):
    arguments = {key: value for key, value in fixture.items() if key != "body"}
    assert build_search_body(**arguments) == fixture["body"]
