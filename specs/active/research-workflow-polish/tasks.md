# Acceptance status

## Implemented

- [x] Complete stopword references and retained applied replacement state.
- [x] Arrow Date32/Date64 display and readable decimal/date labels.
- [x] Stack default and scan-free Join/Scatter/Sankey explanations.
- [x] Heatmap/Sankey containment, marker density, Calendar grid and shared inspection.
- [x] Topic document routes and dialog for saved and temporary models.
- [x] Topic initial fitting, collision-aware labels, direct accessible bubble activation.
- [x] Independent accessible Topic selection and View documents buttons; keyboard regression.
- [x] Clean offscreen chart capture shared by Plots and Concordance, Topic figure key.
- [x] Data Block action space, Annotation context, project export summary, quotation
  explanations and explicit Recent-file removal.
- [x] Native E2E per-run webview store configuration and runner-owned cleanup.
- [x] Reproduced false Frequency-to-Concordance outdated warning and corrected
  shared comparison of the inactive Text-mode tokenizer.

## Verified

- [x] Backend locked tests: 230 passing, 13 ignored before adding the opt-in benchmark.
- [x] Tauri locked tests: 35 passing, including store sharing/separation contract.
- [x] Strict backend/Tauri Clippy with all targets/features.
- [x] Frontend suite: 675 tests and 16 tooling tests passing.
- [x] Browser research Plots, text, export and extended Topic workflows passing.
- [x] Topic Arrow retention benchmark: 20,000 rows, 14,295,370 bytes;
  capture 32.1 ms and twenty 20-row queries 165.1 ms on this local macOS run.
- [x] Computer browser Calendar inspection at normal/narrow widths and light/dark
  themes; actual PNG reviewed with visible scale endpoints and clean captions.
- [x] Clean uninstrumented macOS release bundle builds with production identity.
- [x] Formatting, lint, types, unused-code, documentation and diff checks.

## Remaining acceptance gates

- [ ] Final clean native release visual pass, downloaded images and reopened copies.
- [x] Native E2E across actual windows and successive runs with production-history
  sentinel. A test theme was shared by two actual windows; fresh-process sentinel
  checks pass and the production Recent-files value is unchanged.
- [x] Verify normal embedded-driver termination cleanup. The runner removes its
  exact UUID after the app exits. The store directory is confirmed absent. Killing
  the runner itself or an OS crash remains outside graceful cleanup.
- [x] Resolve Topic ResizeObserver loops: controlled nodes retain known geometry
  and handle bounds. The actual-renderer regression fails before the fix and
  passes afterward, including repeated resizing and selection without zoom reset.
  A separate Fit view regression covers zoom-out followed by refitting.
- [ ] Complete final browser manual checks at normal/narrow widths and both themes
  for all affected tools. Calendar was rechecked against freshly served modules
  after the first development server retained stale modules.
- [ ] Windows/Linux platform verification and isolated-OS Dock recent-document check.

The user approved saving and closing the review project. It was saved and closed
on 27 September; the clean bundle then passed production identity, signature,
packaged ICU checksum/catalogue and daylight-saving verification.

## Final native follow-up

- Native Plots (7), text analyses (2), Topic (1) and profile tests passed in the
  optimized instrumented build; clean release packaging verification is separate.
- Tauri 2.11 from_config omits the data-store identifier. The document builder now
  forwards it explicitly; configuration-only unit coverage had missed this.
- WebKit refused in-process removal after window destruction. Cleanup now runs
  after process exit, using the exact runner-generated UUID and a hidden ephemeral
  webview to initialize WebKit. No directory sweep or production reset is used.
- A full frontend run under simultaneous builds/browser tests timed out in one
  editor test. Its focused rerun passed, then all 675 tests passed with two workers.
- Computer reopened the full 24-Data-Block research project and the two-Data-Block
  exported copy. Native screenshots now capture the complete window. Topic
  document inspection and the responsive Calendar were visually checked.
- Browser Computer checks verified keyboard scrolling to the last Heatmap
  category/zoom control and the last Sankey stage at narrow width; normal-width
  Sankey was also inspected in light mode. Theme was restored afterward.

### Latest verification boundary

The macOS `_RegisterApplication` startup failure was caused by sandboxed GUI
launch. The same binary passed the profile suite outside the sandbox, including
profile removal. A rebuilt instrumented release then passed Topic and profile
suites (two tests), and removed its exact test-owned store. This resolves the
previous startup blocker; it was not an application-code crash.

The latest frontend run passed all 675 tests and 16 tooling tests. Lint, tooling
types, formatting, unused-code and documentation-drift checks passed. Clean
release identity, signature and offline ICU verification passed independently.

The final native visual check exposed an additional Fit view issue: explicit
width/height alone left newly controlled nodes without measured bounds, so
React Flow excluded them from fitting. The node geometry now supplies those
bounds as well. The browser regression covers this and remains free of
ResizeObserver warnings. The clean release was rebuilt after this correction; Computer reopened the
saved research project and verified Zoom out then Fit view restores all three
readable bubbles. Earlier native automated passes are separate evidence.
