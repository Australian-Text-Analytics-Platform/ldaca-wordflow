"""Compare the production Frequency View with the former stored statistics Table.

Run with: uv run --no-project --with duckdb==1.5.5 python backend/scripts/benchmark_frequency_views.py
All database and export files are synthetic and temporary. No project is opened.
"""

import argparse
import json
import pathlib
import statistics
import tempfile
import time

import duckdb


def sql(n0, n1):
    template = (
        pathlib.Path(__file__).resolve().parents[1]
        / "src/project/frequency_statistics.sql"
    )
    return template.read_text().format(
        reference="corpus0", study="corpus1", n0=n0, n1=n1, grand=max(n0 + n1, 1)
    )


DERIVED = "SELECT *, CASE WHEN percent_corpus_0>percent_corpus_1 THEN 'Reference' WHEN percent_corpus_0<percent_corpus_1 THEN 'Study' ELSE 'Equal' END AS overuse, sign(percent_corpus_0-percent_corpus_1)*abs(log_likelihood_llv) AS signed_ll FROM {relation}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--sizes", nargs="+", type=int, default=[10000, 100000, 1000000]
    )
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument(
        "--output", default="/tmp/wordflow-frequency-view-benchmark.json"
    )
    parser.add_argument("--on-disk", action="store_true")
    args = parser.parse_args()
    workspace = tempfile.TemporaryDirectory(prefix="wordflow-frequency-benchmark-")
    conn = duckdb.connect(
        str(pathlib.Path(workspace.name) / "benchmark.duckdb")
        if args.on_disk
        else ":memory:"
    )
    conn.execute("CREATE SCHEMA wordflow")
    conn.execute("SET schema='wordflow'")
    conn.execute(f"SET threads={args.threads}")
    records = []
    for size in args.sizes:
        # The UNION vocabulary has `size` tokens, with shared, reference-only and study-only words.
        # Different modular distributions avoid ties swallowing all interesting sorts.
        conn.execute(
            f"CREATE OR REPLACE TABLE corpus0 AS SELECT 'token_'||lpad(i::VARCHAR,8,'0') token, (1+10000//(1+(i*37)%10000))::UBIGINT frequency FROM range({size}) t(i) WHERE i%5<>0"
        )
        conn.execute(
            f"CREATE OR REPLACE TABLE corpus1 AS SELECT 'token_'||lpad(i::VARCHAR,8,'0') token, (1+20000//(1+(i*71)%10000))::UBIGINT frequency FROM range({size}) t(i) WHERE i%5<>1"
        )
        n0 = conn.execute("SELECT sum(frequency) FROM corpus0").fetchone()[0]
        n1 = conn.execute("SELECT sum(frequency) FROM corpus1").fetchone()[0]
        conn.execute("CREATE OR REPLACE VIEW stats_view AS " + sql(n0, n1))
        conn.execute(
            "CREATE OR REPLACE TABLE stats_table AS SELECT * EXCLUDE (overuse,signed_ll) FROM stats_view"
        )
        assert conn.execute("SELECT count(*) FROM stats_table").fetchone()[0] == size
        conn.execute("CHECKPOINT")
        # Warm both paths before alternating measured runs.
        cases = {
            "ll_page": ("page", "log_likelihood_llv DESC,token", 0, ""),
            "signed_ll_page": ("page", "signed_ll DESC,token", 0, ""),
            "overuse_page": ("page", "overuse ASC,token", 0, ""),
            "difference_page": ("page", "percent_diff DESC,token", 0, ""),
            "deep_page": ("page", "log_likelihood_llv DESC,token", size // 2, ""),
            "filtered_page": (
                "page",
                "log_likelihood_llv DESC,token",
                0,
                "WHERE token ILIKE '%123%' AND lower(token) NOT IN ('token_00000123','token_00001230')",
            ),
            "juxtorpus": ("cloud", "", 0, ""),
            "csv_export": ("export", "log_likelihood_llv DESC,token", 0, ""),
        }

        def run(relation, kind, order, offset, predicate):
            base = (
                "SELECT * FROM stats_view"
                if relation == "stats_view"
                else DERIVED.format(relation=relation)
            )
            base = f"SELECT * FROM ({base}) {predicate}"
            if kind == "cloud":
                scored = f"SELECT *,log10(freq_corpus_0::DOUBLE+freq_corpus_1::DOUBLE)*log_ratio AS __score FROM {relation} WHERE freq_corpus_0::DOUBLE+freq_corpus_1::DOUBLE>10"
                query = f"WITH scored AS ({scored}) SELECT * EXCLUDE (__score) FROM ((SELECT * FROM scored ORDER BY __score DESC,token LIMIT 100) UNION (SELECT * FROM scored ORDER BY __score ASC,token LIMIT 100)) ORDER BY __score DESC,token"
                conn.execute(f"SELECT count(*) FROM ({query})").fetchone()
                return conn.execute(query + " LIMIT 5000 OFFSET 0").fetchall()
            query = f"{base} ORDER BY {order}"
            if kind == "page":
                conn.execute(f"SELECT count(*) FROM ({query})").fetchone()
                return conn.execute(f"{query} LIMIT 50 OFFSET {offset}").fetchall()
            # Same engine-side table serialization cost for both. This does not benchmark Rust CSV formatting/HTTP.
            conn.execute(
                f"COPY ({query}) TO '{workspace.name}/export.csv' (FORMAT CSV,HEADER)"
            )

        for name, case in cases.items():
            for rel in ["stats_table", "stats_view"]:
                run(rel, *case)
            samples = {"stats_table": [], "stats_view": []}
            for repeat in range(args.repeats):
                order = (
                    ["stats_table", "stats_view"]
                    if repeat % 2 == 0
                    else ["stats_view", "stats_table"]
                )
                for rel in order:
                    start = time.perf_counter()
                    run(rel, *case)
                    samples[rel].append((time.perf_counter() - start) * 1000)
            record = {
                "vocabulary": size,
                "case": name,
                "threads": args.threads,
                "samples_ms": samples,
            }
            record.update(
                {
                    rel + "_median_ms": statistics.median(values)
                    for rel, values in samples.items()
                }
            )
            records.append(record)
            print(
                json.dumps(
                    {key: value for key, value in record.items() if key != "samples_ms"}
                ),
                flush=True,
            )
            pathlib.Path(args.output).write_text(
                json.dumps(
                    {
                        "duckdb": duckdb.__version__,
                        "on_disk": args.on_disk,
                        "records": records,
                    },
                    indent=2,
                )
                + "\n"
            )
    conn.close()
    workspace.cleanup()
    print("Saved " + args.output, flush=True)


if __name__ == "__main__":
    main()
