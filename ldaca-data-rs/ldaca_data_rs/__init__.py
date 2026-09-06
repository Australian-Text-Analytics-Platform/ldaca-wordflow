"""LDaCA ONI access and Arrow conversion. Network and conversion code run in Rust."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from os import PathLike, fspath
from typing import Any, Self

from . import _internal
from ._internal import (
    CancelledError as CancelledError,
)
from ._internal import (
    ConversionError as ConversionError,
)
from ._internal import (
    DataError as DataError,
)
from ._internal import (
    HttpError as HttpError,
)
from ._internal import (
    InvalidInputError as InvalidInputError,
)
from ._internal import (
    InvalidResponseError as InvalidResponseError,
)
from ._internal import (
    IoError as IoError,
)
from ._internal import (
    SizeLimitError as SizeLimitError,
)
from ._internal import (
    Table as Table,
)
from ._internal import (
    TableSet as TableSet,
)
from ._internal import (
    TimeoutError as TimeoutError,
)
from ._internal import (
    __version__ as __version__,
)
from ._internal import (
    extract_identifier as extract_identifier,
)


@dataclass(frozen=True)
class SearchPage:
    items: list[dict[str, Any]]
    total: int
    offset: int
    limit: int
    raw: dict[str, Any]


class RoCrate:
    """Ordered offline metadata. JSON-LD contexts are never fetched implicitly."""

    def __init__(self, metadata: bytes | dict[str, Any]) -> None:
        source = (
            metadata
            if isinstance(metadata, bytes)
            else json.dumps(metadata, ensure_ascii=False).encode()
        )
        self._native = _internal._RoCrate(source)

    @classmethod
    def from_path(cls, path: str | PathLike[str]) -> Self:
        instance = cls.__new__(cls)
        instance._native = _internal._RoCrate.from_path(fspath(path))
        return instance

    @property
    def metadata(self) -> dict[str, Any]:
        return json.loads(self._native.metadata_json())

    def types(self) -> list[str]:
        return self._native.types()

    def entity(self, identifier: str) -> dict[str, Any] | None:
        value = self._native.entity_json(identifier)
        return json.loads(value) if value is not None else None

    def name(self, fallback: str = "RO-Crate") -> str:
        return self._native.name(fallback)

    def infer_config(self) -> dict[str, Any]:
        return json.loads(self._native.infer_config_json())

    def to_tables(
        self, *, types: list[str] | None = None, config: dict[str, Any] | None = None
    ) -> TableSet:
        return self._native.to_tables(
            types, json.dumps(config) if config is not None else None
        )

    def wordflow_table(
        self, identifier: str, *, config: dict[str, Any] | None = None
    ) -> Table:
        """Apply the explicit wordflow_v1 metadata-only compatibility profile."""
        return self._native.wordflow_table(
            identifier, json.dumps(config) if config is not None else None
        )

    def text_documents(self) -> list[dict[str, Any]]:
        """Select plain-text corpus derivatives with the wordflow_v1 rules."""
        return json.loads(self._native.documents_json())


class _ClientBase:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = "https://data.ldaca.edu.au/api",
        timeout: float = 30.0,
        max_json_bytes: int = 8 * 1024 * 1024,
        max_document_bytes: int = 16 * 1024 * 1024,
        concurrency: int = 8,
        max_documents: int = 10_000,
    ) -> None:
        self._native = _internal._Client(
            api_key,
            base_url,
            timeout,
            max_json_bytes,
            max_document_bytes,
            concurrency,
            max_documents,
        )

    def with_api_key(self, api_key: str | None) -> Self:
        instance = type(self).__new__(type(self))
        instance._native = self._native.with_api_key(api_key)
        return instance

    def close(self) -> None:
        self._native.close()

    def __repr__(self) -> str:
        return f"<{type(self).__module__}.{type(self).__name__}>"

    def __reduce__(self) -> Any:
        raise TypeError(
            "Create clients in their calling process; clients cannot be serialized"
        )


class Client(_ClientBase):
    """Synchronous client for scripts and process workers; do not use on an event loop."""

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _call(self, operation: str, **args: Any) -> Any:
        return json.loads(self._native.call(operation, json.dumps(args)))

    def configuration(self) -> dict[str, Any]:
        return self._call("configuration")

    def version(self) -> Any:
        return self._call("version")

    def authenticated(self) -> Any:
        return self._call("authenticated")

    def get_object(self, identifier: str) -> dict[str, Any] | None:
        return self._call("object", identifier=identifier)

    def get_metadata(
        self, identifier: str, *, resolved: bool = False, rewrite_ids: bool = False
    ) -> dict[str, Any]:
        return self._call(
            "metadata",
            identifier=identifier,
            resolved=resolved,
            rewrite_ids=rewrite_ids,
        )

    def get_crate(
        self, identifier: str, *, resolved: bool = False, rewrite_ids: bool = False
    ) -> RoCrate:
        return RoCrate(
            self.get_metadata(identifier, resolved=resolved, rewrite_ids=rewrite_ids)
        )

    def search(
        self,
        query: str = "",
        *,
        method: str = "keyword",
        limit: int = 25,
        offset: int = 0,
    ) -> SearchPage:
        _pagination(limit, offset)
        return SearchPage(
            **self._call(
                "search", method=method, query=query, limit=limit, offset=offset
            )
        )

    def search_raw(self, body: dict[str, Any], *, index: str = "items") -> SearchPage:
        return SearchPage(**self._call("search_raw", body=body, index=index))

    def search_field(
        self, field: str, value: str, *, index: str = "items"
    ) -> dict[str, Any]:
        return self._call("field", field=field, value=value, index=index)

    def browse(
        self,
        *,
        member_of: list[str] | None = None,
        conforms_to: str | None = None,
        limit: int = 25,
        offset: int = 0,
    ) -> dict[str, Any]:
        _pagination(limit, offset)
        return self._call(
            "browse",
            member_of=member_of or [],
            conforms_to=conforms_to,
            limit=limit,
            offset=offset,
        )

    def featured_collections(self, identifiers: list[str]) -> list[dict[str, Any]]:
        return self._call("featured", identifiers=identifiers)

    def download_file(
        self,
        identifier: str,
        path: str,
        destination: str | PathLike[str],
        *,
        max_bytes: int,
    ) -> int:
        _budget(max_bytes)
        return self._call(
            "download",
            identifier=identifier,
            path=path,
            destination=fspath(destination),
            max_bytes=max_bytes,
        )

    def download_texts(
        self, identifier: str, paths: list[str], *, max_total_bytes: int
    ) -> dict[str, str]:
        _budget(max_total_bytes)
        return self._call(
            "texts", identifier=identifier, paths=paths, max_total_bytes=max_total_bytes
        )

    def stream_file(
        self, identifier: str, path: str, *, max_bytes: int
    ) -> Iterator[bytes]:
        _budget(max_bytes)
        stream = self._native.open_stream(identifier, path, max_bytes)
        try:
            while (chunk := stream.next_chunk()) is not None:
                yield chunk
        finally:
            stream.close()

    def document_table(
        self, identifier: str, paths: list[str], *, max_total_bytes: int
    ) -> Table:
        """Download selected paths into an Arrow crate_id/path/text table."""
        _budget(max_total_bytes)
        return self._native.document_table(identifier, paths, max_total_bytes)

    def wordflow_table(
        self, identifier: str, crate: RoCrate, *, max_total_bytes: int
    ) -> Table:
        """Apply wordflow_v1 text-first import conversion, without application storage policy."""
        _budget(max_total_bytes)
        return self._native.wordflow_table(identifier, crate._native, max_total_bytes)


class AsyncClient(_ClientBase):
    """Asyncio client. Cancelling a pending await cancels its native operation."""

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        self.close()

    async def _call(self, operation: str, **args: Any) -> Any:
        return json.loads(await self._native.call_async(operation, json.dumps(args)))

    async def configuration(self) -> dict[str, Any]:
        return await self._call("configuration")

    async def version(self) -> Any:
        return await self._call("version")

    async def authenticated(self) -> Any:
        return await self._call("authenticated")

    async def get_object(self, identifier: str) -> dict[str, Any] | None:
        return await self._call("object", identifier=identifier)

    async def get_metadata(
        self, identifier: str, *, resolved: bool = False, rewrite_ids: bool = False
    ) -> dict[str, Any]:
        return await self._call(
            "metadata",
            identifier=identifier,
            resolved=resolved,
            rewrite_ids=rewrite_ids,
        )

    async def get_crate(
        self, identifier: str, *, resolved: bool = False, rewrite_ids: bool = False
    ) -> RoCrate:
        return RoCrate(
            await self.get_metadata(
                identifier, resolved=resolved, rewrite_ids=rewrite_ids
            )
        )

    async def search(
        self,
        query: str = "",
        *,
        method: str = "keyword",
        limit: int = 25,
        offset: int = 0,
    ) -> SearchPage:
        _pagination(limit, offset)
        return SearchPage(
            **await self._call(
                "search", method=method, query=query, limit=limit, offset=offset
            )
        )

    async def search_raw(
        self, body: dict[str, Any], *, index: str = "items"
    ) -> SearchPage:
        return SearchPage(**await self._call("search_raw", body=body, index=index))

    async def search_field(
        self, field: str, value: str, *, index: str = "items"
    ) -> dict[str, Any]:
        return await self._call("field", field=field, value=value, index=index)

    async def browse(
        self,
        *,
        member_of: list[str] | None = None,
        conforms_to: str | None = None,
        limit: int = 25,
        offset: int = 0,
    ) -> dict[str, Any]:
        _pagination(limit, offset)
        return await self._call(
            "browse",
            member_of=member_of or [],
            conforms_to=conforms_to,
            limit=limit,
            offset=offset,
        )

    async def featured_collections(
        self, identifiers: list[str]
    ) -> list[dict[str, Any]]:
        return await self._call("featured", identifiers=identifiers)

    async def download_file(
        self,
        identifier: str,
        path: str,
        destination: str | PathLike[str],
        *,
        max_bytes: int,
    ) -> int:
        _budget(max_bytes)
        return await self._call(
            "download",
            identifier=identifier,
            path=path,
            destination=fspath(destination),
            max_bytes=max_bytes,
        )

    async def download_texts(
        self, identifier: str, paths: list[str], *, max_total_bytes: int
    ) -> dict[str, str]:
        _budget(max_total_bytes)
        return await self._call(
            "texts", identifier=identifier, paths=paths, max_total_bytes=max_total_bytes
        )

    async def stream_file(
        self, identifier: str, path: str, *, max_bytes: int
    ) -> AsyncIterator[bytes]:
        _budget(max_bytes)
        stream = await self._native.open_stream_async(identifier, path, max_bytes)
        try:
            while (chunk := await stream.next_chunk_async()) is not None:
                yield chunk
        finally:
            stream.close()

    async def document_table(
        self, identifier: str, paths: list[str], *, max_total_bytes: int
    ) -> Table:
        _budget(max_total_bytes)
        return await self._native.document_table_async(
            identifier, paths, max_total_bytes
        )

    async def wordflow_table(
        self, identifier: str, crate: RoCrate, *, max_total_bytes: int
    ) -> Table:
        _budget(max_total_bytes)
        return await self._native.wordflow_table_async(
            identifier, crate._native, max_total_bytes
        )


def _budget(value: int) -> None:
    if value < 0:
        raise InvalidInputError("byte budget must be non-negative")


def _pagination(limit: int, offset: int) -> None:
    if limit <= 0 or offset < 0:
        raise InvalidInputError("invalid pagination")


def jsonld_value(value: Any) -> Any:
    return json.loads(_internal.normalize_jsonld(json.dumps(value)))


def build_search_body(
    *, method: str, query: str, limit: int, offset: int
) -> dict[str, Any]:
    _pagination(limit, offset)
    return json.loads(_internal.search_body(method, query, limit, offset))


def wordflow_config(identifier: str) -> dict[str, Any]:
    return json.loads(_internal.wordflow_config(identifier))
