# v0.7.12–v0.7.13 commit audit

All 204 commits in `3cd4deda4..e8c247959` are inventoried below. Numbered decisions control native implementation; documentation, test, version and retired infrastructure changes are evidence, not instructions to copy implementations. Every uncited commit was checked against its changed paths. Remaining maintenance consists of documentation, tests, versions, release configuration and legacy dependency updates; it adds no independent native runtime feature.

| Commit | Subject | Decision coverage |
|---|---|---|
| `a2e1c52c6c` | docs: V07-011 states which short segments are dropped (only a budget-cut leftover under 4 tokens) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `cae6d78efd` | Column menus: long column names wrap in their own row (#313) | V07-233 |
| `c08c3ee74f` | docs: record V07-233 (#313 column menus); 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `386ce723eb` | Topic Modelling: every highlighted bubble opens its hover card during a search (#314) | V07-234 |
| `764c203d98` | docs: record V07-234 (#314 bubble hover); 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `5626bc73a0` | Dev: pnpm dev picks free ports for both halves and tells each | V07-235 |
| `fb6b0c2516` | docs: record V07-235 (pnpm dev free ports; v0.8 decision for Alex) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `4c051c75d7` | docs: branch record Latest updates for 6 Oct; intro dates and test counts | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `e8b092f46b` | docs: v0.8 plan entry for ZIP and text document loading (#315) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `ea28ff7a21` | docs: migration note, Honi Soit sample is a ZIP again (#315) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `a58c339de2` | docs: migration note, Queensland election sample is CSV again (#315) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `06c8a5d1f1` | fix(trends): offer and accept only date, date-time and number axis columns (#316) | V07-236 |
| `2d4a0ace44` | fix(tables): sort empty values last in both directions (#317) | V07-237 |
| `b257e32aea` | docs: record #316 and #317 (V07-236, V07-237, rule R8), 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `885a5ca0a0` | feat(categories): ordered category columns in the backend (#318) | V07-238 |
| `615bd4fbd9` | feat(categories): order window, ordered categories across the app (#318) | V07-238 |
| `11e9a1e47d` | docs: record #318 ordered categories (V07-238, rule R9), 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `501589118f` | feat(categories): order by row count; drag at any time instead of a Custom button (#318) | V07-238 |
| `2b2bcb4bac` | docs: #318 row-count presets and drag-anytime in the record and 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `fd721ac8d8` | docs: #318 v0.8 note on the full column scan behind category conversion | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `0be41e03da` | feat(categories): warn instead of limiting; sample a text-like column first (#318) | V07-238 |
| `7c42182027` | feat(categories): list at most 300 values in the order window (#318) | V07-238 |
| `e60ecbe66f` | fix(ci): unused export and shadow in the category order window (#318) | V07-238 |
| `014c5cb1c3` | fix(topics): put Topic results on the right rows of a Join Data Block (#319) | V07-239 |
| `93bcd0d7fc` | docs: record #319 (V07-239), 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `fb5290a0c2` | fix(topics): name text edits as well as row order in the #319 refusal | V07-239 |
| `69ebb287d5` | style(tabs): a slim, drawn scroll bar under tab strips | V07-247 |
| `c961f2ef79` | fix(blocks): deleting a Data Block closes the tabs that analysed it (#320) | V07-240 |
| `c908a30fbf` | docs: record #320 (V07-240) and the tab-strip scroll bar, 0.7.11 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `c51f7b505f` | feat(conversion): detect date formats, read numbers, check before converting (backend, #322) | V07-241 |
| `ac99f31d09` | Conversion window for dates, numbers and date to text (#322) | V07-241 |
| `0b8e630522` | docs: record #322 conversion window (V07-241, rule R10, 0.7.11 notes) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `b913539336` | docs: branch changes record #322 (V07-241) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `fcdee08494` | #322 dates inside text: part choices stick, Ignore for text around the date | V07-241 |
| `42b917f370` | docs: record #322 dates inside text (V07-241, 0.7.11 notes) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `3e7a32d24b` | Data Loader: each sheet of a workbook is a table to add (#323) | V07-242 |
| `c426b1b481` | docs: record #323 workbook sheets (V07-242, 0.7.11 notes, branch changes) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `f23bff49e4` | Elapsed time data type for transcript timestamps (#324) | V07-243, V07-244 |
| `3342bfabe6` | docs: record #324 elapsed time and #325 (V07-243, V07-244, rule R11, 0.7.11 notes) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `645f80d265` | Trends: at most 1,000 groups, and a saved oversize result no longer freezes the page (#326) | V07-245 |
| `8ad6d7397d` | docs: record #326 Trends group limit (V07-245, 0.7.11 notes) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `a6ca90d42e` | Trends: help button for Group By columns | V07-246 |
| `fa1083d9f0` | docs: record Trends Group By help button (V07-246) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `7d1088dc99` | docs: migration instructions up to pre-release 0.7.11 | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `121a0af40e` | Analysis lanes: quick tools never wait behind topic models (#328) | V07-248 |
| `2a35efac0c` | Topic Modelling: large corpora finish; Topic sampling (#329, #330, #331) | V07-250, V07-251 |
| `9358b611a1` | Tooltips are short and wrap at 20rem (#332) | V07-252 |
| `9112bad38c` | docs: migration entries V07-248 to V07-252 and 7 Oct branch updates | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `a3e0540a3c` | Analyses: the per-file limit no longer caps the shared caches (#257) | V07-253 |
| `d928fa22c7` | Settings: see and clear the Topic Modelling and Tokeniser caches (#334) | V07-254 |
| `7314c15396` | docs: migration entries V07-253 and V07-254 | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `ee65d12781` | Require polars-text 0.6.3 (#329, #330, #331) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `f12f04a148` | Bump ldaca-wordflow-docs to e6fcf84 (0.7.11 help: Topic sampling, segments, tool caches, Seed) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `9ab3d52849` | Help icons open while a run locks the parameters (#335) | V07-255 |
| `b556408f5a` | docs: V07-255 and 0.7.11 notes for help during a run | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `0dcd271c0e` | Max topic size Auto judges by documents and explains itself (#336) | V07-256 |
| `d88c813157` | docs: V07-256 Max topic size Auto by documents | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `f19453646c` | Bump ldaca-wordflow-docs to d6ce619 (Max topic size Auto help) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `dc3c2fbd6d` | docs: V07-255 code example no longer reads as a broken link (CI #330) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `81a02ffd77` | Tool caches: choose the lock by sys.platform so ty passes on Windows (CI #331) | V07-254 |
| `f3c00f823c` | Topic chart: highlights match All Topics; never waits to measure bubbles (#337) | V07-257 |
| `58953a7159` | docs: V07-257 topic chart fix | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `8118cf86f7` | Download closed Projects safely; Project, not Workspace, in messages (#338) | V07-258 |
| `43b7063249` | docs: V07-258 Project in use by another Wordflow | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `7c8626f215` | Tokeniser picker: Plain words is for any language with spaces (#339) | V07-259 |
| `6f06019c07` | docs: V07-259 Plain words for any spaced language | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `25dfc23921` | Bump ldaca-wordflow-docs to e506ce3 (Plain words help) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `440b827be5` | Topic Modelling embeds on every processor it may use (#341) | V07-260 |
| `1aaecf58cb` | docs: V07-260 embedding threads | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `6cdf710fd7` | Find topics: show matched words bold orange in topic lists and word cloud (#342) | V07-261 |
| `ae669d2ebb` | docs: V07-261 Find topics match highlighting | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `ebdda3a9c3` | fix(wordcloud): clicks on a word inside another word reach that word (#343) | V07-262 |
| `20f3f0ed88` | fix(concordance): Ignore punctuation is on when a word opens Concordance (#344) | V07-263 |
| `fc8a2457e7` | fix(graph): readable Fit view and a compact layout when zoomed out (#345) | V07-264 |
| `dda03352ca` | fix(trends): the chart says what it counts; plain tooltips (#346) | V07-265 |
| `7e20ba26dc` | fix(concordance): Preview says how many of all documents it checked (#347) | V07-266 |
| `0bfb6479b6` | fix(wording): old terms in tooltips and hints (#349) | V07-265, V07-267 |
| `e73353c3a1` | chore: lint and knip fixes for #345 and #347 | V07-264, V07-266 |
| `fd3bd05f0b` | feat(data-editor): corpus overview of a text column (#327) | V07-268 |
| `a5ba2a5320` | docs: V07-262 to V07-268 and 0.7.11 release notes for the Monika fixes, wording sweep and corpus overview | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `9e61666cad` | Bump ldaca-wordflow-docs to ad972c0 (0.7.11 help: graph, Trends, Preview, Overview) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `930d49609e` | feat(progress): real step progress for slow runs, shown in Tasks (#350) | V07-269 |
| `9e7dbf4163` | fix(ldaca): the full import reads each item's text by the standard terms (#351) | V07-270 |
| `d5c9992699` | feat(download): save result tables directly with the download icon (#352) | V07-271 |
| `aecb99c105` | docs: V07-269 to V07-271 and 0.7.11 notes for step progress, LDaCA item text and direct downloads | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `0950b8f4ae` | Bump ldaca-wordflow-docs to eaf612d (0.7.11 help: progress, LDaCA items, downloads) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `4a8e82854e` | Require polars-text 0.6.5 (progress_path, #350) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `dd9de3d735` | feat(topic-modeling): show a topic's example texts beside the list (#353) | V07-272 |
| `40d3b289a9` | feat(topic-modeling): current segment bold in the topic colour in the document window (#353) | V07-272 |
| `e65e57e85e` | docs: 0.7.11 release note, V07-272 migration entry and docs pointer for Topic Modelling examples (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `362d916c0d` | feat(topic-modeling): drag the divider between the topic list and examples (#353) | V07-272 |
| `c34062757b` | docs: bump docs pointer for the topic list divider (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `b3fc0f491a` | docs: V07-272 records the topic list divider (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `2eedd431f8` | feat(topic-modeling): topic words under the document window title (#353) | V07-272 |
| `56930f810b` | docs: bump docs pointer for the document window topic words (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `8de3728a0c` | feat(topic-modeling): document window colours the current segment, topic words bold italic (#353) | V07-272 |
| `995c3d4cff` | docs: V07-272 and docs pointer for the document window highlighting (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `b62f81c16d` | Require polars-text 0.6.6 (topic segment similarities, #353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `d9d131b361` | fix(topic-modeling): document window tints the current segment, keeps normal text (#353) | V07-272 |
| `962339002b` | docs: V07-272 and docs pointer for the document window tints (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `9bc90f96ea` | feat(topic-modeling): Data Block name in its colour on example cards (#353) | V07-272 |
| `59f2ba9f87` | docs: V07-272 records the coloured Data Block name (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `cc361cfd0d` | fix(topic-modeling): Label shows "(no column)" for an empty value (#353) | V07-272 |
| `1955391f87` | fix(topic-modeling): Label offers only columns every Data Block has (#353) | V07-272 |
| `9c67843bff` | docs: Topic Modelling help screenshots and text for topic examples (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `21344f73cd` | docs: V07-272 Label rules and docs pointer with new help screenshots (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `c93a998f4b` | feat(topic-modeling): example cards keep the Data Block name; Label replaces the row (#353) | V07-272 |
| `65a348f33e` | docs: V07-272 label format and docs pointer (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `616531d348` | refactor(topic-modeling): Data Block colours for example cards come from topicCorpusColors (#353) | V07-272 |
| `66c0dd1f62` | fix(topic-modeling): topic words line fades instead of an ellipsis (#353) | V07-272 |
| `5f9b068eb9` | docs: V07-272 records the fading words line (#353) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `6bba318925` | feat(data-editor): Delete columns shows each column's first value (#354) | V07-273 |
| `0b2c1310fe` | docs: V07-273 migration entry and draft notes for the next 0.7.x update (#354) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `cc97bc96b1` | feat(results): document column recommended but optional in Add to Project and Download (#355) | V07-274 |
| `9acd0a880d` | docs: V07-274 migration entry and draft note for the optional document column (#355) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `9d8452b2d7` | fix(results): short generated-column labels, full explanation in a tooltip (#356) | V07-275 |
| `3d21763ca6` | docs: V07-191 notes Alex's case-sensitive Tokens question for later (#272) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `116aa0c2eb` | fix(export): a double-clicked Data Block is added straight away (#357) | V07-276 |
| `1c672741c2` | docs: V07-275 and V07-276 migration entries and draft notes (#356, #357) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `7366fd5afd` | feat(guidance): Turn off hints walks people to the setting (#358) | V07-277 |
| `3a591de95b` | feat(tabs): multi-tab on by default, with a hint and a walk to turn it off (#359) | V07-278 |
| `eee6945725` | docs: V07-277 and V07-278 migration entries and draft notes (#358, #359) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `054a9ac73e` | Suggestions: reminders when a result or run looks off (#360) | V07-279 |
| `72472e4e3e` | Records: V07-279 Suggestions, rule R13, v0.7.12 notes (#360) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `932979f679` | Settings walks: outline the gear, no dimming, close on a click elsewhere (#360) | V07-279 |
| `95a1ecae5d` | Records: V07-279 gear step outline and click-away (#360) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `df7a3c1601` | Suggestions: typing does not fade them; large input returns with new numbers; pulsing outline (#360) | V07-279 |
| `a4c3f8558e` | Settings walks: the tab and the option pulse like the gear (#360) | V07-279 |
| `69e04cd28b` | Records: V07-279 follow-ups (typing, large input returns, pulsing walk steps) (#360) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `ff30b5fb50` | Topic Modelling notes: grey facts when a suggestion gives the advice; softer first-run time (#360) | V07-279 |
| `523b107726` | Suggestions: outline lasts as long as the card; no Show me; never pulse Clear or Stop (#360) | V07-279 |
| `5a09729c9c` | Switch Project help tooltip opens to the left, clear of the Settings gear (#360) | V07-279 |
| `7b2c37dc3a` | Help tooltips close when the pointer leaves the icon; Switch Project help opens below (#360) | V07-279 |
| `f1e349bde1` | Suggestions: giant topic judged in segments; slow first steps suggest fewer documents (#360) | V07-279 |
| `dbfc18804d` | Hints outline their target: still for an area, pulsing for a button (#360) | V07-279, V07-283 |
| `c1dc7f1a20` | Records: V07-279 and R13 follow-ups (outline rules, notes, giant-topic units, hints) (#360) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `3f35a50448` | Hints: clear every leftover outline mark, not only the last one set (#360) | V07-283 |
| `82b07591d3` | Help: Text with No topic, and an informal Max tokens benchmark appendix (#360) | V07-280, V07-281 |
| `a19931225b` | Records: V07-280 Topic Modelling help (No topic, benchmark appendix) (#360, #361) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `b4077efddc` | Project graph: Data Blocks can no longer be dragged (#363) | V07-282, V07-286 |
| `4caf0f455f` | Topic Modelling: Ungrouped bubble, list entry and summary; no more silent loss (#362) | V07-281 |
| `d581bbdce2` | Hints never dim or block the page; clicking the pointed button counts as Got it; no chain (#364) | V07-283 |
| `dac202bd6a` | Records: V07-281 Ungrouped, V07-282 no dragging, V07-283 non-blocking hints (#362, #363, #364) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `2f4c46d080` | Suggestions: no "Clear the results first"; topic sizes can be changed after a run (#360) | V07-279 |
| `401d22ae37` | Many-Ungrouped suggestion: softer, says settings change it only a little (#362) | V07-279 |
| `d884140e52` | Hints: using a control inside the outlined area counts as Got it (#364) | V07-283 |
| `31fae6e261` | Format nudges.ts after the shorter suggestion messages (#360) | V07-279 |
| `802fb38c61` | Suggestions: Max topic size both ways with their cost, and Learn more links (#361) | V07-284 |
| `7dcb4ba2ff` | polars-text 0.6.7: Auto keeps a split whenever it finds more topics (#361) | V07-284 |
| `2389be0a19` | Records: V07-284 Auto max topic size (polars-text 0.6.7) (#361) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `7f477d4781` | Help: Min topic size 3 in the benchmark appendix (6.8 hours, 9,675 topics, 16% Ungrouped) (#362) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `afc798bea2` | Project graph: no zoom on double-click, so double-click only adds a Data Block (#363) | V07-286 |
| `f175ca26f3` | Ungrouped size chip in the Topic list is grey, like its bubble (#362) | V07-287 |
| `15031d3343` | Suggestions: Dismiss on every suggestion; "Many (37%) documents are Ungrouped" (#360) | V07-285 |
| `9a78dcc9fa` | Suggestions: bring the outlined settings into view when a suggestion appears (#360) | V07-285 |
| `b97af1759f` | Topic Modelling: say why Colour by is unavailable instead of hiding it (#365) | V07-288 |
| `9d45e10def` | Records: V07-285 to V07-288 (#360, #363, #362, #365) and v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `f5391da14d` | Topic Modelling: name Topics (#366) | V07-289 |
| `0f35698075` | Topic Modelling: the latest selected Topic goes to the top of the Selected group (#367) | V07-290 |
| `5c8d329297` | Version 0.7.12; records V07-289/290 (#366, #367) and release notes summary | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `5c44774eff` | Suggestions: the many-Ungrouped suggestion says what to do (#360) | V07-291 |
| `a7b070846a` | Topic names: leave empty name fields out of saved records (#366) | V07-292 |
| `cec6a234e6` | Records: V07-291/292 (#360, #366); v0.7.12 notes: suggestion wording, older versions | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `fb4d4dee1d` | Data Editor: Map values tool (#368) | V07-293 |
| `2f581c5585` | Records: V07-293 Map values (#368); v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `ab853f1b8b` | Topic Modelling: Colour by follows Data Block edits, such as a new category order (#369) | V07-294 |
| `c99d7a1143` | Records: V07-294 (#369); v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `72cdd7abed` | Map values: Apply waits until a new value is typed, also after Apply (#368) | V07-295 |
| `99b9136bfc` | Records: V07-295 (#368) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `4e2c8fb09e` | AI annotation: step progress, time left and liveness like Topic Modelling (#370) | V07-296 |
| `66f18bf46d` | Records: V07-296 (#370); v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `f51e236cbc` | AI annotation: keep returned labels in a temporary Data Block; send each distinct text once (#371) | V07-297 |
| `106c8a8c0e` | Records: V07-297 (#371); v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `e547f2a26d` | Concordance: Text mode uses no tokeniser and shows None (#372) | V07-298 |
| `8130719dae` | Records: V07-298 (#372); v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `0026d43902` | Records: V07-298 wording | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `56c4ade69b` | Results tables, part 1: Concordance columns reorder by dragging; Show metadata filter (#373) | V07-299 |
| `89698a0aa1` | Results tables, part 2: Quotation columns reorder by dragging (#373) | V07-299 |
| `e7d8258a8f` | Results tables, part 3: Annotation tables reorder by dragging; help (#373) | V07-299 |
| `ba26b5ba25` | Records: V07-299 (#373); v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `4b4ea67006` | Map values test: pass a dtype instance (ty in CI checks tests too) (#368) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `2f51deb1c0` | Removing a Data Block no longer shows an error toast (#374) | V07-300 |
| `e540dcaf45` | Annotation: nudge to annotate only empty rows after writing saved labels; no Clear after a stopped run (#375) | V07-301 |
| `b07d699cc4` | Records V07-300/301 (#374, #375) and v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `ab87f005b2` | Annotation Run: retry timeouts, Requests at once, Thinking switch for Custom providers, empty rows by default (#376, #377, #378, #379) | V07-302, V07-303, V07-304, V07-305 |
| `25314ff371` | Records V07-302..305 (#376-#379) and v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `c1594d7216` | Annotation Preview keeps page labels with the Tab; Thinking help (#380) | V07-306 |
| `7f3a3c9dfb` | Records V07-306 (#380) and v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `77ba768cc9` | Quotation Run: several processes, results as they come, Stop keeps the result, resume (#381) | V07-307 |
| `12eb335484` | Records V07-307 (#381) and v0.7.12 notes | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `e68e31e635` | Quotation Run follow-ups: first rows sooner, Resume, clearer stop and progress wording (#381) | V07-308 |
| `8e75d49bc0` | Records V07-308 (#381 follow-ups) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `7a07524413` | v0.7.12 release notes: highlights | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `401fbec3ad` | Docs mirror 65dda25 (release 0.7.12; docs tag v0.7) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `bc1eecdd65` | Migration report: release 0.7.12 (Changes in 0.7.12, R14, label changes, reference v0.7.12) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `c54fdd0a84` | Branch record: rules R8 to R12 in the summary list | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `db48dc2005` | Quotation parts are flushed through a writable handle, so Windows keeps them (#381) | V07-309 |
| `bcc5e13972` | Records V07-309; migration report points at the release commit db48dc20 | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `7bc61bdd0c` | Quotation results so far: page numbers and Next work while the Run goes (#382) | V07-310 |
| `e7eb7d2ec6` | Records V07-310 (#382), v0.7.13 notes; 0.7.12 table complete, release date 12 Oct | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `d539cd6590` | Check for Updates names the installed version and shows its release notes (#383) | V07-311 |
| `29b03b240f` | macOS Help menu search finds Wordflow's help; Help > Wordflow Help (#384) | V07-312 |
| `73fdad2cf5` | Version 0.7.13 (hotfix of 0.7.12); notes cover everything since 0.7.10 | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
| `e8c2479594` | Records V07-311, V07-312 (#383, #384) | Documentation / tests / release or legacy dependency maintenance; no additional native runtime feature |
