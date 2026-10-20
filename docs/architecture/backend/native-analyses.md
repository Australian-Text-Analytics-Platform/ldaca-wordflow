# Native analyses

Frequency, Concordance, Quotation, Topic Modelling, Annotation and the five Plots modes run inside the owning `ProjectRuntime` and save each tab’s latest successful
result in the `.wfpj` database. It reuses native task ownership and independent
DuckDB operation connections. Archived Python implementations remain reference material.

[Project semantics](../../domain/native-projects.md#metadata-and-results) defines
what users keep. This page owns execution, artifact lifetime and publication.
The [native API reference](../../reference/native-project-api.md) owns route
contracts, and the [frontend overview](../frontend/overview.md#frequency) owns
draft and presentation state.

## Tabs, results and artifacts

Three durable records have distinct responsibilities:

| Record | Owns |
| --- | --- |
| `wordflow.tabs` | Stable identity, kind, name, position and display settings |
| `wordflow.analyses` | Unique owning tab, accepted request, creation time and optional versioned completed output |
| `wordflow.artifacts` | Named outputs owned by one analysis, with `storage_kind`, optional `relation_name`, BLOB content and applicable media type |

There is no stored tab-to-analysis pointer. The child ownership key is unique.
Private artifact Tables and Views have generated names in `wordflow` and remain
absent from both graph modes. `storage_kind='relation'` references a Table or View;
`'blob'` stores bytes with a media type. Typed relations retain exact integer and
floating-point values; result JSON stores small descriptors. Extension annotations
live only in qualified `wordflow.arrow_metadata` rows, independently copied onto
each retained relation. Version-1 snapshots keep their annotations; live version-2
Topics, Concordance and Quotation projections read current source annotations.

Frequency creates and reads tabular artifacts. The schema and shared transactional
cleanup also support BLOB ownership; a future binary-producing analysis will
write and read its bytes within the same publication and read boundaries. `project/analyses.rs` owns kind-scoped tabs, generic result manifests and a shared
publication transaction accepting analysis-produced descriptors/artifacts.
`project/frequency.rs` owns Frequency's request, version decoder, calculations
and projections. Tab numbering and ordering are scoped by kind; all native analysis kinds can be created or run.
There is no dynamic analysis registry, general artifact SQL endpoint, filesystem
manifest or per-result directory. Save As copies results with the rest of the
database.

Frequency and Plots source descriptions record provenance without live SQL dependencies.
Topics, Concordance and Quotation version-2 results instead use the exact-text
lookup contract below. Historical version-1 analyses retain their original meaning
until explicit Rerun.
Frequency persists full count Tables and a comparison View over those counts,
but no permanent source document copy. Results remain readable after their
sources change or disappear.

Historical snapshot analyses retain their original rows; their saved row positions
must never be applied to a freshly read source. Version-2 exact-text lookups retain
processed texts and generated outputs instead of complete source rows. A published
Data Block owns its generated data independently, so deleting the analysis cannot
remove or break it.

## Execution ownership

```mermaid
sequenceDiagram
    participant UI as Frequency tab
    participant Tasks as Native tasks
    participant Runtime as Project runtime
    participant DB as DuckDB
    UI->>Tasks: Submit captured request and tab ID
    Tasks->>Tasks: Admit one active run for this tab
    Tasks->>Runtime: Acquire writable permission
    Runtime->>DB: Replace analysis with captured request and no output
    DB-->>Runtime: Commit and return analysis ID
    Tasks->>Runtime: Load tokenizers in tracked blocking work
    Runtime->>Runtime: Acquire writable operation permission
    Runtime->>DB: Begin read-only snapshot and stream selected inputs
    Runtime->>Runtime: Count tokens
    Runtime->>DB: Finish snapshot and begin publication transaction
    Runtime->>DB: Claim exact accepted analysis and its existing tab
    Runtime->>DB: Save artifacts and complete accepted analysis
    DB-->>Runtime: Commit
    Runtime-->>Tasks: Successful result
    Runtime-->>UI: Committed tab and analysis identity change
    Tasks-->>UI: Terminal summary
```

The HTTP caller captures the ordered sources, document columns and tokenizer
models. An accepted task is associated with its tab. The task collection admits
only one active run for that tab atomically, without a second busy flag or
persisted execution state. Other tabs and projects may overlap.

Before preparation, `begin_analysis_run` claims the existing tab and validates
its kind, deletes the previous analysis and owned artifacts/annotations, inserts a
new analysis UUID with the captured request and no output, and commits. That ID
travels through preparation and calculation. Run and Rerun share this path.
Cleanup reads ownership records and the catalogue without decoding result JSON or
evaluating broken Views. It drops owned Views before Tables and tolerates missing
relations. It never sweeps unrelated private relations or published Data Blocks.
Duplicate admission, editor conflicts and initial-transaction failure preserve
existing state. For one-shot publication, later failure or cancellation leaves the
accepted request without output. Incremental Annotation source commits and
Quotation batches have the durable boundaries described below. Settings updates
cannot overwrite requests because they update a different
record.

Tokenizer preparation uses `TaskContext::run_blocking` without holding a database
connection. The database stage then acquires the ordinary writable operation
permission and rechecks editor protection. A pending or active table editor
rejects that write boundary; analysis has no privileged bypass.

One read-only transaction reads both corpora from the same snapshot and streams
Arrow batches through the native `ldaca-rs` tokenizer/counting code. Native counts
remain in the operation's memory. After finishing the
input snapshot, a short write transaction claims the existing tab and publishes
the result. Both transactions belong to one runtime-owned operation: its
connection and lifecycle/editor leases remain held through computation and
cleanup. Ordinary independent transactions can overlap; editor startup and Save
As wait for that operation. No temporary corpus-file subsystem or global analysis
queue is involved.

Cancellation checks occur between documents, batches and stages. DuckDB work also
registers its connection-specific interrupt handle. A synchronous model load or
individual tokenization call can finish before cancellation settles; no worker
thread is force-terminated. The runtime retains accepted work after HTTP
disconnection or panel unmounting. Failure, cancellation and panic drop the
uncommitted operation connection before reporting completion. Cancellation after
a successful commit cannot turn that result into a failure.

Progress reports stages rather than invented percentages. Task summaries contain
the tab association, not refresh effects, result tables or model credentials. The existing in-memory retention and Close/Quit ownership apply.
Reload reconnects to active tasks; reopening reads saved outputs, including durable
partial Quotation batches, without automatically resuming interrupted work.

## Atomic publication and deletion

Publication starts a fresh transaction after the source snapshot. It claims the
existing tab with reversible writes (DuckDB may elide a no-op update), then verifies
the exact accepted analysis ID, owning tab, kind and absent output. Missing,
replaced or already-completed analyses fail before any artifact creation.
Publication creates outputs and annotations and sets the result/version/completion
time together. Appender flush errors are checked before commit. Conflicts surface
without retries. Cancellation after commit does not undo success.

Schema version 1 retains primary-key, uniqueness and storage-shape checks without
ownership foreign keys. DuckDB can reject parent deletion after deleting referenced
children in the same transaction; centralized ownership keeps replacement atomic.
No journal, background collector or persisted task state repairs partial work.

Deleting a tab removes its analysis and outputs and requests task cancellation.
A racing publisher either commits before deletion or rolls back. Clear removes
artifacts and annotations and nulls the output fields while retaining the analysis
ID and request. Repeated Clear is harmless; active work blocks it. Task dismissal
is independent. Artifact readers validate ownership and read descriptors and
relations within the same snapshot. An existing analysis without output remains
readable, while output-specific operations return `result_unavailable`.

## Frequency projections and export

Frequency artifacts contain the complete vocabulary. Counts use unsigned 64-bit
columns; comparison measures preserve native floating-point NaN and infinity.
Empty results have explicit schemas. As in the native statistics library, two
empty corpora give an empty comparison, one empty corpus fails, and combined
totals must fit `u64`; no partial-success result is fabricated.

All three output contracts start at payload version 1 in schema version 1.
Their comparison artifact is a persisted SQL View containing all statistics,
including Overuse and Signed LL. The definition embeds the captured corpus totals
and references only its result's private count Tables. It never rereads live
corpora. DuckDB stores the definition at publication; application updates do not
regenerate it when opening or querying an existing result. There is no legacy output adapter.

`backend/src/project/frequency_statistics.sql` owns the application's SQL
calculation. The independent native `ldaca-rs` statistics API remains available
to its other consumers and provides a parity oracle in backend tests, including
zero counts, unequal totals, large unsigned counts and non-finite results. There
is no runtime switch between calculation engines or vocabulary cache. The
[benchmark record](../../releases/2026-09-19-frequency-statistics-view.md) records
the measured cost and reproduction command.

Projection requests identify an immutable result and concrete Frequency options.
DuckDB applies stopwords, wildcard filters and sorting before the requested page
or chart limit. Corpus ranks are assigned after stopword exclusion and before wildcard filtering. Ordinary match totals are independent of display limits; exports retain their existing columns. Stopwords do not recalculate corpus totals or other token
statistics. Equal counts use token order as a deterministic tie-breaker.
Overuse and Signed LL are columns of the saved View and are sortable and exportable. Juxtorpus requires
more than ten combined occurrences and takes both ends of its weighted LogRatio
ranking, retaining neutral words and deduplicating overlap. The %DIFF and ELL
calculations remain unchanged.
`project/stopwords.rs` owns normalized word membership for editor reads, membership
changes, Frequency projections and exports. Live bubble actions submit small membership deltas; the backend applies DuckDB normalization and the word limit atomically. Unsubmitted text remains local on failure. Optional sorting stages complete rows and reinserts them into the existing Table in normalized word order within that same transaction. Constraints, defaults, registration and metadata are retained; any failure rolls back the whole operation. Preparation resolves a selected Table or
creates a registered copy of a View column with captured logical parents.

The client supplies `stopword_source: {source: {schema, name}, column}`. The backend
resolves the column and materializes its normalized words once into a
connection-local temporary relation inside the read transaction. It uses DuckDB's
text representation, trims whitespace, ignores NULL/blank values and deduplicates
case-insensitively in first occurrence order. More than 100,000 words is an error.
Projection count and page queries reuse that relation, including for volatile or
external Views. These sources remain ordinary project Tables/Views, outside
analysis artifact ownership. Count queries omit final display ordering; Juxtorpus
retains the ordering and limits that define its selected membership.
Tabs save the source reference and filtering toggle only. See the
[shared stopword ownership](../frontend/overview.md#shared-stopword-data-blocks)
for editing, invalidation and reference reconciliation.

Table exports include all matching rows rather than the currently displayed page,
with saved corpus names in the Reference/Study column headers.
Native exports reuse destination-adjacent staging, synchronization and final
installation. Browser downloads use the same saved result. CSV/Markdown exports
read the selected stopword source when Export runs. Bundles produce their table
and optional stopword text from the same transaction-local relation and return
both as multipart parts. Chart exports capture the displayed SVG and its matching
word set before preparing image/archive bytes.
Accepted export failures retain the task observer as their notification owner.

The storage foundation supports future nested document tables, retained source
rows, binary model/projection context and mutation completion records. It does
not restore those tools or require them to share Frequency's calculation logic.


## Concordance Preview and saved results

`project/concordance.rs` owns the concrete matcher adapter, page capture and
Run calculation. `project/concordance/queries.rs` owns typed saved queries,
density and publication. Both Preview and Run use the same native
`ldaca-rs` document matcher; token matching preserves original character offsets.

Preview prepares its matcher before obtaining a connection. A read-only
transaction captures one document page and one lookahead row; matching visits
only that page. Metadata sorting happens before pagination and can require a
larger database sort. Preview does not count the entire source, create result
records or enter task history. A caller-owned cancellation guard cancels the
operation when its request disappears; the owned operation retains lifecycle
permission until cleanup. Presentation changes reuse the returned Arrow page.
The frontend keeps submitted Preview settings only for the current tab visit.
Leaving the tab discards settings and pages; reopening does not calculate a Preview.
Only Run saves its request, through the shared initial transaction described above.

Run prepares tokenizers outside the database permission, then captures both
inputs into connection-local temporary Tables in one read-only transaction.
Batches contain at most 256 documents. Matching appends scalar match fields to
temporary storage with explicit flush checks and cancellation between documents
and stages. After the snapshot finishes, the existing fresh publication
transaction claims the still-existing tab and publishes its complete result.
Failure or cancellation after the initial Run transition leaves no result; a deleted tab cannot be
recreated by publication.

New Runs use result version 2. Each input processes distinct exact non-NULL texts
independently. Its private documents Table contains processed text under its
original source field name and a result-local output key, including texts with
zero matches. The matches Table contains outputs keyed to that processed text;
a stable private projection joins only the owned processed-text/output relations.
Reads build the current-source join at query time by exact text equality, so stale
private schema bindings cannot prevent ordinary source renames or metadata edits. Source metadata values are not persisted. Duplicate current rows remain
separate. Newly added unprocessed texts and edited/removed texts do not match.

Page and density queries rebuild the typed source STRUCT from the current schema.
Presentation excludes empty match outcomes, filters before counting/sorting and
applies explicit source-row and within-document ordering before pagination.
Concordance document bands are calculated across the full filtered/sorted result.
Offsets remain Unicode character offsets in the processed original text.
Version-1 results continue to read their independent source snapshots.

Add to Project atomically copies processed text and selected generated outputs to
independently owned hidden backing relations and creates a live source-joined
View. It includes processed empty outcomes; document extraction is empty text for
those rows. Generated names cannot overwrite selected source fields. Publication
preserves source order independently of review sorting. Clearing, rerunning or
deleting the tab cannot change these copied outputs.

`project/document_matches.rs` owns publication ownership and its first-use native
format upgrade. Published Data Blocks own the backing relations and delete them
with the public View. Source-field bindings preserve current Arrow annotations,
including renamed output fields, without storing source metadata values. The graph
returns typed publication ownership from this registry. Private lookup edges participate in existing mutation
invalidation and schema rebinding, separately from ordinary Builder deletion
closures. Source deletion retains SQL references and raises the ordinary engine
error; compatible same-name restoration can resolve them. Native renames preserve
bindings through the existing rename owner.

`project/result_downloads.rs` captures all filtered/sorted rows through each
analysis owner, then reuses the bounded Arrow reader and native CSV/XLSX/JSON/
Parquet exporters. Selected fields flatten in presentation order. Document
omission is download-only and position fields require the document. Annotation
downloads reject an active source editor and unsaved review changes. Preview
exports receive only already completed Arrow rows and make no provider calls.
No permanent Data Block or second result store is created by downloading.


## Quotation Preview and saved results

`project/quotation.rs` owns the built-in English extractor adapter, saved queries
and publication. It reuses Concordance's document execution shape through
`project/document_matches.rs`: catalogue resolution, typed source capture,
bounded document reads, semantic metadata and Arrow page serialization. Each
analysis keeps its own native matcher and concrete result contract.

Preview validates the tab and input before preparing the pinned UDPipe model,
then captures a source page plus one lookahead row in a read-only transaction.
Only distinct exact texts in the requested page are extracted, then expanded to
that captured page's duplicate source rows. The lookahead and duplicate texts
outside that page cannot enter its output. Concordance Preview shares this native
page-population capture. Zero quotes yield no displayed row;
multiple quotes remain nested in their original document. Preview has request
cancellation and no persistent result or task record. Context clipping and field
visibility are frontend presentation changes, not extraction requests.

Run uses process-available native workers, bounded by the number of remaining
eight-text batches. Each worker constructs and owns its UDPipe extractor from
shared read-only model bytes. A single database writer
commits each completed eight-text batch with its checked-text records and matches
in one transaction. A Quotation-only version-1 checkpoint artifact records the
manifest, extraction identity, generation and checked/total counts. It stores no
task or source-metadata snapshot. Stop, failure and process exit preserve committed
batches. Explicit Resume requires the same submitted input and extractor/model
identity and excludes checked exact texts, including zero-quotation outcomes.
Opening a project never resumes extraction. Generation, tab claims and cancellation
prevent cleared or superseded workers from restoring outputs. The ordinary
Analysis result remains absent until completion; typed Quotation output and tab
summary projections expose partial state through existing artifact ownership.

Version-2 results use the same processed-text/current-source contract
as Concordance, with a separate checked-documents Table and scalar-quotation
Table. Zero-quotation texts are retained as processed records and excluded from
presentation. Document queries group quotations; match queries page individual
occurrences. Both apply SQL ordering before paging and direct downloads. Full-document details
also require the clicked exact text at its query-time source position, so a moved
or edited row reports a stale-detail error instead of fetching another document.
Publication includes checked empty outcomes and copies generated outputs into
independent backing relations for a live View. Historical version-1 results
remain snapshot-based until Rerun. The [quotation runtime reference](../../reference/quotation-runtime.md)
owns model provisioning and software notices.

## Native Plots

`project/plots.rs` implements Trends, Compare, Scatter, Heatmap and Sankey as
concrete Run-only analysis kinds. They use the same tab admission, accepted
analysis identity, cancellation, editor protection and atomic publication as the
text analyses. Preview is not part of Plots.

Each successful Run owns one typed snapshot Table with a result-local `row_id`
and nested `source` struct. The source is captured once in a read-only snapshot;
Arrow annotations are independently copied beneath `source`. The version-1
result describes the snapshot, original columns, provenance and usability counts.
The submitted request remains owned only by the analysis record.

DuckDB derives chart projections from this retained snapshot. Uncased grouping
therefore recomputes means and medians from observations, rather than combining
previous aggregates. Trends constructs a complete interval grid. Missing periods
have zero Count/Sum and null Mean/Median; an observed period with no usable
measurement remains null even for Sum. Integer/decimal interval arithmetic
avoids an intermediate double. Timezone-aware intervals use the host-provisioned,
signed ICU extension; plain calendar values retain their stored interpretation.

Publication selects original rows by saved identities or typed category,
interval and transition predicates. Sankey transition predicates form a union,
so overlapping selected transitions never duplicate a row. The output Table,
registration, copied annotations and applicable logical parent are committed in
one transaction. Published rows remain independent of analysis cleanup and of
subsequent changes to the original source.

Plots display budgets and measured browser/native evidence are documented in
[Plots display capacity](../../reference/plots-performance.md).

## Topic Modelling

`project/topic_modeling.rs` adapts the framework-independent `ldaca-rs` engine.
One or two inputs feed one joint fit, processing distinct exact texts within each
input. New version-2 outputs retain text plus generated dominant/coverage outputs
in private typed Tables. They retain the natural layout, projection hierarchy,
reduced vectors and assignment/settings artifacts under the existing analysis
owner. Full segment embeddings stay in the exact application cache. Source
metadata values are not persisted. The projection BLOB does not duplicate the
Tables' document outputs. Version-1 analyses retain snapshot semantics until Rerun.

PaCMAP 0.2.6 requires USearch's `fp16lib` feature, removed in USearch 2.25.
The engine pins USearch 2.23.0 because 2.24 also introduced an unguarded
`MAP_FAILED` reference that prevents Windows compilation. Revisit the pin when
[PaCMAP's dependency](https://github.com/beamform/pacmap-rs/blob/v0.2.6/Cargo.toml)
supports newer USearch releases; no vendored allocator patch is applied.

Map queries derive source multiplicity, dominant-document counts, shares and
compact metadata memberships from current rows with processed text records.
Counts include processed empty outcomes in the eligible population. Source
summaries use `document_count` for eligible source rows and `processed_text_count`
for distinct fitted texts; duplicate source rows do not create extra fitting units.
Metadata edits cannot change fitted assignments or coordinates. One-input Colour by offers
current scalar fields with 2–8 nonmissing groups, native ENUM order where present
and count order otherwise; missing values form a grey group. No positional joins
are used. Preview joins only its temporary sampled population, so matching rows
outside the sample cannot inflate counts.

Word queries apply presentation stopwords to retained c-TF-IDF rankings without
rerunning PaCMAP. Top-N publication uses positive coverage and cutoff ties. It
atomically copies chosen generated assignments into independent hidden relations
and creates live source-joined Views plus a dictionary. Published outputs survive
analysis cleanup. Source lookup failures retain their SQL references and ordinary
engine diagnostics.

`runtime/topic_preview.rs` owns a narrow connection-scoped Preview. Its POST SSE
response owns the in-memory model through a lease; query handles are valid only
while that connection lives. Count/percentage sampling is seeded without
replacement, followed by original-row ordering. No Analysis, artifact, registration
or saved request is written. Dropping the stream cancels work and releases the
model. Native computation remains tracked until cleanup, while a ready idle
model is not running work. Run waits for prior Preview cleanup before fitting.
Queries use existing runtime operations and expire with their owner. There is
no automatic reconnect, retraining, polling or persistent Preview cache.

`topic_modeling/adjustments.rs` replaces derived outputs in one transaction while
retaining processed texts and the original Run request. Historical version-1
results retain their captured rows and metadata. Clustering changes
reuse reduced vectors; representative-word changes reuse assignments. Exact
embedding-cache keys include the resolved model fingerprint and provider. Missing
intermediates or cached embeddings produce an ordinary Rerun error without
inference/backfill. Each replacement checks the previous natural-projection UUID
and claims the owning tab. Cancellation, failure, Clear, deletion and superseded
adjustments cannot recreate a result or overwrite a newer replacement. Runtime
operations cancel superseded work without adding task-history rows. Preview uses
the same stages in its existing connection owner and replaces its model only
after success. The client waits briefly after setting changes and keeps the last
valid chart while waiting or after failure.

Explicit Run remains repeatable and always captures current sources, segments,
reduces, clusters and summarises anew. Only exact token/embedding caches are
reused. Automatic segmentation packs neighbouring whole paragraphs within the
token budget, without cutting a paragraph to fill unused space. Oversized
paragraphs retain the existing sentence/word/token splitter.

Native HDBSCAN uses minimum size 10 and its default density settings. A finite
maximum must exceed 10; unlimited is the default. One parallel fit applies the
native cap, then version-4 retained hierarchy cuts skip merges that would exceed
it. Requested Topic count is a target, defaulting to the natural count. Queries
report the achieved count when the hierarchy cannot reach the target. Count-only
changes read the hierarchy without embeddings or clustering; maximum-size
adjustments reuse reduced vectors for one fit. Historical contexts retain their
original cuts, and historical analyses require Rerun before new stage adjustments.
No automatic clustering retry policy is exposed.

Encoder CPU threads, ordered document segmentation and each HDBSCAN pool use process-available parallelism,
bounded by a positive `LDACA_EMBEDDING_THREADS` host cap. This preserves affinity
and container CPU limits without initializing a global Rayon pool. CoreML and
DirectML remain preferred on their supported platforms, with CPU fallback.

Graph and lists share a derived search/lasso eligibility projection and matched
representative-word highlights. Selected cards remain visible when excluded and
follow selection recency. True dominant `-1` outliers have a grey footer with
source/group counts, shares and inspection, never synthetic map coordinates.
Processed empty outcomes are excluded from this footer. New live document pages
and downloads follow current source order; historical pages keep their old order.

Hosts provide the external embedding-cache path. Model preparation occurs outside
DB connections. Progress/cancellation callbacks occur between documents, batches
and stages; PaCMAP/HDBSCAN cannot be interrupted inside a stage. Both curated
models use local ONNX inference with model-resolved identity; on-demand model
assets are cached outside project databases. Clustering retains the full fit in
memory; bounded embedding batches do not impose a corpus limit or hidden sample.

Measured fitting, memory, cancellation and platform verification are recorded in
[Topic Modelling performance](../../reference/topic-modeling-performance.md).

## Annotation

Annotation owns a historical execution report, while labels remain in the source
Table. It shares ordinary table editing's protection, typed row references,
staged patches and Save/Cancel lifecycle. Manual Start saves its setup only after
opening an editor successfully. Opening a saved tab never opens an editor.

AI Run reserves the target Table before accepting the submitted request into a
new Analysis. It captures the Codebook and selected examples consistently, reads
eligible source references and distinct exact texts in temporary relations. Each
completed provider batch immediately commits successful labels atomically to only
its captured eligible source rows. Exact UTF-8 keys preserve duplicates independently
without sending their text repeatedly. Change notifications follow every commit.
A later fatal error, cancellation, process exit, Clear or tab deletion retains
those committed labels. New tabs default to missing labels; explicit saved All
choices remain. A failed individual prediction preserves its existing label; a
successful NULL prediction may clear one. Final publication stores only the
version-1 historical report, context and source-row diagnostics. Clear removes
only report/artifacts and never rewrites labels.

Preview reads a fresh page and performs fresh inference on every explicit page
action. It owns a cancellable runtime operation, no task or project records, and
no prediction cache. Its transient mutation stamp is checked after correction
editing acquires protection, preventing stale positional handoffs. Predictions
may be cleared while the shared correction editor retains its own patches.

Saved review queries read the current source and Codebook. Full-Table comparison
metrics and filters include staged patches while editing; Preview compares only
its document page. Captured inference context and failed-row diagnostics remain
historical and readable after source deletion. They are never reapplied to new
row positions.

### Host provider services

One injected `AiConfiguration` serves all runtimes on a host. Safe connection
metadata is separate from projects; remembered credentials use OS keyring
adapters, with application identity and connection UUID namespaces. Session-only
credentials live in memory. Blocking credential operations are serialized off
the UI thread. No secret is returned, serialized in requests/results or retained
in frontend query/mutation caches. Metadata-write failures restore the preceding
credential state where the OS store remains available.

OpenAI, OpenRouter, Anthropic, Google and Custom use the shared HTTP client with
provider-specific request/response adapters. Only document text, instructions,
Codebook and selected examples are sent. A single retry owner handles transient
failures; malformed/context-limited responses split down to individual documents.
Authentication/configuration failures abort the operation. Ambiguous read
timeouts are not retried automatically. Discovery is cached by connection ID and
revision; predictions are never cached. Concurrency is 1–32 remotely, defaults
to two for Custom and ten for other remote connections, and is remembered in that
connection's safe metadata. Apple uses one request. Provider-native thinking
controls are explicit tagged request values; unknown models omit thinking fields.
The former shared reasoning scale is retained only for historical decoding and
requires an explicit new choice before rerunning. Custom sends standard Chat
Completions fields only. Provider HTTP bodies and transport diagnostics remain
available in the responsible form/task error; timeouts are fatal without retry.

On macOS, the built-in Apple connection uses a small Swift bridge to
`FoundationModels`, weak-linked for older systems. Availability is checked at
runtime; the framework requires macOS 26+, eligible hardware, enabled Apple
Intelligence and a ready model. Each batch has a fresh `LanguageModelSession`
and a guided dynamic schema containing exactly one optional Codebook label per
document. Rust retains the Swift operation through cancellation and cleanup.
No credential, subprocess, local HTTP server or cloud fallback is involved.
Apple's `fm` command is a macOS 27 addition; the framework integration also
supports macOS 26 APIs. See Apple's [system model documentation](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel),
[guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation)
and [fm introduction](https://developer.apple.com/videos/play/wwdc2026/334/).

See [Annotation verification and performance](../../reference/annotation-performance.md)
for measured batch memory, database timings, live Apple smoke evidence and
outstanding platform/visual checks.

## Execution modules and restoration

Concrete Frequency, Concordance, Quotation, Plot and import workflows live in `project/runtime/*_execution.rs` and `imports_execution.rs`, implementing the same `ProjectRuntime` as Topic and Annotation. Admission, independent connections, cancellation, leases and close completion remain together in `runtime.rs`. Publication still occurs through the existing database transaction; no service hierarchy or generic analysis pipeline is introduced.

`analyses/restoration.rs` derives `request_status` beside original request JSON, and `setup_status` beside manual settings. Deserialization uses the execution DTOs and their defaults and unknown-field policy, without writes or live source/model resolution. An unsupported shape remains inspectable. This metadata does not certify execution availability or numeric parameter validity; ordinary execution validation remains authoritative.


## Frequency direction and Concordance presentation metadata

New Frequency comparison Views calculate Study against Reference while keeping wire corpus columns in Reference/Study order. `study_against_reference` records that meaning; absent flags decode as historical direction. Existing saved Views remain unchanged. Reference-zero percentage difference is NULL for new results. Corpus projections derive per-million values from the immutable full token denominator, before presentation filtering or limits.

Saved Concordance match projections calculate contiguous `document_band` values after whole-result filtering and sorting and before pagination. The Arrow scalar stays outside the retained source STRUCT. Publication continues to use original document/match order and never publishes this presentation field.
