# Representative research data

These files are entirely synthetic, deterministic and test-only. They contain no
real participants, research records or copyrighted source corpus. Ordinary browser
and native `research-*.spec.ts` scenarios import these files through Data Loader,
configure inputs and Run through UI controls, inspect charts, and publish rows.
They run by default, alongside small exact-answer regressions. Performance tests
continue to generate large datasets separately with the existing opt-in flags.

## Files and expected observations

| Files | Contents and assertions |
|---|---|
| `community-survey.csv`, `.json`, `.parquet` | The same 480 records, 8 unequal/case-varied topics, 160 observed dates from 2025-11-01 to 2026-04-23 with gaps. Total weight 2,309; 29 missing measurements; 468 rows with usable scatter X/Y. Duplicate coordinates, one outlier, zero weights, long multilingual labels and incomplete three-stage responses. |
| `survey-participants.json` | 175 lookup records: 160 survey participants, 14 additional records sharing a key and one unmatched participant. A left join produces exactly 494 rows, including 320 without a participant match. |
| `dense-trends.json`, `.parquet` | 720 records over 2025-12-24 to 2026-01-08, 8 unequal groups, missing days, long labels, NULL measurements and offset-bearing timestamps. Exercises first legend redraw, dense ticks, resize, and single-month Calendar bounds across a year boundary. |
| `public-discourse-reference.json` | 72 documents, including NULL and blank text; 70 matching documents and 333 case-insensitive whole-word occurrences of `policy`. |
| `public-discourse-study.json` | 54 documents; 52 matching documents and 248 occurrences of `policy`. A different vocabulary mix for comparison. |
| `public-discourse-quotations.json` | 28 records, including NULL and non-quotation text; 26 matching documents and 39 quotations with the pinned extractor. Nested tags and long topic labels. |
| `annotation-documents.json`, `annotation-codebook.json` | 39 source rows and two synthetic codes. Explicit text keys include `"01"` and `"1"`; data includes duplicate/Unicode/long documents, three blank/NULL documents, invalid labels and correction/metadata columns. Manual tests preserve patches across pages; AI tests run 36 nonblank documents through real HTTP or the local Apple model. |
| `topic-consultation-reference.json`, `topic-consultation-study.json` | 96 and 64 synthetic consultation rows with three unequal themes, varied first-person experiences, deliberate duplicate documents, long text, NULLs/blanks, Chinese and emoji, nested metadata and a deliberate `TOPIC_top1` name collision. Joint Preview selects 60/40 rows; Run retains all 96/64. Topic IDs are model-derived, not hand-authored labels. |

The survey JSON is also an independent row-level oracle: tests calculate expected
sums/means and publication identities from it, without using the production
projection builder. Parquet preserves DATE, TIMESTAMPTZ and DECIMAL columns. CSV
requires type inference and a UI conversion for offset-bearing `recorded_at` text;
its date field is inferred directly. CSV empty fields follow the importer's NULL
convention; JSON and Parquet additionally preserve empty category strings.

Text files vary document lengths, term positions and repetition. They contain
emoji, accented words, CJK, embedded newlines and nested metadata. They are useful
for layout, pagination and interaction coverage, not linguistic model evaluation.

## Regeneration

From the repository root, with Node and the DuckDB CLI on PATH:

```sh
node frontend/scripts/generate-e2e-data.mjs
```

`DUCKDB_CLI` can select an absolute CLI path. The committed Parquet was generated
with DuckDB 1.5.5. No network or random seed is needed. Normal test runs use the
committed files and require neither the CLI nor regeneration. When changing the
generator, regenerate all files together and review the expectations above and in
the scenarios. Parquet byte differences between CLI versions are not behavioral
assertions; the importer checks its row count and typed columns.

## Coverage and boundaries

- Browser uses the visible file-path import control. Native tests deliver a file
  drop to the real Data Loader handler; they do not automate the OS file chooser.
- Test-owned temporary copies give each journey an independent source name. Imports
  copy rows into the project; temporary files are removed after the journey.
- Representative file-import journeys never insert data, register nodes or submit
  analyses directly through SQL/API. Read-only API queries verify saved outputs
  after UI actions.
- All five plot modes check import, input selection, Run, keyboard selection,
  publication and light/dark/normal/narrow rendering. Browser also verifies SVG
  download contents. Scatter checks selected original-row identity despite overlap.
- Selected publication is checked against independently calculated original row IDs: inclusive Trends intervals, Compare category/stack pairs, Heatmap cells, duplicate-coordinate Scatter points and overlapping Sankey transition unions.
- Trends exercises gaps, case-sensitive groups, normalization and year navigation;
  Heatmap checks means from underlying rows; Sankey checks both adjacent transitions.
- Frequency checks a larger vocabulary and both corpora's counts. A ranked token
  opens two-source Concordance, whose complete counts, metadata, dispersion and
  Combined layout are checked. Quotation checks Preview, Run, pagination and
  publication across the complete result.
- Screenshots under `frontend/.tmp/wdio/` are review evidence, not pixel-baseline
  assertions. Existing session-error capture fails on unexpected application errors.
- Export reads all 480 rows back in CSV, JSON, NDJSON, Parquet and Arrow, checks ZIP members, and opens selected/complete project files in fresh native runtimes. The native reopen scenario additionally closes and reopens a real project window via the desktop document coordinator.
- Annotation uses a controlled external HTTP provider with successful, partial, authentication-failure and held-response modes. Assertions check exact source changes, fresh Preview calls, bounded batching, cancellation and unchanged failed rows. Apple/live-provider acceptance remains opt-in.
- The joined-data journey imports survey and participant files, creates a Join through Preprocessing, runs Compare, publishes original rows and verifies those rows survive Clear and reload.
- Topic Modelling's `topic-modeling.spec.ts` scenarios additionally check shared
  tokenizer selection, temporary sampled Preview, full Run, map selection,
  annotated publication and independent Clear. Browser checks lasso filtering
  after zoom and PNG/SVG/JPEG/CSV ZIP downloads. Native chooser/save-dialog and
  release-app visual checks remain separate from WebdriverIO.
- Large capacity, OS chooser interaction and native save-dialog checks retain their
  separate suites. No performance claim follows from these moderate-sized files.
