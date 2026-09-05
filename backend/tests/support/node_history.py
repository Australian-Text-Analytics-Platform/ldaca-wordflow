import polars as pl
from ldaca_wordflow.domain.workspace import Node


def _plan(value: int) -> pl.LazyFrame:
    return pl.DataFrame({"value": [value]}).lazy()


def _value(node: Node) -> int:
    return int(node.data.collect().item())
