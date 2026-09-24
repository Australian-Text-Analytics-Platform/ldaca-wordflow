from typing import Any

import httpx
import pytest

from ldaca_wordflow.infrastructure.providers.oni import (
    OniClient,
    build_search_body,
    extract_ldaca_identifier,
    jsonld_value,
)
from ldaca_wordflow.models.data_sources import DataPortalSearchMethod


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


@pytest.mark.anyio
async def test_oni_client_uses_injected_runtime_client_and_bearer_header() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "record"})

    async with httpx.AsyncClient(
        base_url="https://data.ldaca.edu.au/api",
        transport=httpx.MockTransport(respond),
    ) as http_client:
        client = OniClient(http_client, token="portal-token")
        await client.get_metadata("record")

    assert requests[0].headers["Authorization"] == "Bearer portal-token"


def test_build_string_search_body_uses_multi_match_and_small_source() -> None:
    body = build_search_body(
        method=DataPortalSearchMethod.KEYWORD,
        query="conversation",
        limit=12,
        offset=24,
    )

    assert body["size"] == 12
    assert body["from"] == 24
    assert "_text" not in body["_source"]
    assert body["query"] == {
        "multi_match": {
            "query": "conversation",
            "fields": ["name.@value", "description.@value", "_text", "@id"],
        }
    }


def test_build_identifier_search_body_accepts_new_identifier_method() -> None:
    body = build_search_body(
        method=DataPortalSearchMethod.IDENTIFIER,
        query="arcp://name,hdl10.26180~23961609",
        limit=10,
        offset=0,
    )

    assert body["query"]["bool"]["minimum_should_match"] == 1
    assert {item["term"].popitem()[1] for item in body["query"]["bool"]["should"]} == {
        "arcp://name,hdl10.26180~23961609"
    }


def test_build_collection_search_body_filters_top_level_collections() -> None:
    body = build_search_body(
        method=DataPortalSearchMethod.COLLECTION,
        query="",
        limit=5,
        offset=0,
    )

    assert body["query"] == {
        "bool": {
            "filter": [
                {"terms": {"@type.keyword": ["Dataset", "RepositoryCollection"]}},
                {"terms": {"_isTopLevel.@value.keyword": ["true"]}},
            ]
        }
    }


@pytest.mark.parametrize(
    ("limit", "offset"),
    [(0, 0), (101, 0), (1, -1)],
)
def test_build_search_body_rejects_invalid_pagination(
    limit: int,
    offset: int,
) -> None:
    with pytest.raises(ValueError):
        build_search_body(
            method=DataPortalSearchMethod.KEYWORD,
            query="conversation",
            limit=limit,
            offset=offset,
        )


def _hit(identifier: str, name: str, access: dict[str, object]) -> dict[str, object]:
    return {
        "_source": {
            "@id": identifier,
            "@type": ["Dataset", "RepositoryCollection"],
            "name": [{"@value": name}],
            "_access": access,
        }
    }


@pytest.mark.anyio
async def test_list_collections_reports_access_for_the_current_token() -> None:
    """#135: every top-level collection, sorted, with typed access."""

    bodies: list[dict[str, object]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        import json

        body = json.loads(request.content)
        bodies.append(body)
        hits = [
            _hit(
                "arcp://b", "Sydney Speaks", {"hasAccess": False, "group": "licence-a"}
            ),
            _hit("arcp://a", "COOEE", {"hasAccess": True}),
        ]
        return httpx.Response(200, json={"hits": {"total": {"value": 2}, "hits": hits}})

    async with httpx.AsyncClient(
        base_url="https://data.ldaca.edu.au/api",
        transport=httpx.MockTransport(respond),
    ) as http_client:
        records = await OniClient(http_client).list_collections()

    assert [(r["title"], r["has_access"], r["access_group"]) for r in records] == [
        ("COOEE", True, None),
        ("Sydney Speaks", False, "licence-a"),
    ]
    assert records[1]["access"] == ["licence-a"]
    assert len(bodies) == 1
    assert bodies[0]["size"] == 100


@pytest.mark.anyio
async def test_list_member_object_ids_pages_through_the_index() -> None:
    offsets: list[int] = []

    def respond(request: httpx.Request) -> httpx.Response:
        import json

        body = json.loads(request.content)
        offsets.append(body["from"])
        assert body["sort"] == ["_doc"]
        assert body["_source"] == ["@id"]
        start = body["from"]
        hits = [
            {"_source": {"@id": f"arcp://object/{index}"}}
            for index in range(start, min(start + body["size"], 150))
        ]
        return httpx.Response(
            200, json={"hits": {"total": {"value": 150}, "hits": hits}}
        )

    async with httpx.AsyncClient(
        base_url="https://data.ldaca.edu.au/api",
        transport=httpx.MockTransport(respond),
    ) as http_client:
        ids = await OniClient(http_client).list_member_object_ids(
            "arcp://root", max_objects=10_000
        )

    assert ids[:2] == ["arcp://object/0", "arcp://object/1"]
    assert len(ids) == 150
    assert offsets == [0, 100]


@pytest.mark.anyio
async def test_metadata_only_merges_each_object_crate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#135: restricted collections tabulate their public object RO-Crates."""

    from ldaca_wordflow.workers import data_portal

    collection = {
        "@graph": [
            {
                "@id": "arcp://root",
                "@type": ["Dataset", "RepositoryCollection"],
                "name": "Speaks",
            }
        ]
    }

    def object_crate(index: int) -> dict[str, object]:
        return {
            "@graph": [
                {
                    "@id": f"arcp://root/o{index}",
                    "@type": ["RepositoryObject"],
                    "name": f"Interview {index}",
                    "ldac:speaker": {"@id": f"arcp://root/speaker/{index}"},
                },
                {
                    "@id": f"arcp://root/speaker/{index}",
                    "@type": "Person",
                    "name": f"Speaker {index}",
                    "gender": "Female",
                },
                # Shared entities appear in every crate but are kept once.
                {
                    "@id": "https://creativecommons.org/licenses/by/4.0/",
                    "name": "CC BY",
                },
            ]
        }

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/search/index/items"):
            hits = [{"_source": {"@id": f"arcp://root/o{index}"}} for index in (1, 2)]
            return httpx.Response(
                200, json={"hits": {"total": {"value": 2}, "hits": hits}}
            )
        identifier = request.url.params["id"]
        if identifier == "arcp://root":
            return httpx.Response(200, json=collection)
        return httpx.Response(200, json=object_crate(int(identifier[-1])))

    real_client = httpx.AsyncClient

    def mocked_client(**kwargs: Any) -> httpx.AsyncClient:
        return real_client(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(data_portal.httpx, "AsyncClient", mocked_client)
    name, merged = await data_portal._fetch_object_crates(
        identifier="arcp://root",
        api_base_url="https://data.ldaca.edu.au/api",
        api_token=None,
        timeout=5,
        download_concurrency=2,
        report=lambda _update: None,
        max_json_bytes=1_000_000,
    )

    assert name == "Speaks"
    ids = [entity["@id"] for entity in merged["@graph"]]
    assert len(ids) == len(set(ids)) == 6
    assert "arcp://root/speaker/2" in ids
