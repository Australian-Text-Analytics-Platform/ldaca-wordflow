import polars as pl
import pytest
from ldaca_wordflow.analysis.concordance_core import (
    build_concordance_search_pattern,
    compute_concordance_page,
    concordance_non_empty_expr,
)
from ldaca_wordflow.shared.errors import InvalidInputError


def test_filter_concordance_rows_removes_blank_entries():
    df = pl.DataFrame(
        {
            "CONC_matched_text": ["alpha", None, "   ", ""],
            "CONC_left_context": ["", "", "", ""],
            "CONC_right_context": ["", "context", "\t", None],
        }
    )

    filtered = df.filter(concordance_non_empty_expr())

    assert filtered.height == 2


def test_build_concordance_search_pattern_wraps_whole_word_literals():
    pattern, use_regex = build_concordance_search_pattern(
        "alpha.beta",
        regex=False,
        whole_word=True,
    )

    assert pattern == r"\b(?:alpha\.beta)\b"
    assert use_regex is True


@pytest.mark.parametrize(
    ("term", "text", "expected"),
    [
        # Japanese and Chinese have no spaces, so Whole word must still match (issue 220).
        ("いただ", "発表させていただきます。", True),
        ("頂く", "ご確認して頂くようお願いします。", True),
        ("经济", "中国经济发展很快", True),
        # Spaced languages keep whole-word behaviour.
        ("cat", "the cat sat", True),
        ("cat", "concatenate", False),
        # A mixed term keeps the boundary on its Latin edge only, so it needs a
        # space or punctuation there (Rust regex has no lookbehind to allow kana).
        ("AI技術", "「AI技術」を紹介", True),
        ("AI技術", "BRAI技術", False),
        ("AI技術", "最新のAI技術", False),
        # Korean separates words with spaces, so its boundary stays.
        ("학교", "학교에", False),
    ],
)
def test_whole_word_skips_boundaries_next_to_unspaced_scripts(term, text, expected):
    pattern, use_regex = build_concordance_search_pattern(
        term, regex=False, whole_word=True
    )

    assert use_regex is True
    assert pl.Series([text]).str.contains(pattern).item() is expected


def test_compute_concordance_page_groups_matches_by_source_row():
    request = {
        "search_word": "alpha",
        "num_left_tokens": 2,
        "num_right_tokens": 2,
        "regex": False,
        "case_sensitive": False,
    }
    source = pl.DataFrame(
        {
            "text": ["alpha beta alpha", "gamma alpha"],
            "speaker": ["A", "B"],
        }
    ).lazy()

    result = compute_concordance_page(
        source,
        "text",
        request,
        page=1,
        page_size=1,
        sort_by=None,
        descending=False,
        node_label="node-a",
    )

    assert result["pagination"]["page_size"] == 1
    assert len(result["data"]) == 1

    grouped_row = result["data"][0]
    assert isinstance(grouped_row, list)
    assert len(grouped_row) == 2
    assert all(hit["speaker"] == "A" for hit in grouped_row)
    assert all(hit["__source_node"] == "node-a" for hit in grouped_row)
    assert [hit["CONC_matched_text"] for hit in grouped_row] == ["alpha", "alpha"]


def test_compute_concordance_page_whole_word_ignores_partial_matches():
    request = {
        "search_word": "alpha",
        "num_left_tokens": 2,
        "num_right_tokens": 2,
        "regex": False,
        "case_sensitive": False,
        "whole_word": True,
    }
    source = pl.DataFrame(
        {
            "text": ["alphabet soup", "alpha beta"],
            "speaker": ["A", "B"],
        }
    ).lazy()

    result = compute_concordance_page(
        source,
        "text",
        request,
        page=1,
        page_size=5,
        sort_by=None,
        descending=False,
        node_label="node-a",
    )

    assert len(result["data"]) == 1
    assert result["data"][0][0]["speaker"] == "B"
    assert result["data"][0][0]["CONC_matched_text"] == "alpha"


def test_compute_concordance_page_ignores_punctuation_in_context_counts() -> None:
    request = {
        "search_word": "target",
        "num_left_tokens": 2,
        "num_right_tokens": 2,
        "regex": False,
        "case_sensitive": False,
        "ignore_punctuation": True,
    }
    source = pl.DataFrame({"text": ["alpha one , , , target . . three omega"]}).lazy()

    result = compute_concordance_page(
        source,
        "text",
        request,
        page=1,
        page_size=5,
        sort_by=None,
        descending=False,
    )

    hit = result["data"][0][0]
    assert (
        hit["CONC_left_context"],
        hit["CONC_l1"],
        hit["CONC_right_context"],
        hit["CONC_r1"],
        hit["CONC_extraction"],
    ) == (
        "alpha one , , , ",
        "one",
        " . . three omega",
        "three",
        "alpha one , , , target . . three omega",
    )


