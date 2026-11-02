# UI Evidence And Verification

Evaluation date: 2 November 2026. Start with the
[Astra brief](ASTRA-REVIEW.md) or [behavior memory](BEHAVIOR-MEMORY.md).

## Environment And Provenance

| Item | Recorded value |
|---|---|
| Baseline | Local `v0.7`, `852baa0e6720531ac7b6a00939559d78318af31e` |
| Evaluation branch | `research/v0.7-ui-astra-handoff` |
| Frontend | Checkout source, manifest 0.7.19, Vite development server |
| Backend | Editable source imported from this checkout; installed package metadata/health says 0.7.15 |
| Installed analysis packages | Polars 1.44.1, polars-text 0.7.0 |
| Runtime | macOS, single-user, separate evaluation Data Root, no configured provider credentials |
| Local URLs | Frontend `http://127.0.0.1:3100`, backend `http://127.0.0.1:8101` |
| Browser tooling | Existing playwright-core 1.63.0 installation and cached Chromium/WebKit browsers |
| Standard captures | Chromium, 1440 x 1000 CSS pixels |
| Other captures | 1024 x 768 and 390 x 844 responsive screens; WebKit verification |
| Initial capture exception | Screenshot 01 is the integrated browser's 815 x 565 viewport, not the standard standalone viewport |

### Setup Limitations

`pnpm` was initially absent from PATH; `npx --yes pnpm --version` provided
11.24.0. Normal `pnpm dev` then attempted local package rebuilds and failed
fetching the Maturin build requirement because of an untrusted TLS certificate.
No certificate validation was disabled and no application workaround was added.

The existing environment successfully imported this checkout's backend source
and installed analysis packages. Testing therefore used `UV_NO_SYNC=true`.
The metadata mismatch is explicitly retained as a qualification limit, not
silently treated as a clean 0.7.19 installation.

The integrated browser's pointer coordinates were inconsistent with its layout
coordinates during early clicks. Keyboard activation created the evaluation
Project; the subsequent survey and verified workflows used an independent
headless browser. Early pointer timeouts are **not reported as product bugs**.

### Screenshot Interpretation

- The bright circular upper-left overlay is development-only Query devtools.
  Its gate and placement are in
  [QueryProvider.tsx](../../../frontend/src/providers/QueryProvider.tsx):35.
  Ignore it when judging production branding/navigation.
- Screenshots are raw viewport captures, not redesign mockups or stitched
  full-page images. A result below the fold is deliberately not scrolled into
  view merely to make the screen look cleaner.
- Account hints were initially enabled. After documenting their controls they
  were temporarily disabled to inspect unobscured tool surfaces. Suggestions
  remained enabled. Hints, visible views and multi-tab were restored after testing.
- Capture numbers group the investigation; they are not a strict chronological
  transaction log. For example, the settled selection illustration in 05 was
  recaptured in a fresh empty F-2 tab after F-1 had a retained Result.
- A `.txt` accessibility snapshot accompanies each standalone `.png`, with the
  same basename. It records text and semantic controls, not just pixels.
  The snapshots omit offscreen/virtualized data according to browser behavior.
- The fixture is synthetic. No real research text, participant data, API keys,
  account credentials or existing user Projects were used.

## Fixture

[synthetic-discourse.csv](synthetic-discourse.csv) has 24 rows and five columns:
`id`, `text`, `date`, `group`, `score`.

There are eight copies of each invented Housing, Education and Transport text.
Each has one attributed quotation. IDs/scores are 1-24, and dates cycle through
12 months. Repeated texts intentionally make expected counts easy to check;
this is not a representative corpus or a model-quality benchmark.

Expected checks:

- Frequency with Plain words, no stop-word filter: `the=32`, `said=24`,
  `housing=8`.
