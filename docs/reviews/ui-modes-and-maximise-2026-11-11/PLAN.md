# Basic and Advanced tool modes, and maximised results: implementation plan

Read [DESIGN.md](DESIGN.md) first. It holds what people see and why. This file
holds the order of work, the files, the traps, and how to verify. It is
written for whoever implements next, with no memory of the design discussion.

## Ground rules for this work

- Branch: stay on `research/v0.7-trends-normalisation`. Commits are local
  only. Never push unless Chao asks.
- Do not file GitHub issues, ledger records (`V07-nnn`) or release notes.
  Chao decides that when he keeps the work (DESIGN.md, question 4).
- One commit per numbered step below. Part B commits must not depend on
  Part A commits or on the Trends reference work, so Part B can be
  cherry-picked onto `v0.7` alone.
- Frontend only. No backend, OpenAPI or generated-code change is needed. If a
  step seems to need one, stop and say so.
- React Compiler is on: no `useMemo`, `useCallback` or `React.memo` for
  routine optimisation. Content inside panes uses container queries, not
  viewport breakpoints (`frontend/AGENTS.md`).
- Formatting is Biome (`pnpm -C frontend format:check` is `biome format src/`),
  not Prettier. The backend is not ruff-formatted repo-wide; do not format it.
- User-visible text follows the product's voice: plain, short, British
  spelling ("Maximise", "Colour", "Tokeniser"), `Data Block` and `Project` as
  product terms.

## Order

| Step | What | Gate |
|---|---|---|
| A1 | Mode mechanism, applied to Trends | None. Do first: it finishes the feature under review on this branch. |
| B1 to B4 | Maximised results for analysis tools and the Data Editor | None. |
| A2 | Annotation | Agreed 11 November 2026. |
| A3 | Concordance | Agreed 11 November 2026, as changed in DESIGN.md. |
| A4 | Topic Modelling | **Not confirmed. Do not build until Chao answers.** |

## Facts already established (do not re-derive)

- Every analysis tool renders through
  `frontend/src/features/views/common/components/AnalysisSplitLayout.tsx`.
  `viewId` values: `token-frequency`, `concordance`, `sequential-analysis`
  (Trends; its ViewType is `analysis`), `topic-modeling`, `quotation`,
  `annotation`. The handle row renders only when the results pane has
  children (`hasResults`, from a MutationObserver).
- Parameter cards use `common/components/AnalysisCardLayout.tsx`, except
  Concordance, which builds its own Card with
  `common/components/AnalysisFeatureHeader.tsx`. Neither header has an
  actions slot today.
- Tab settings (`host.settings`, `host.setSetting` from
  `common/tabs/AnalysisTabsHost.tsx`) are strings stored on this device in
  `analysisTabsPresentationStore` (localStorage
  `ldaca-analysis-tab-presentation-v4`), scoped by account, Project and tab.
  They are not sent to the backend. Existing keys include
  `sequential.chartType` and `sequential.scale`.
- Account preferences (`features/preferences/useUserPreferences.ts`) are a
  strict TOML file on the backend. Do not add a field.
- Suggestions are "nudges": `features/nudges/nudges.ts` (definitions and
  `NUDGE_TARGETS`), `NudgeCard.tsx` (supports an `action` button),
  `nudgeHighlight.ts` (outlines `data-nudge-target` elements; the card puts
  the outline back after every render, so a target that mounts later is
  outlined).
- Contextual Hints: `features/guidance/registry.ts`. A test pins the count
  (47 hints) in `features/guidance/__tests__/registry.test.tsx`.
- Dialogs, sheets and alert dialogs register in
  `features/guidance/modalLayerStore.ts` (`count`). Radix dismissable layers
  call `preventDefault()` on the Escape they consume.
- The shell is `components/layout/WorkspaceShell.tsx`: sidebar, sidebar
  handle, main `InsetCard` (`mainRef`), right handle, `aside` (`asideRef`)
  holding `WorkspaceView` (Project Graph above the Data Editor).
  `hooks/useRightPanelResize.ts` writes widths to `mainRef` and `asideRef`
  directly while dragging and holds `isRightCollapsed` in local state.
  Collapsing unmounts the graph and the Data Editor.
- The desktop title bar (`DesktopNavigationHeader`, fixed, `z-30`, 35 px) is
  above the shell. Anything laid out inside `SidebarInset` cannot cover it.
- There are no end-to-end tests. Layout is pinned by vitest files listed
  under each step.
