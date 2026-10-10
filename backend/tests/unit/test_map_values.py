"""Map values (issue 368): the value list and the mapping expression."""

from __future__ import annotations

from datetime import date

import polars as pl

from ldaca_wordflow.models.node_resources import MapValueEntry, MapValuesNodeEditRequest
from ldaca_wordflow.services.category_order import value_counts
from ldaca_wordflow.services.node_operations import _map_values_expression


def test_value_counts_most_common_first_ties_natural_and_limit() -> None:
    frame = pl.LazyFrame(
        {"party": ["b", "a", "A", "Q10", "Q9", "Q9", None, "  ", "a", "A"]}
    )
    counts = value_counts(frame, "party", limit=3)
    # Ties sort A to Z ignoring case (then exact text), numbers inside as numbers.
    assert counts.labels == ["A", "a", "Q9"]
    assert counts.counts == [2, 2, 2]
    # A null and a blank cell are both empty, counted but not listed.
    assert counts.empty_count == 2
    assert counts.distinct_count == 5
    assert (counts.unlisted_values, counts.unlisted_rows) == (2, 2)


def test_mapping_matches_dates_as_listed_and_maps_empty_cells() -> None:
    frame = pl.DataFrame({"day": [date(2020, 1, 2), None, date(2021, 5, 6)]})
    assert value_counts(frame.lazy(), "day", limit=10).labels == [
        "2020-01-02",
        "2021-05-06",
    ]
    request = MapValuesNodeEditRequest(
        column="day",
        output_column="period",
        mapping=[MapValueEntry(value="2020-01-02", to="early")],
        empty_to="unknown",
        unlisted="keep",
    )
    result = frame.select(_map_values_expression(request, pl.Date()).alias("period"))
    assert result["period"].to_list() == ["early", "unknown", "2021-05-06"]
