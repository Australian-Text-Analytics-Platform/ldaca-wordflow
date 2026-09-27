# Frontend Overview

The React 19, Vite, and TypeScript application renders the same project interface
in Tauri, the browser preview and the packaged server. `src/index.tsx` loads
`features/server/ServerApp` when the host injects deployment configuration,
otherwise `features/desktop/DesktopApp`. There is no backend selector. Tauri discovers the owning window's backend through IPC. Browser
requests use the current origin, with Vite proxying project and health routes
to the standalone Rust backend during development.

## Current Boundaries

- `features/desktop/DesktopApp` owns backend discovery and readiness. A transient
  failure preserves an already-mounted project interface.
- `features/project/ProjectApp` owns the window-local QueryClient, error boundary,
  dialogs and Sonner notifications. `DocumentSession` observes project metadata
  and owns the active section shared by the sidebar and titlebar breadcrumb.
  The breadcrumb reads the active tool's analysis tab ID from window-local state and
  its saved name from the existing query cache, without fetching tabs itself.
  Tauri owns desktop document opening, saving and closing. The standalone host
  exposes server-only file/project controls; its session UUID scopes queries and
  local drafts. See [server ownership](../backend/server.md).
- Rust DTOs and annotated handlers own the HTTP contracts;
  `api/generated/native.ts` contains their generated TypeScript declarations.
  `features/project/api.ts` retains transport, generated aliases and narrow
  feature adapters. The generated FastAPI client remains archived.
  See [contract generation](../../reference/native-project-api.md#contract-generation).
- `features/project/ProjectView`, `ProjectGraph` and `NativeDataView` connect
  DuckDB operations to the existing sidebar, graph and table presentation.
  Shared graph, table and input components live under `features/project/`, with
  visual primitives under `components/`. Retired FastAPI wrappers are under `archive/frontend/`.
- `features/tools/` owns the sidebar tools and shared input controls.
  `toolIds.ts` supplies ordered stable `ToolId` values; `toolRegistry.ts` derives
  definitions from that list and an exhaustive typed label/icon lookup. Navigation state, sidebar selectors and transient
  input-routing fields use tool terminology. SQL Views and Data View previews
  keep their separate database and presentation meanings.
- `features/tools/preprocessing` connects the retained forms to pure DuckDB SQL
  builders and the project connection. See [preprocessing](preprocessing.md).
- `features/table-editing` owns paginated editing state and cell controls,
  independently of the dialog which presents them.
- `lib/arrow/` owns Arrow decoding and exact physical/semantic type inspection.
- `features/project/projectQueries.ts` defines the shared schema query for Data
  View, Preprocessing, Frequency and stopword inputs. Both target forms use one
  schema/name cache key and the same object invalidation metadata. Column edits
  use the table controller's single mutation owner; `NativeDataView` forwards the
  captured request and reconciles its local column preferences after success.
  Committed object changes invalidate open schema/page queries. Schema and page
  fetch errors use the shared Sonner observer, without an inline table banner.
  Datetime conversion submits immediately; only `datetime_format_required` opens
  the manual-format dialog. Failed manual submissions retain the entered format.
- TanStack Query owns database state. Zustand owns graph selection, the displayed preview, pins, positions
  and other interaction state. Local forms own unsubmitted input.
- `features/theme/` owns the live VS Code theme. `public/theme-bootstrap.js`
  reads the renderer's local preference before React starts. The offline theme
  generator owns the generated CSS.
- `src-tauri/` owns independent project windows, embedded backend tasks, native
  menus/dialogs and the shared application updater.

Data Loader provides Local files, Samples and LDaCA tabs inside the main pane.
Source drafts survive navigation while the project stays open. Its import and
drop ownership is described in [desktop architecture](desktop.md).

Saved-output loading or rendering errors change the request action from **Run** to
**Rerun**. The shared recovery hook derives read failures from active TanStack
queries for the current result; render failures are local to an output error
boundary, leaving request controls usable. **Retry** rereads the same result,
whereas **Rerun** submits the current draft through the ordinary Run endpoint.
Recovery neither runs automatically nor writes a persisted error flag. Preview,
input and unrelated-tab query failures do not change the Run label.

Frequency, Concordance, Quotation and the five Plots modes use native tasks and project-owned saved results;
other analysis execution remains unavailable. The Data Loader, Preprocessing,
Frequency, Concordance, Quotation, graph and paginated Data
View retain their established three-column presentation; desktop has no server
project catalogue, authentication, Data Root or managed-file bootstrap.
The normal split gives the tool 70% and graph 30% of the space after the sidebar.
The split persists locally. Pointer and keyboard resizing, restored layouts and
window resizing share the graph's 800px cap; resizing the window constrains the
effective ratio without overwriting the user's preferred ratio. Double-clicking
the separator or pressing Enter/Space resets to the configured default.
The graph canvas always fills the right column. Dagre arranges the graph
from top to bottom, with connections leaving the bottom of each card and
entering the top of its children. Independent roots share the top rank.
Graph selection and the displayed preview are independent. A graph card's **Preview data**
button toggles its preview: it opens when closed, closes when that same Data Block
is displayed, and switches directly when a different Data Block is displayed. The
button's pressed state identifies the displayed block. Selecting a sidebar row
also shows its data; deselecting leaves the preview unchanged. Graph clicks and
double-click input addition do not open previews. Creating, cloning, or importing
Data Blocks leaves selection and the current preview unchanged.
`features/project/previewState` owns one nullable preview target per window.
Explicit `{schema, name}` references identify database objects; logical Data Block
names address their registration in `data`. Table preferences and cache
identities use schema/name tuples to avoid collisions. There
is no preview tab list or ordering. Rename and deletion reconcile the preview
alongside selection; per-node page, sorting and column preferences survive switches.
`features/project/graphState` owns the window-local logical/dependency mode,
separate canvas positions and viewports, and dependency selection. Normal mode
combines calculated SQL dependencies and stored virtual links for visible Data
Blocks; dependency mode shows only calculated SQL references. Both use directed
arrows anchored to React Flow's visible source Handles on card borders. Edge hit
paths use an explicit transparent stroke so WebKit honours React Flow's wider
interaction area at compact zoom. Card toolbars sit above the node;
mouse departure hides them unless keyboard focus or an open action menu owns the interaction.
Node menus add logical parents/children by clicking another card; a temporary
dashed line follows the pointer. Selected SQL edges highlight with a contextual instruction.
React Flow's source-only reconnect hit area remains invisible, leaving one visible port per card;
its native connection line follows the pointer during dragging.
Both interaction modes support keyboard picking and Escape cancellation. The sidebar's
selection and preprocessing inputs remain logical-only. **Show Dependencies** loads
a separate TanStack Query entry beneath the shared graph prefix; invalidation
refreshes mounted projections and marks inactive ones stale. Each mode restores its
canvas on return, while the shared preview remains open, including hidden objects.
A preview absent from the logical graph keeps catalogue inspection active for its
object metadata. Graph membership never prunes another mode's interaction state;
full catalogue inspection prunes table preferences only for missing objects.

The table slides up over the graph's lower portion at the previous resizable height. The graph card shares the other columns’ bottom
inset. Resizing uses the sidebar’s line handle over the viewer’s top edge, without
a separate gutter.
The eye toggle or the header's **Close preview** button slides it back down before
removing it. The exit animation holds its offscreen final frame until unmount,
preventing a one-frame return to the open position. Switching Data Blocks keeps the overlay open. Neither the
animation nor resizing moves the graph viewport or nodes. Reduced-motion
preferences disable both slides. Node cards grow with their visible content.
The fixed graph container clips overflow without becoming a programmatically
scrollable container, so focusing the animated resize handle cannot shift cards
away from a hovering pointer.

Application-owned source, selectors, help anchors and disposable preference keys
use Project terminology. The archived FastAPI boundary keeps its generated
Workspace contracts and wire fields. Archived sources and pnpm/Cargo workspace
terminology remain unchanged. This naming cutover has no preference migration or
old-path forwarding modules.

React Compiler handles routine memoization. Identity-sensitive React Flow,
table and external-library boundaries retain the stability they require.
Graph positions stay subscribed within the canvas. Frequency query selectors
retain decoded rows; corpus and Juxtorpus components derive chart inputs from
those stable projections. Chart layout responds to data, colour and size changes,
independently of event handlers and SVG export registration. Graph interaction,
task status and unrelated result controls leave the current drawing intact.
Resizable panes use intrinsic wrapping and container queries; viewport
breakpoints are reserved for viewport-owned surfaces such as dialogs.

## Frequency

The named `EditorTabs` strip stays fixed at the top of the Frequency pane. One
content `ScrollArea` contains the **Token Frequency Analysis** request card and
**Token Frequency Results** card, stacked in the historical layout. The cards
remain available while loading or without a result; they are not a second set of
Request/Results tabs. Their compact headings carry contextual help without a
separate oversized feature heading. Closing a named tab with its × deletes that
analysis through the existing API, including cancellation of its active task;
there is no separate Delete analysis button.

Frequency tabs and their latest successful result are server state owned by
TanStack Query. A tab stores its name, order, corpus colours and stopword
source/column/enabled selection. Window-local Zustand state owns unrun
input/column/tokenizer edits, the active tab and browsing settings: token filter,
cloud/list mode, limits and statistics sorting/page size. Browsing settings survive
tab/tool navigation but reset on reload; scroll position is not retained. Browsing
never writes preferences, and remains available during table editing. Serialized
preference mutations overlay pending choices without replacing committed query
state; failure reveals the saved values. Opening Frequency
automatically creates one saved tab when none exist, after a successful tab-list
load and once table editing has finished. This check runs once per visit:
closing the last tab leaves the empty state, where **New Frequency analysis**
creates a tab explicitly. Leaving and returning checks for an initial tab again.
A keyed creation mutation avoids
duplicates during Strict Mode or a pending remount; failed creation requires an
explicit Retry. Hidden panels do not create tabs. The tab strip's + action creates
additional analyses. Default names use the first available **Frequency 1**,
**Frequency 2**, etc.; existing and custom names remain unchanged. Reopening a saved tab initializes its draft from the last accepted Run
request from the child analysis. A run completing must not overwrite edits made after submission.

Run captures the ordered sources, corpus roles, columns and tokenizers. Native
task snapshots associate active work with its analysis tab, so panel unmounting
and webview reload cannot lose running ownership. One run per tab is permitted;
independent tabs remain usable. Parameters can be edited during a run. An accepted Run saves its request and
clears previous output before calculation; failure or cancellation after that
transaction leaves no completed result. Results are marked when they describe
different submitted parameters from the current draft.

Saved tab requests cross the frontend boundary as `unknown`. The shared
`common/analysisRequest` decoder restores supported fields independently, using
concrete per-analysis defaults and constraints. Unknown fields and invalid values
produce path/value issues; the shared warning above the actions retains the
original JSON for inspection. Missing required inputs stay unselected, and saved
source, column and tokenizer references are not replaced based on availability.
Local drafts take precedence over decoded saved settings. Opening, editing,
Preview and Clear never rewrite the saved request or dismiss its compatibility
issues. An accepted Run saves only the supported captured request through the
existing backend transaction. Partial restoration enables **Rerun** when a saved
result exists, subject to normal admission controls. Equality uses the same
reader and never treats an incompatible request as fully recognized. This is
request restoration, not project migration or repair of saved result artifacts.

Frequency, Concordance and Quotation disable Run when the captured execution
request matches the completed analysis request, using the tab's derived summary
while its manifest loads. Changing and reverting execution parameters changes
availability directly; presentation preferences never affect this comparison.
Saved-output errors enable Rerun, while a successful Retry restores the comparison.
Editor protection, valid-input checks and active-task blocking still apply.
Clear results cancels pending saved-result reads before deletion, retains the
request and re-enables Run. Source changes alone do not
unlock it: to calculate unchanged settings against changed data, use Clear results
then Run. No separate dirty flag or backend admission rule is involved.

Ranked lists, word clouds, Juxtorpus and keyword statistics query immutable saved
results with concrete filters and bounded pages. Ranked lists expose one continuous
scroll range with TanStack Virtual. TanStack Query retains the first 200-row chunk
for the matching total and maximum count, then fetches the chunks intersecting the
visible rows and overscan. Bar widths always use that first chunk's maximum;
scrolling never rescales them. Filter and list-limit changes reset the list's scroll
position. Paired lists synchronize rank offsets, not scroll percentages, even
when their vocabulary sizes differ. There are no visible pagination controls for ranked lists. Statistics use
bounded pages through the entire filtered vocabulary, defaulting to descending LL;
filter, sort and page-size changes reset their page. Header tooltips describe the
measures. Large finite statistics use scientific notation without changing stored
values. Juxtorpus restores its compact gradient legend with focusable corpus names.
Colour controls live on input cards. Preferences key colours by the schema/name
tuple, rather than role; legacy positional colours are resolved against the saved
run before rerunning. Rename adds the new name while retaining the old key for
immutable results.
Stopwords and display limits are
presentation choices, not execution inputs; filters precede limits and leave
native corpus totals unchanged. Counts preserve Arrow integer precision. The window's project-event observer refreshes queries from committed change
scopes, independently of task completion. `projectChanges.ts` matches each query's
explicit live object dependencies against affected sources and their SQL
dependants; immutable result provenance is excluded. Reconnection refreshes
broadly. See [commit notifications](../backend/native-projects.md#commit-notifications-and-refresh). Viewing results neither opens a Data
View preview nor changes graph selection.

### Shared stopword Data Blocks

`common/stopwords` owns the reusable stopword selector and live word-list editor; `common/language` owns presets and sampled recommendations.
The selector reuses `NodeInputsPanel` with one selected card, the shared searchable
Add control, unrestricted column choices and remove/clear actions. Once Frequency
results expose this second input area, graph/sidebar additions remain carried
until placed into either the corpus or stopword panel.
Frequency selects one Data Block and column for all its corpora. Analysis-tab
preferences persist `stopwordSource: {source: {schema, name}, column}` and
`stopwordsEnabled`, never the words themselves. Legacy arrays are ignored.
Any Table/View column can supply words. The backend read operation casts values to VARCHAR,
trims and lowercases them, drops NULL/blank values and deduplicates them in first
occurrence order. A row number captured before grouping preserves the source's
row order in the preview and editor bubbles. More
than 100,000 effective words fails explicitly. Stored cells are never normalized
in place merely by reading the list.

The query lives under the existing `rows` cache prefix so Table saves, SQL edits
and task reconnection refresh all analyses using a list. Enabled lists that are
pending or unavailable retain the previous display with an outdated message and
block exports. Projection/export requests contain the selected source and column;
the backend reads the words in its transaction. Frontend word queries serve the
editor, count/preview and captured chart exports, not table-filter payloads. List changes reset ranked scrolling but never
rerun tokenization or replace saved artifacts.

Creation submits captured inputs to the backend preparation operation, which owns
the Table, registration, unique name and additional logical links in one transaction. Names use
`<first-input>_stopwords` with numeric suffixes; an input-free list uses
`analysis_stopwords`. Edit words on a View first copies its selected column into a new
one-column Table, preserving the column's name/type and recording the original
View as another logical parent. The copy remains selected after closing the editor.
Existing Table selections do not change logical edges, graph selection or the
shared preview. The ordinary Table editor remains available from the node menu;
the stopword panel only opens its word-list editor.

The word-list editor reads live bubbles from the ordinary stopword query in Table order. Enter/comma, delimited paste, individual removal, confirmed Clear and preset additions commit immediately through the existing membership operation. Only unfinished entry text and preset choices are local. Close leaves successful changes in place; failed writes retain unsubmitted text and use the existing error owner. Sort reorders complete database rows rather than just rearranging bubbles. Sampled language recommendations remain first without replacing manual language choices.

Membership deltas preserve unchanged values and unrelated columns. Additions supply only the selected column; removals delete single-column rows or clear that cell in multi-column Tables. DuckDB enforces types, defaults and constraints. Context-menu additions send only the new token through the same writable-target preparation. Application-driven object and column renames
reconcile saved references in the same mutation transaction; deletion leaves an
unresolved selection until replacement or Disconnect. Disabling filtering retains
the selected list, while Disconnect leaves its data untouched.

The tokenizer catalogue comes from the native library. MediaPipe samples selected
text through cancellable read-only requests and performs language detection
locally using checksum-verified model and WASM assets downloaded on first use. Recommendations are advisory and
never overwrite an explicit model selection. Hidden tools defer sampling;
recommendations remain cached until the source is invalidated (and while retained
by TanStack Query). Detection failure preserves manual
selection; local source documents are not sent to a language service. Bundled
stopword lists remain available offline. These reads create no task summaries.

Frequency, Concordance and Plots use `common/components/DownloadControl` for the
chart download icon and PNG/SVG/JPEG format dialog. Callers capture their own
chart and export context; the dialog only owns format choice and pending state.
Cancelled or failed saves retain the dialog, and duplicate submissions are blocked.
Frequency additionally supplies stopword ZIP options and table formats.

Exports capture the current result ID and presentation choices. Table exports
read current stopwords in the backend; their optional word-list text comes from
the same read. Charts retain the displayed drawing and its corresponding words. Native chooser
and final-file installation use the existing export ownership; browser downloads
remain supported. Concordance receives a captured whole-word Text Preview when a token is clicked. Other unavailable tools receive no automatic
word-click navigation. See [native analyses](../backend/native-analyses.md) for
artifact lifetime, database permissions and transactional publication.

## Settings and Documentation

`features/diagnostics/sessionErrors.ts` owns the latest 200 error occurrences in
window-local Zustand state, without persistence. `reportProjectError` records an
error once before rendering its expandable Sonner notification; toggling details
does not record another occurrence. The task observer records accepted failures
with their task ID, while the request error path continues deferring to it.
React error boundaries and global exception/rejection listeners use the same
record store without adding another notification. Each occurrence has a timestamp,
source, title, message, diagnostic details and available JavaScript stack; stored
text fields are bounded to 16 KiB each. Notifications show the error message
immediately. Expanded details and the history retain the Rust error payload
(including its code and statement index), HTTP method, API path and status when
available. Network failures identify the request and absence of an HTTP response.
Request bodies and headers are not recorded. Accepted task errors retain their
native diagnostic and task ID without fabricating HTTP context or a Rust backtrace.
Settings exposes a diagnostics disclosure with copy and clear controls. Reload
clears the history. This store is a diagnostic record, not a task or query cache.
Build's SQL-to-bubble parsing errors belong to
its inline draft feedback and do not also produce a toast.

Browser/native E2E instrumentation subscribes to this same store and streams
records to a runner-owned loopback collector. It is absent from ordinary builds.
The runner retains errors independently of toast dismissal, history clearing and
reload. See the [test procedure](../../runbooks/test-suites.md#session-error-checks)
for expected-failure assertions and output artifacts.

The [native settings reference](../../reference/native-backend.md#application-settings)
identifies the active updater and renderer stores. No settings file selects a
backend implementation or persists an HTTP backend URL.

`src/tutorials/` and `public/` own bundled help and documentation. The optional
`VITE_DOCS_ORIGIN` provides an online update channel with a bundled fallback.
The shared `DocumentView` maps Markdown typography and inline icons to the live
VS Code theme colors, including headings, links, code and tables.
`VITE_DEPLOYMENT_ID` supplies the Feedback deployment label. Feedback captures
the actual invoking feature once when opened and preserves anonymous survey fields;
there is no persisted current-view value or authenticated-user override. Help
target mappings come directly from the bundled registry. Only document content
uses the optional remote channel; no remote registry overlay or store is loaded.

The old server entrypoint and runtime-configuration script are archived under
`archive/frontend/`. Unmigrated analysis and server-controller source, its exclusive tests and utilities
are archived for reference. The production source graph starts at desktop,
updater and Quick Look entries; test-only imports cannot keep retired code active.
`pnpm -C frontend knip` checks both production reachability and unused exports/
dependencies. Settings own their dialog explicitly; Feedback has no auth wrapper.
`TablePaginationFooter` and `useDataTable` serve the active table surfaces. See the
[retired frontend architecture](../../../archive/docs/architecture/frontend/overview.md)
for its former providers and generated-client flow, and
[desktop architecture](desktop.md) for the current native lifecycle.


## Concordance

`features/tools/concordance/` restores the named Request/Results workflow using
the native analysis-tab and result interfaces. Entering the tool creates its first
numbered tab only when none exists; closing the last tab leaves the empty state.
TanStack Query owns tab records, saved manifests and bounded projections.
`concordanceState.ts` owns active tabs, unrun drafts and the one-time Frequency
handoff. `common/useAnalysisPreview` consumes that handoff into component-local
submitted settings. Switching tabs, leaving the tool, reloading, Run or Clear
aborts and removes Preview pages. It never writes preferences or restores a Preview.
The read-only tab `request` initializes the form after reopening; newer local drafts
win and are never overwritten by completion. Run saves that request and clears the
old result before computation. Clear retains the draft and saved Run request.

All three restored tools use `common/components/AnalysisProgress` below parameters.
It displays the existing native task authority, supplied stages/fractions, elapsed
time and Cancel. There is no extra polling or busy store. Submission and initial
manifest/projection loading use the same card; loading errors offer Retry. Initial
Preview uses this card without entering task history; subsequent page refreshes
retain the existing Preview. Empty tabs render no output card; completed zero-match
output still renders its normal empty message. Headings are Preview or Results.
Actions are Run, Clear results, Preview (Frequency omits Preview). Accepted task
notifications remain owned by the window observer.

Paging and metadata sorting use the
last submitted settings. Query keys include the source, submitted search and page;
dependency-aware change metadata refreshes affected active previews and leaves
inactive queries stale. Graph movement and display controls do not request matches.
A failed refresh retains the previous page with an outdated indication.

Saved queries use immutable result IDs. Inactive tools retain cached manifests but
do not fetch them during broad invalidation; returning to the tool resolves the
current tab's result. The Results owner fetches exact-case,
100-bin whole-result density per source only while saved Dispersion is active.
Display bin counts divide 100, so chart resolution and Uncased grouping are local
projections. Preview derives density from its already returned document page.
One derived term model supplies consistent labels, colors and counts to document
markers, legends, charts and exports. The right-aligned Separated/Combined tabs
control local source layout. Combined interleaves the cached source pages and
aggregates their density arrays in React; no Combined flag or merge request goes
to the backend, and the layout choice does not write tab preferences. Combined
waits for all source densities. Switching layout resets paging and sorting;
unchanged pages and densities reuse their existing cache entries. A different
saved Dispersion bin selection still queries the affected source projections,
so filtering happens before pagination rather than on a partial browser page.

Only saved Dispersion sends term/bin filters to queries and publication. Preview
and KWIC Table ignore those filters; returning to Dispersion restores them. Term
visibility is shared across sources, while bins are source-specific or Combined.
A replacement result clears transient filters. Shared proportional, bin and chart
controls belong to Results; the scoped ECharts boundary owns zoom and keyboard
position. Proportional document widths hide the density chart, not its legend.
The shared row-detail controller handles cross-page inspection. Unicode
code-point offsets are converted before highlighting.

Source colors and Table/Dispersion preferences belong to the analysis tab. Local
state owns Separated/Combined layout, pagination, selection and chart interactions. Frequency token clicks
create a new Concordance tab with all saved inputs in their original order, capture
its temporary whole-word Text Preview request and submit it for each source. Individual clouds and ranked lists
retain both corpora when the saved Frequency run has two inputs; right-click
remains a stopword action. Shared tokenizer,
language recommendation, generated-byte download and error ownership components
are reused by both tools.


## Quotation

`features/tools/quotation/` provides one input and separate Request/Results cards
inside the named-tab shell. Concordance and Quotation share `Tabs`, the
window-local analysis draft-store factory, temporary Preview lifecycle, preference updates, value formatting
and the row-detail navigation controller. Calculation, result contracts and
presentation remain feature-owned; there is no generic analysis plugin system.

Quotation follows the same create-on-entry rule and Preview ownership
as Concordance. Explicit Preview captures the input; pagination and source-column
sorting use that captured request. Query change metadata names its source, so
unrelated graph movement and mutations do not rerun extraction. Cancel aborts only
Preview requests or explicitly cancels the tab's accepted task. Failed refreshes
retain the previous page with an outdated indication.

The Results card follows the shared one-way Preview-to-saved transition for each execution request. Context
length (0–2000 words per side), source color and visible fields are presentation
preferences. Changing them reuses returned quotations. Underlines distinguish
quote, speaker and reporting verb from the source color, and Unicode character
offsets are converted before clipping/highlighting. Full-document inspection
supports previous/next navigation. Saved results can page by documents or matches
and publish either as independently owned Data Blocks through a captured-result
dialog. The built-in English extractor is the only active engine.

## Shared analysis presentation

Concordance and Quotation use bounded, sticky-header row tables with whole-row inspection that respects text selection and embedded controls. Preview L1/R1 and offsets are available in Concordance; global neighbor frequencies remain saved-only. Metadata is grouped by shared and source-specific fields, and Combined rows carry source labels and tints. Preview summaries distinguish inspected documents from matching documents and occurrences. Publication uses one menu with the existing two output modes.

The Results header contains presentation tabs: Table/Dispersion for Concordance and Documents/Quotations for Quotation, with Documents selected by default. Preview and saved results have no manual switch; the latest submitted Preview or successful Run determines the displayed data. Metadata controls open bounded, dismissible popovers and retain column selections when closed. Quotation's presentation tabs are available in both modes. Preview expands its returned document page locally without another extraction request; saved projections page the selected unit. Inline role labels and type badges retain quotation identity through overlapping spans and Unicode offsets. Source metadata and generated fields have independent selection shortcuts.

Shared execution actions explain blocked activation through Sonner. Numeric controls commit valid integers on blur/Enter and revert invalid entries with one reminder. Frequency retains independent display limits and continuous lists, with original filtered ranks, a clear-filter shortcut, matching counts, and exact counts in accessible cloud descriptions.

## Analysis schema boundary

Tabs expose settings and a derived nullable analysis summary; requests are decoded
from `tab.analysis.request` as unknown JSON. There is no legacy request fallback.
Local drafts remain keyed by stable tab identity. Saved manifests and projections
use analysis IDs, and visible Results requires `analysis.has_result`, not just an ID.
A failed/cancelled analysis restores its request without displaying output or
blocking Run. Clear retains the request and compatibility warnings.

The existing change observer cancels obsolete reads, reconciles affected tab
summaries and removes cleared/replaced output caches before refreshing affected
analysis IDs. Unrelated saved projections remain untouched. Delayed Run responses
do not seed output caches; the current summary determines what can be displayed.
The shared `savedAnalysis` query checks current tab ownership before and after
each manifest read. A matching analysis with `result: null` is a valid no-output
state, including when Clear overtakes an earlier refresh. It reconciles the tab's
`has_result` summary and cancels/removes obsolete projection reads. Successful
Clear also cancels stale tab reads and removes the owned output cache immediately;
a failed Clear retains existing output and resumes interrupted reads. Refresh
resolves manifests before their dependent projections to avoid reading cleared
artifacts. Neither path replaces the saved request
or local draft. Unsupported versions and loading errors for current output still
use the normal Retry/Rerun and error-notification path.
Rename, reorder and settings responses update only their own fields, preserving
newer ownership summaries. Task summaries use `tab_id` and remain the sole running
state authority; no polling or persistent busy flag is introduced.

## Plots

The sidebar's Plots tool contains Trends, Compare, Scatter, Heatmap and Sankey
mode tabs. Each mode uses the shared numbered analysis-tab shell and owns its
own window-local drafts. Entering an empty mode creates its first tab; closing
the last tab leaves the empty state until a later entry. All modes share the
Run-only request compatibility, availability, progress and recovery lifecycle.

TanStack Query owns saved manifests and DuckDB projections keyed by immutable
analysis identity, Uncased and minimum group size. Source movement and graph
selection do not invalidate saved projections. Local state owns hidden groups,
selection and zoom; tab settings own presentation preferences. Uncased clears
category-specific selections and hidden groups while preserving row/interval
identities. Projection refresh retains the displayed chart with an outdated
indication and disables export/publication until resolved.

`features/tools/plots` keeps concrete mode parameters and chart construction
separate from the shared ECharts lifecycle and original-row publication dialog.
Percent normalization, style, ordering, smoothing, Calendar year and visibility
are local projections of fetched chart values. Hidden groups remain in the
normalization denominator. Series use stable category identities so hiding a
group preserves the other lines, markers and colors without remounting the chart.
Time axes use native overlap suppression and interval-sensitive labels; theme
application preserves axis label settings. Calendar years restrict the viewport
only. Each group uses the same complete intersecting months, computed before
manual hiding. Outer padding days stay blank. Bounded cells, horizontal overflow
and separately allocated wrapped titles keep short ranges readable. Calendars form a
responsive grid with one shared inspected date. Pointer and day/week keyboard
inspection show card-local values, distinguishing zeros, missing measurements
and padding; inspection does not change selection or fetch projections.
Continuous-axis Trends markers hide when projected spacing is below 12 pixels,
while selected/inspected points remain available. Resizing and zoom recompute
marker visibility without removing observations. Only the chart region scrolls;
the surrounding pane and controls retain their available width. Export
renders a captured option offscreen with interactive zoom controls and tooltips hidden, retaining zoom and selection together with source, measure,
interval/timezone and legend context, using the shared PNG/SVG/JPEG saving flow.

Plots categorical axes retain complete wrapped labels. Compare orientation is a
saved presentation preference, initially horizontal for long labels; its category
zoom axis follows orientation. Heatmap owns both category zoom axes and uses
selection outlines so quantitative cell colors remain unchanged. Scatter bubble
area uses a scale derived before legend hiding. Sankey stage headings/tooltips use
request column names and share category colors across stages. These presentation
changes do not alter projection queries or saved results.

The shared plot wrapper owns mutually exclusive selection/rectangle-zoom gestures,
Ctrl-wheel zoom and empty-viewport recovery. Axis orientation changes reset zoom;
ordinary selection, visibility and theme redraws preserve it. `plotContext` builds
mode-specific export descriptions and captured publication summaries from the
existing request, projection and local selection. Disjoint projections provide
exact row counts; Sankey does not infer a distinct-row count by summing overlapping
transitions. Publication keeps its existing backend authority and transactional
ownership. All-hidden charts offer an explicit legend reset.

## Topic Modelling

`features/tools/topic-modeling` uses the same named-tab shell, compatibility
request decoder, task progress and recovery as the other restored analyses.
The execution draft has one tokenizer value reflected by both input selectors.
Sampling choices belong to a separate window-local tab draft and are captured
with the form only when the Preview dialog is confirmed. Run never reads them.

TanStack Query owns saved map/word projections; the SSE connection owns temporary
native Preview state. Leaving the tab aborts that stream and removes Preview
queries. Source dependency changes mark it outdated without automatic refitting.
Stopword dependencies invalidate only the word projection. Both projections must
resolve coherently before exporting or publishing; previous charts stay visible
and marked outdated on failure. Top-N counts use compact membership activations
locally, keeping map positions and interaction state stable.

Each topic exposes read-only **View documents** in saved and sampled results.
The dialog starts at 20 rows with no optional metadata, pages by coverage and
uses the same positive Top-N rule as publication. Closing/navigation cancels
inspector reads. Topic-count changes close it; Top-N changes reopen its first
page. Only a requested Arrow page crosses the HTTP boundary.

The React Flow map waits for measured nodes before fitting. Label collision
handling prioritizes hovered/selected topics; all topics remain in the list.
Map exports include a Topic ID/words/count key. The map uses uniform coordinate scaling, area-based membership bubbles
and invisible minimum hit targets. Exact selected topics control publication;
additive lasso and word search filter only the list. Count changes reset model
interactions, while Top-N changes preserve them. Downloads use the common icon,
format dialog and generated-byte pipeline, adding sampled/full scope and an
optional complete representative-word CSV ZIP. Publication is saved-only and
captures its applied projection/words/selection before opening the source dialog.

## Annotation state

`features/tools/annotation` shares a window-local source/Codebook draft between
Manual and AI modes. The latest successful Manual Start or accepted AI Run
initializes shared setup; the AI request independently restores inference controls.
The shared compatibility decoder restores supported values without rewriting saved
JSON. Newer local edits win over late responses.

Manual and correction editing reuse `useTableEditing`, including its single patch
map, navigation guard and Save/Cancel ownership. A Preview correction editor uses
captured typed row references, rather than fetching a second positional page.
Clearing predictions does not destroy that editor. Comparison and metadata roles
are disjoint; selected comparisons start masked. `ReviewViewport` shares a
window-local adjustable table height across Manual and AI review.

`useAnnotationPreview` performs fresh, abortable requests only for explicit Preview
or page actions. Dependency markers carry invalidation metadata, never predictions.
Relevant changes mark the displayed page outdated without another provider call.
Navigation discards the Preview. Run, report loading and recovery use the existing
task/query observers; only the window observer reports task errors and partial/skip
notices. Saved row queries deliberately follow the live source and Codebook, while
report/context queries remain immutable.

`features/ai/ProviderSelector` discovers host connections/models, supports manual
model names, and edits safe connection metadata. Credential submissions use a
direct transient action, avoiding retention in TanStack mutation caches. The Apple
connection is supplied by the macOS host and requires no saved key or endpoint.

## Export

`features/tools/export/ExportFeature` owns window-local choices for Data files and
Wordflow project modes. The shared searchable input panel supplies remove, Clear,
carried-input placement and optional Add all for the current search. The default
scope is visible Data Blocks; hidden and other user-schema objects are explicit.
Use graph selection adds the current graph mode's selected objects. Choices
survive tool navigation but not reload. Export has no named analysis tabs or
persisted request/result records.

Project inspection is a catalogue query beneath the graph resource key, so
committed catalogue changes invalidate it. Generation captures the request and
revalidates it in the backend. Both the sidebar tool and graph shortcut use the
same API helper. The desktop helper invokes `save_export`; browser downloads use
the HTTP response filename. Pending exports remain owned by Task Centre, and
accepted failures are reported once by its existing window observer.

## Shared research display boundaries

The stopword picker owns incomplete choices locally. Only a complete Data Block
and column reference reaches projection settings; replacement keeps applied
words until confirmation, while removal/disable takes effect immediately.
Legacy incomplete references do not issue invalid projection requests.

Arrow Date32 and Date64 getters normalize to UTC calendar strings recursively,
including nested fields and NULLs. Type labels expose dates and decimal precision
and scale without altering Arrow schemas or exact stored numeric values.

Data Block actions reserve row space instead of covering names; full-name
tooltips support focus and hover. Recent-file metadata failures remain distinct
from unavailable files; history removal is explicit. Annotation context is
rendered as bounded readable tables, with raw JSON in a disclosure. Export
inspection summarizes Data Blocks, saved analyses and SQL cells from catalogue
metadata. Backing storage is disclosed separately; blockers remain visible.