- Trends today (`sequential-analysis/SequentialAnalysisFeature.tsx`): the
  reference draft lives in `useSequentialAnalysisParameters`
  (`referenceNodeId`, `referenceTextColumn`, `referenceTokenizerModel`);
  `referenceNodeId` is already derived to `''` when it equals the analysed
  Data Block or is excluded by `useReferenceCandidates`; an effect defaults
  the reference to the parent for a freshly chosen Data Block
  (`defaultReferenceNode` in `trendsReference.ts`).

## Part A. Basic and Advanced

### A1. Mechanism, and Trends

**New folder `frontend/src/features/views/common/toolMode/`.**

1. `toolMode.ts`
   - `TOOL_ADVANCED_SETTING = 'tool.advanced'`.
   - `readDeviceDefault(viewId)` and `writeDeviceDefault(viewId, advanced)`
     on `localStorage` key `ldaca.toolMode.<viewId>`, wrapped in try/catch
     like `AnalysisSplitLayout`'s storage helpers.
   - `resolveAdvanced({ stored, lastRunUsedAdvanced, deviceDefault })`:
     `stored === 'true'` or `'false'` wins; otherwise
     `lastRunUsedAdvanced || deviceDefault`. Pure, unit-tested.
2. `useToolMode.ts`
   - Input: `{ host: Pick<AnalysisFeatureHost, 'settings' | 'setSetting'>,
     viewId, lastRunUsedAdvanced }`.
   - Returns `{ advanced, setAdvanced }`. `setAdvanced` writes the tab
     setting and the device default. No effect is needed: `advanced` is
     derived on every render.
3. `ToolModeContext.ts`: `{ advanced: boolean; setAdvanced: (value: boolean)
   => void } | null`, null outside a tool that has modes.
4. `AdvancedSwitch.tsx`: the existing `Switch` primitive with the visible
   label **Advanced**, `aria-label="Advanced settings"`, and a `HelpIcon`
   for `ui.tool-mode`. Reads the context.
5. `AdvancedSection.tsx`: a wrapper that renders its children only when
   `advanced`, under a rule labelled **Advanced settings** (a `div` with
   `role="group"` and `aria-label="Advanced settings"`).

**Shared header slot.** Add `headerAction?: React.ReactNode` to
`AnalysisCardLayout` (right end of the header row, outside the
`parametersLocked` fieldset) and to `AnalysisFeatureHeader`.

**Trends.**

1. `sequential-analysis/hooks/useSequentialAnalysisParameters.ts`: export a
   pure `basicSequentialParams(params)` that returns the request parameters
   with `reference_node_id`, `reference_text_column` and
   `reference_tokenizer_model` set to `null`.
2. `SequentialAnalysisFeature.tsx`
   - `const mode = useToolMode({ host, viewId: 'sequential-analysis',
     lastRunUsedAdvanced: Boolean(serverRequest?.reference_node_id) })`.
   - Add `!mode.advanced` to the conditions that derive `referenceNodeId` to
     `''`. Everything downstream (the request, `hasChanges`, the task flow)
     already reads the derived value, so Basic sends no reference. Confirm by
     reading `currentSequentialParams` and `useSequentialAnalysisTaskFlow`.
   - Pass `timeColumn: ''` to `useReferenceCandidates` in Basic, so it reads
     no schemas.
   - Parent default: keep the existing effect but add `mode.advanced` to its
     guard. Add a second trigger in the switch handler: when the person turns
     Advanced on and the draft has no reference, set the parent as the
     reference even if a result is on screen. That one is an event, not an
     effect; a tab that opens in Advanced because of `lastRunUsedAdvanced`
     must not get a new default.
   - Wrap the feature's JSX in `ToolModeContext` and pass
     `headerAction={<AdvancedSwitch />}` to `AnalysisCardLayout`.
3. `components/panels/SequentialAnalysisParameterPanel.tsx`: render
   `SequentialReferencePanel` inside `AdvancedSection`.
4. Results are untouched: **Show as** keeps deriving from the result.

**Suggestions.** Add `advanced?: true` to `NudgeDefinition`. In `NudgeCard`,
when the definition is advanced and the context says Basic, render a
**Show advanced settings** link button that calls `setAdvanced(true)`. No
Trends nudge needs it; the mechanism lands here so A2 only tags definitions.

**Help.**

- `frontend/public/tutorials/ui.md`: a short section with
  `<span id="help-ui-tool-mode"></span>` near `help-ui-analysis-layout`:
  what the switch does, that Basic uses the defaults for hidden settings,
  that a tab remembers its mode on this device.