def test_compute_concordance_page_rejects_an_unknown_sort_column() -> None:
    source = pl.DataFrame({"text": ["alpha"]}).lazy()

    with pytest.raises(InvalidInputError, match="Sort column"):
        compute_concordance_page(
            source,
            "text",
            {
                "search_word": "alpha",
                "num_left_tokens": 1,
                "num_right_tokens": 1,
                "regex": False,
                "case_sensitive": False,
            },
            page=1,
            page_size=10,
            sort_by="missing",
            descending=False,
        )


def test_compute_concordance_page_rejects_a_generated_sort_column() -> None:
    source = pl.DataFrame({"text": ["alpha"]}).lazy()

    with pytest.raises(InvalidInputError, match="Sort column"):
        compute_concordance_page(
            source,
            "text",
            {
                "search_word": "alpha",
                "num_left_tokens": 1,
                "num_right_tokens": 1,
                "regex": False,
                "case_sensitive": False,
            },
            page=1,
            page_size=10,
            sort_by="CONC_matched_text",
            descending=False,
        )


_PREVIOUS_CONCORDANCE_COLUMNS = [
    "CONC_left_context",
    "CONC_matched_text",
    "CONC_right_context",
    "CONC_start_idx",
    "CONC_end_idx",
    "CONC_l1",
    "CONC_r1",
    "CONC_l1_freq",
    "CONC_r1_freq",
    "CONC_extraction",
]


def _data_block_from_a_previous_concordance() -> pl.LazyFrame:
    return pl.LazyFrame(
        {
            "text": ["the housing crisis and affordability"],
            "speaker": ["A"],
            **{
                column: [1] if column.endswith(("idx", "freq")) else ["old"]
                for column in _PREVIOUS_CONCORDANCE_COLUMNS
            },
        }
    )


def test_a_concordance_replaces_the_columns_of_a_previous_one():
    """Searching a Data Block made from a Concordance Result (issue 244)."""
    from ldaca_wordflow.analysis.concordance_core import compute_node_concordance_page

    page = compute_node_concordance_page(
        {"lf": _data_block_from_a_previous_concordance(), "column": "text"},
        {
            "search_word": "affordability",
            "regex": False,
            "num_left_tokens": 5,
            "num_right_tokens": 5,
            "case_sensitive": False,
        },
        page=1,
        page_size=10,
        sort_by=None,
        descending=False,
    )

    assert page["columns"] == [
        "text",
        "speaker",
        "CONC_left_context",
        "CONC_matched_text",
        "CONC_right_context",
        "CONC_start_idx",
        "CONC_end_idx",
        "CONC_l1",
        "CONC_r1",
        "CONC_extraction",
    ]
    hit = page["data"][0][0]
    assert hit["CONC_matched_text"] == "affordability"
    assert hit["CONC_l1"] == "and"


def test_a_text_column_named_like_a_concordance_column_becomes_conc_source():
    """A stacked CONC_extraction searched again keeps its text as CONC_source (issue 244)."""
    from ldaca_wordflow.analysis.concordance_core import compute_node_concordance_page

    frame = _data_block_from_a_previous_concordance().with_columns(
        pl.lit("the housing crisis and affordability").alias("CONC_extraction")
    )
    page = compute_node_concordance_page(
        {"lf": frame, "column": "CONC_extraction"},
        {
            "search_word": "affordability",
            "regex": False,
            "num_left_tokens": 5,
            "num_right_tokens": 5,
            "case_sensitive": False,
        },
        page=1,
        page_size=10,
        sort_by=None,
        descending=False,
    )

    # The renamed text keeps its place among the source columns.
    assert page["columns"][:3] == ["text", "speaker", "CONC_source"]
    assert page["columns"].count("CONC_extraction") == 1
    assert len(page["columns"]) == len(set(page["columns"]))
    hit = page["data"][0][0]
    assert hit["CONC_source"] == "the housing crisis and affordability"
    assert hit["CONC_matched_text"] == "affordability"


def test_the_source_text_name_skips_names_already_taken():
    from ldaca_wordflow.analysis.generated_columns import source_text_column_name

    assert source_text_column_name(["text"], "text", "CONC") == "text"
    assert (
        source_text_column_name(["CONC_extraction"], "CONC_extraction", "CONC")
        == "CONC_source"
    )
    assert (
        source_text_column_name(
            ["CONC_source", "CONC_extraction"], "CONC_extraction", "CONC"
        )
        == "CONC_source_2"
    )
    assert (
        source_text_column_name(
            ["CONC_source", "CONC_source_2", "QUOTE_extraction"],
            "QUOTE_extraction",
            "QUOTE",
        )
        == "QUOTE_source"
    )
    # The renamed text is an ordinary column: a later run keeps it as it is.
    assert (
        source_text_column_name(["CONC_source"], "CONC_source", "CONC") == "CONC_source"
    )