- Concordance, Text mode, whole-word search `housing`: eight matches.
- Builder > Sample > Slice, Start row 0, Length 6: six output rows.
- Trends on numeric `id`, Step 1: all 24 rows represented.
- Export source as CSV: header plus 24 rows.
- Find & replace `community` with `neighbourhood`, same text column:
  affected housing text previews/changes; Undo restores the original text.

## Live Test Record

The executed automation used real DOM controls and the local backend, not
mocked responses. There was no fixed sleep treated as proof of analysis
completion: completion/output checks and subsequent persisted-result assertions
were used. Some setup screenshots intentionally show disabled or incomplete
draft states.

| Check | Result | Boundary |
|---|---|---|
| Create Project | Passed via keyboard activation in integrated browser | Only isolated evaluation Project |
| Upload file -> preview -> Add to Project | Passed | 24-row source Data Block, upload alone did not create it |
| Select source in sidebar while tool has no input | Confirmed | Data Editor opened; empty Frequency input remained empty |
| Frequency Plain words Run | Passed | Result's accessible chart text matched expected token counts |
| Concordance Preview and Run | Passed | Full retained table had eight `housing` match cells |
| Concordance Add to Project | Dialog inspected | No match Data Block was published in this audit |
| Builder Sample/Slice | Passed | Named `UI first six`, lineage edge visible, six Data Editor rows verified |
| Trends numeric Run | Passed | Result group reported `24` and `100.0%` |
| Find & replace -> Apply -> Undo | Passed | In-place edit, tool remained open; original text visible after Undo |
| Source CSV export | Passed | Download completed; saved CSV had 25 lines including header |
| Hide active Quotation view | Passed | Returned to Loader; unchecked preference survived reload; view restored afterward |
| Disable multi-tab with one tab | Passed | Analysis tab strip hidden, retained Result still available |
| Disable multi-tab with two tabs | Passed | Strip remained visible and both tabs reachable; temporary F-2 closed afterward |
| Collapse/expand Project panel | Passed | Analysis gained width and graph/editor could be reopened |
| Annotation Manual/AI setup | Inspected | Create new immediately published an empty Codebook Data Block; no codes or annotations saved |
| Settings, Help and quick access | Inspected and opened | No provider credentials entered; Help used bundled development content |
| Topic Modelling / Quotation | Setup inspected | No model Run, download or external inference |
| WebKit persisted results | Passed | Frequency counts, eight Concordance matches, Trends 24 rows and six-row derived table checked again |
| Responsive geometry | Passed limited check | Document scroll width equaled viewport width at 1440, 1024 and 390; no claim about complete mobile task usability |

Successful standalone scenarios recorded no uncaught page errors or backend
HTTP responses >=400. This excludes the earlier failed server startup and
automation-selector/readiness corrections. It is not a claim that every
request, mode, provider or failure path in Wordflow is fault-free.

### Existing Frontend Tests

Executed from the repository root:

```sh
npx --yes pnpm -C frontend exec vitest run \
  src/components/layout/__tests__/SidebarViewVisibilityMenu.test.tsx \
  src/components/dialogs/__tests__/SettingsDialog.test.tsx \
  src/features/views/common/tabs/__tests__/AnalysisTabsHost.test.tsx \
  src/features/views/__tests__/viewRegistry.test.tsx
```

Result: **4 test files, 34 tests passed**. Node emitted a non-fatal experimental
`localStorage` warning. These are existing contract tests, not new user-study
measurements.

This is a documentation/evidence-only change. The full frontend build, lint,
test suite, backend suite and desktop packaging were not run.

Documentation validation passed: `pnpm docs:links` checked 225 Markdown files
and its three checker tests passed. `git diff --check` passed; the four new
Markdown files also produced no whitespace diagnostics when checked explicitly.

## Screenshot Index

For a quick review, start with 05, 25, 30, 33, 34, 36-1024, 40-42, 44 and 48.
The [source behavior map](BEHAVIOR-MEMORY.md) explains what each action means.

### Entry And Tool Survey