- `frontend/src/tutorials/bundledRegistry.ts`: `ui.tool-mode`.
- `frontend/public/tutorials/sequential-analysis.md`: Step 5 (reference
  Data Block) starts with turning on **Advanced**; say the parent is offered
  when Advanced is turned on. `frontend/public/information/sequential-analysis.md`:
  the sentence that says the corpus "starts selected".
- `docs/domain/analyses-and-imports.md`: one sentence on the Trends
  paragraph that a reference is sent only in Advanced.
- `docs/architecture/frontend/overview.md`, Boundaries: tool modes are tab
  presentation state that also shapes the request on the client; the rule
  "Basic sends defaults for advanced settings".

**Tests.**

- `toolMode/__tests__/toolMode.test.ts`: `resolveAdvanced` table; storage
  helpers tolerate a throwing `localStorage`.
- `toolMode/__tests__/useToolMode.test.tsx`: stored value wins; device
  default; `lastRunUsedAdvanced`; `setAdvanced` writes both.
- `sequential-analysis/hooks/__tests__/useSequentialAnalysisParameters.test.tsx`:
  `basicSequentialParams` nulls the three fields and nothing else.
- `SequentialAnalysisParameterPanel.test.tsx`: the reference panel renders
  only in Advanced (the test already mocks `SequentialReferencePanel`).
- `AnalysisCardLayout` test (create if missing): `headerAction` renders and
  stays enabled when `parametersLocked`.
- `features/nudges/__tests__/nudges.test.tsx`: an advanced nudge in Basic
  shows **Show advanced settings** and calls the context.

**Manual check (dev build).** New Trends tab: no reference panel, Run sends
no reference (network tab). Turn Advanced on: parent selected. Run, switch to
**Per million words**, turn Advanced off: chart stays, Run becomes available,
running it gives a result without the rate. Turn Advanced on again: the
reference is still chosen. Reload: the tab reopens in the mode it had.

### A4. Topic Modelling (not confirmed; listed here ahead of A2 for history)

**Topic Modelling** (`topic-modeling/components/panels/TopicModelingParameterPanel.tsx`,
`hooks/topicModelingParameterState.ts`, `hooks/useTopicModelingParameters.ts`).

- `basicTopicParams(draft)`: Sampling 100 for every Data Block, Passages
  Automatic, Max tokens the default for the model (256, 128 for
  Multilingual), Seed 0, Topic sampling off.
- Move Passages, Max tokens, Seed and Topic sampling into `AdvancedSection`;
  render the per-Data-Block Sampling add-on only in Advanced. Model, Topic
  size and Remote GPU stay.
- Tag `topic-slow-start`, `topic-large-input` and `topic-segment-length` as
  `advanced: true`. `TopicSegmentLengthNudge`'s Apply sets Max tokens: it
  must call `setAdvanced(true)` first (rule 2 in DESIGN.md).
- The last-run summary paragraph keeps listing what the run used.
- `lastRunUsedAdvanced`: the last request differs from
  `basicTopicParams` of itself.
- Reword the `topic-modeling.run` hint and bump its version; update
  `topic-modeling.md` and the Suggestions list in `ui.md`.

### A2. Annotation

**Annotation** (`annotation/AnnotationFeature.tsx`,
`components/AnnotationAiSettings.tsx`, `annotationTabSettings.ts`).

- Remove the local `advancedOpen` Collapsible in `AnnotationAiSettings`; its
  content renders in `AdvancedSection`. Keep
  `data-guidance="annotation-ai-settings-trigger"` reachable: point the
  `annotation.ai.setup` fallback at the switch, and reach
  `annotation.ai.advanced` when the switch turns on in AI mode.
- Move the Example Data Block and `AnnotationExampleSamplingControls` into
  the advanced section.
- `basicAnnotationSettings(settings)`: no examples, default prompt, default
  temperature and thinking, processing mode "Only rows without an
  annotation", default batch size, concurrency and retries
  (`annotationTabSettings.ts`, defaults near the top).
- `handleUseCorrectionColumnAsExample` turns Advanced on.
- `AnnotationSavedLabelsNotice` text already says "Advanced settings"; check
  it still reads correctly.
- Manual mode has no advanced settings. Show the switch only in AI mode.

### A3. Concordance

`concordance/components/ConcordanceParameterPanel.tsx`,
`hooks/concordanceParameterState.ts`, `hooks/useConcordanceTokenizerMode.ts`,
`components/ConcordanceResultsPanel.tsx`.

- `basicConcordanceParams`: Text mode, Ignore punctuation on. Context sizes,
  Case sensitive, Whole word and the regular expression option stay Basic.
- Hide the Search mode tabs and the per-Data-Block tokeniser add-on in Basic.
- Rename **Use regular expression** to **Regular expression** (Concordance
  only; the Data Editor tools keep their label).
- Results: the **Separated** / **Combined** tabs render only in Advanced; in
  Basic the layout is Separated whatever the remembered choice.
- Reword the `concordance.search` hint if it names Tokens mode.

## Part B. Maximised results

### B1. Store and shell

1. `frontend/src/stores/layoutFocusStore.ts`: zustand, not persisted.
   `maximised: 'analysis' | 'data-editor' | null`, `maximise(surface)`,
   `restore()`. Export from `stores/index.ts`.
2. `components/layout/shellLayout.ts` (new, pure): given `maximised`,
   `isRightCollapsed` and `asidePanelRatio`, return which regions are hidden
   and the `width` styles for main and aside. Unit-test it; keep
   `WorkspaceShell.tsx` a thin consumer.
3. `WorkspaceShell.tsx`
   - Sidebar and its `ResizeHandle`: wrap in a `div` that is `contents`
     normally and `hidden` while anything is maximised. The desktop sidebar
     is `fixed` with a gap element; check both vanish.
   - `maximised === 'analysis'`: aside and right handle `hidden`, main
     `width: 100%`.
   - `maximised === 'data-editor'`: main `hidden`, right handle `hidden`,
     aside `width: 100%` with its `min-w` and `max` classes dropped, and
     `h-full` in the stacked (narrow) layout.
   - Do not touch `isRightCollapsed`. Hidden regions stay mounted.
   - Restore in an effect when `currentView` or the current Project id
     changes.
4. `hooks/useRestoreOnEscape.ts` (new), mounted once in the shell: a
   `document` `keydown` listener in the bubble phase. Restore when the key is
   Escape, `maximised` is set, `event.defaultPrevented` is false,
   `useModalLayerStore` count is 0, and the target is not an input, textarea,
   select or contenteditable element, nor inside `[role="dialog"]`,
   `[role="menu"]` or `[role="listbox"]`.

Tests: `stores/__tests__/layoutFocusStore.test.ts`;
`components/layout/__tests__/shellLayout.test.ts`;
`hooks/__tests__/useRestoreOnEscape.test.tsx`.

### B2. Analysis tools

1. `AnalysisSplitLayout.tsx`
   - New optional prop `title?: string` for the maximised bar (tool label and
     tab title). Pass it from each feature, or read it from a small context
     set by `AnalysisTabbedPanel` so no feature changes; prefer the context.
   - Handle row: a `Maximise results` icon button (`Maximize2` from
     lucide-react, `aria-label="Maximise results"`,
     `data-testid="analysis-split-maximise"`) beside the help icon.
   - While `maximised === 'analysis'`: the parameters pane gets `hidden`
     (stay mounted); the handle row is replaced by a bar with the title and a
     **Restore layout** button (`Minimize2`,
     `data-testid="analysis-split-restore"`); the results pane keeps
     `flex-1`.
   - Restore when `hasResults` turns false.
   - Move focus to Restore on maximise and back to Maximise on restore.
2. `common/tabs/AnalysisTabbedPanel.tsx`: skip `EditorTabs` while
   `maximised === 'analysis'`, and provide the title context.
3. `common/components/ResultFrame.tsx`: no change. Chao: every resizable
   pane keeps its behaviour while maximised, and every hand-set size or ratio
   is the same after restoring. Do not write to any layout storage key when
   maximising or restoring.
4. `features/nudges/NudgeCard.tsx`: while `maximised === 'analysis'` and the
   nudge has targets, render **Show settings**, which calls `restore()`.
5. Contextual Hints: check that a hint whose target is inside the hidden
   pane pauses (`TARGET_NOT_FOUND`) rather than floating at the corner. If it
   floats, make `GuidanceProvider` treat a target with no client rects as
   missing.

Tests: extend `common/components/__tests__/AnalysisSplitLayout.test.tsx`
(button only with results; maximise hides parameters and the handle; restore;
auto-restore when results vanish; the stored parameters height is unchanged
after a maximise and restore); `AnalysisTabbedPanel.test.tsx` (strip hidden);
`nudges.test.tsx` (**Show settings**).

### B3. Data Editor