| Capture | Question answered |
|---|---|
| [01 First run](screenshots/01-first-run.png) | What does an empty first visit show, including contextual guidance? |
| [02 Open Project, no data](screenshots/02-loader-open-project.png) | How much Project/file management is initially present? |
| [03 Uploaded file](screenshots/03-loader-uploaded-file.png) | Where is a file before it becomes a Data Block? |
| [04a Preview confirmation](screenshots/04a-file-preview-confirmation.png) | What does Add from the file library require? |
| [04 Source Data Block](screenshots/04-source-data-block.png) | How does source creation affect the list and graph? |
| [05 Inspection is not tool input](screenshots/05-editor-selection-not-tool-input.png) | Why can the Data Editor show data while the tool is empty? |
| [06 Builder](screenshots/06-builder.png) | Where do the eight preprocessing operations live? |
| [07 Frequency setup](screenshots/07-frequency-setup.png) | What does the analysis shell show before a complete draft? |
| [08 Concordance setup](screenshots/08-concordance-setup.png) | How many search choices are present before input? |
| [09 Trends setup](screenshots/09-trends-setup.png) | Which choices depend on an axis column? |
| [10 Topic setup](screenshots/10-topics-setup.png) | Which modelling parameters are exposed without data? |
| [11 Quotation setup](screenshots/11-quotation-setup.png) | What is the minimal extraction setup surface? |
| [12 Annotation setup](screenshots/12-annotation-setup.png) | How do source and Codebook roles enter the interface? |
| [13 Export setup](screenshots/13-export-setup.png) | How are Data Block export and Project export distinguished? |

### Configuration And Results

| Capture | Question answered |
|---|---|
| [14 General settings](screenshots/14-settings-general.png) | Where do appearance and multi-tab preferences live? |
| [15 Visible views](screenshots/15-settings-views.png) | What navigation customization already exists? |
| [16 Guidance settings](screenshots/16-settings-guidance.png) | How are contextual hints and suggestions separated? |
| [17 Servers](screenshots/17-settings-servers.png) | Where do credential/provider and remote GPU prerequisites live? |
| [18 Frequency input card](screenshots/18-frequency-inputs.png) | What still needs choosing after adding a Data Block? |
| [19 Tokenisers](screenshots/19-frequency-tokenisers.png) | How are language and tokeniser choices presented? |
| [20 Concordance inputs](screenshots/20-concordance-inputs.png) | Which search/tokeniser controls are now available? |
| [21 Trends inputs](screenshots/21-trends-inputs.png) | What does a numeric axis expose? |
| [22 Topic inputs and suggestion](screenshots/22-topics-inputs.png) | How do modelling parameters and actionable advice compete for attention? |
| [23 Quotation inputs](screenshots/23-quotation-inputs.png) | What is ready to preview or run? |
| [24 Annotation inputs](screenshots/24-annotation-inputs.png) | Which remaining prerequisites are visible? |
| [25 Frequency result](screenshots/25-frequency-results.png) | How much display configuration precedes the cloud? |
| [26 Concordance Preview](screenshots/26-concordance-preview.png) | What does a page-oriented exploration look like? |
| [27 Concordance Run](screenshots/27-concordance-review.png) | Where are retained results and output actions? |
| [28 Builder Sample](screenshots/28-builder-sample.png) | How do automatic preview and Add to Project coexist? |
| [29 Trends result](screenshots/29-trends-results.png) | How are chart type, spacing, selection and output exposed? |

### Data Changes And Adaptive Presentation

| Capture | Question answered |
|---|---|
| [30 Derived lineage](screenshots/30-builder-derived-lineage.png) | How is a new Data Block distinguished from its source? |
| [31 Data Editor](screenshots/31-data-editor.png) | How many editing routes coexist with Loader? |
| [32 Column menu](screenshots/32-column-menu.png) | Which specialist functions are disclosed through a column? |
| [33 Editing form replaces graph](screenshots/33-editor-tool-replaces-graph.png) | How does entering an edit change the right-hand context? |
| [34 Concordance output dialog](screenshots/34-concordance-output-dialog.png) | What must a user choose before reusing matches? |
| [35 Configured export](screenshots/35-export-configured.png) | What is the source selection/download boundary? |
| [36 Wide 1440](screenshots/36-responsive-1440.png) | How does the result fit a wide desktop? |
| [36 Laptop 1024](screenshots/36-responsive-1024.png) | What is initially visible on a smaller desktop? |
| [36 Phone 390](screenshots/36-responsive-390.png) | Does fitting the width also make results immediately accessible? |
| [37 Edit preview](screenshots/37-editor-preview.png) | How are proposed data changes communicated? |
| [38 Edit applied](screenshots/38-editor-applied.png) | What stays open after Apply? |
| [39 Edit undone](screenshots/39-editor-undone.png) | What does session recovery look like? |
| [40 Single-tab chrome hidden](screenshots/40-single-tab-chrome-hidden.png) | What does the existing simplified tab presentation remove? |
| [41 Active view hidden](screenshots/41-hidden-active-view-falls-back.png) | Where does navigation go when the current tool is hidden? |
| [42 Multiple tabs retained](screenshots/42-multiple-tabs-remain-reachable.png) | Can existing work remain reachable in simplified presentation? |
| [43 WebKit check](screenshots/43-webkit-verified.png) | Do retained core results and the derived table load in another engine? |
| [44 AI Annotation](screenshots/44-annotation-ai-setup.png) | How much role/provider/sample complexity is present before inference? |
| [45 Empty Codebook created](screenshots/45-annotation-codebook-creation.png) | Does Create new create real Project data immediately? |
| [46 Help](screenshots/46-help-home.png) | How does written guidance relate to the working context? |
| [47 Quick access](screenshots/47-quick-access.png) | What is behind the Project-named header control? |
| [48 Analysis-focused layout](screenshots/48-analysis-focused-collapsed-project.png) | What can already be simplified without changing functionality? |

## Reproduce Manually

1. Use the reference branch and an isolated, empty Data Root. Never point a UI
   experiment at an existing researcher's storage.
2. With a normal synced environment, use the
   [development runbook](../../runbooks/development.md). For this machine's
   already-installed environment the actual successful command was:

   ```sh
   UV_NO_SYNC=true \
   DATA_ROOT=/absolute/path/to/isolated-ui-evaluation-data \
   MULTI_USER=false FRONTEND_PORT=3100 VITE_BACKEND_PORT=8101 \
   npx --yes pnpm dev
   ```

   Do not copy `UV_NO_SYNC=true` as a general bootstrap fix. A clean environment
   should sync normally and qualify the pinned dependencies.
3. Open the frontend. Create a Project named for the evaluation. Upload the
   supplied CSV; Add it to the Project after checking the preview.
4. Follow the [expected fixture checks](#fixture), choosing the `text` column
   and native Plain words where needed. Keep model-dependent runs out of this
   minimal reproduction.
5. Test view hiding and tab simplification in Settings. Restore them afterward.
   Repeat retained-result checks in Chromium and WebKit.
6. Capture at the listed sizes, distinguishing initial visible content from
   scrolled content. Stop the evaluation servers after use.

## Deliberately Not Established

- Actual novice task success, training duration, preferred profile names or
  which functions are basic for a given discipline.
- Large Project navigation, long names at scale, many analysis tabs, large
  schemas, long corpora, high-latency tasks or simultaneous collaborators.
- Full accessibility conformance, keyboard-only completion, screen-reader
  usability, contrast, reduced motion or touch-gesture coverage.
- Topic/Quotation output behavior, model quality, inference cost, remote GPU,
  real Portal authorization or end-to-end manual/AI Annotation.
- Hosted identity/quotas/concurrent Projects, native desktop controls,
  distributable build behavior or the current v0.8 branch.

These are follow-up research/verification needs, not evidence that the
features are absent or broken.