1. `features/workspace/data-view/components/WorkspaceSelectionTabs.tsx`: an
   icon button before the **All Data Block tabs** dropdown,
   `aria-label="Maximise Data Editor"` or `"Restore layout"`.
2. `components/layout/WorkspaceView.tsx` while `maximised === 'data-editor'`:
   - Hide the graph/table `ResizeHandle`.
   - Top `InsetCard`: `hidden` when no column tool is open. With a tool open,
     show only `DataEditorToolPanel`, at its natural height capped at about
     45% with its own scroll; never the graph or the **Back to** bar.
   - Bottom `InsetCard`: `flex-1`, ignoring the stored ratio.
3. `features/workspace/data-view/dataEditorToolStore.ts` and
   `DataEditorToolPanel.tsx`: while maximised, hide **Show Project Graph**,
   and set `graphVisible` to false when maximising with a tool open.
4. Restore when the Data Editor has no selected Data Block
   (`WorkspaceDataTableFeature` empty state).

Tests: `WorkspaceSelectionTabs.test.tsx` (button, label flips);
a `WorkspaceView` test for the maximised arrangement, next to
`WorkspaceViewCollapse.test.tsx`; `DataEditorToolPanel.test.tsx`.

### B4. Help and engineering docs

- `frontend/public/tutorials/ui.md`: a section with
  `<span id="help-ui-maximise"></span>` after `help-ui-analysis-layout`:
  the two buttons, what is hidden, **Restore layout**, Esc, that results fill
  the space, that it is not remembered after a reload. Mention the Data
  Editor button under `help-ui-data-viewer`, and the column tool opening
  above the table under `help-ui-data-editor-column-tools`.
- `bundledRegistry.ts`: `ui.maximise`. Use it for a `HelpIcon` only if the
  bar has room; the tooltip on the button may be enough.
- `docs/architecture/frontend/overview.md`, Boundaries: `layoutFocusStore`
  owns the maximised surface; regions are hidden, not unmounted; what
  restores it.
- Found while reading, not part of this change: `ui.md`, `annotation.md` and
  `quotation.md` say a result is resized from its "bottom-right corner", but
  the grip is centred on the bottom edge. Fix in its own commit if Chao
  agrees.

## Verification

Run from the repository root after each step that touches the frontend:

```sh
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend lint
pnpm -C frontend format:check
pnpm -C frontend test -- --run
pnpm -C frontend exec knip
pnpm -C frontend docs:check
pnpm docs:links
git diff --check
```

Run `pnpm -C frontend build` once at the end of Part A and of Part B.

Manual pass, in a dev build, at 1440 px and 1024 px wide, in Chromium and in
WebKit (the desktop app uses WebKit on macOS):

| Check | Expect |
|---|---|
| Maximise then restore in each of the six analysis tools | Same scroll position, selection, chart zoom and parameter draft as before. |
| Topic Modelling maximised | Options sit beside the chart; lists and passages side by side; lasso, eye and search still work. |
| Trends and Frequency charts | They resize to the new width without a blank canvas. |
| Project Graph after restoring | Same zoom and position; nodes not collapsed to a corner. |
| Data Editor maximised, open Find & replace | Form above the table, columns highlighted, **Close tool** returns to the full table. |
| Add to Project while maximised | Dialog opens above; the layout is unchanged after it closes. |
| Esc with a dialog, a Select, or an inline rename open | That closes; the layout stays maximised. Esc again restores. |
| A result that disappears while maximised (clear it from another tab of the same Project, or let a rerun fail) | The layout restores by itself. |
| Sidebar hidden | Back and forward in the title bar still change the view, which restores the layout. |
| Narrow window (stacked layout) | Each surface maximises to the full height; restore brings the stack back. |
| A Suggestion that names a parameter, while maximised | **Show settings** restores and the setting is outlined. |

## Risks

| Risk | Mitigation |
|---|---|
| A hidden-then-shown chart or React Flow graph keeps a zero size. | They use resize observers; verified in the manual pass. If one does not recover, dispatch a `resize` on restore. |
| Esc restores when the person meant something else. | The guards in B1.4; the worst case is an unwanted restore, which loses nothing. |
| A tool's `basicParams` misses a field, so Basic sends a hidden value. | One pure function per tool with a test that lists every advanced field. |
| The Advanced switch reads as a different product. | One switch per card, same tool and Help in both modes, no global setting. |
| Tab settings are device-local, so a Project opened elsewhere loses the mode. | `lastRunUsedAdvanced` opens such a tab in Advanced. |
