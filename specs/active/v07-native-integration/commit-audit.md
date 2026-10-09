# Pinned v0.7 commit audit

The comparison contains **312 commits** from `aaea1c3b3181b9d8f7412c7ee23b1cc9658f2d20` to `3cd4deda4f673f47d17dc2112830283792a5a0f9`.
The [pinned v0.7 report](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/blob/3cd4deda4f673f47d17dc2112830283792a5a0f9/docs/releases/v0.7-to-v0.8-migration-instructions.md)
associates the 232 numbered entries with 259 unique commits in that range. The
[decision register](decisions.md) records their approved native behavior and
verification. The 53 remaining commits are listed below. Their changed paths and the
non-documentation diffs were inspected in the original review and re-enumerated
from the pinned Git objects during implementation.

The three test-only changes alter mocks or typing in retired Python/frontend
paths. Release commits only update versions, lock entries and release notes.
Documentation and screenshots are adapted to the approved native behavior rather
than copied with obsolete architecture, publication or slider instructions.
No native version downgrade, retired dependency restoration or extra runtime
feature is required.

Categories: 40 documentation, 3 published documentation pointer, 3 test maintenance, 5 version and release bookkeeping, 2 help screenshots and text.

| Commit | Subject | Classification | Disposition |
| --- | --- | --- | --- |
| `4d8198cc8bed4379a76f8272f0e9846056d2bc5a` | docs: v0.7 branch change report and v0.8 migration instructions | Documentation | No additional runtime feature |
| `f6b42c1b13c73996adb08220e4c1f71d0c9777dd` | docs: add #213 (Safari chart lines) to the v0.7 change report and v0.8 instructions | Documentation | No additional runtime feature |
| `77159850b8efe33691ca43a953a29dbf2ebe6978` | docs: v0.7 change report and v0.8 instructions updated for the final #213 fixes | Documentation | No additional runtime feature |
| `6582315f6de506fb79883c65acfa31848694bd4f` | docs: v0.7 change report gains a Latest updates section; follow-ups refreshed | Documentation | No additional runtime feature |
| `b18bbf69c01df663659b895accd2bf9ba436c5c7` | Bump ldaca-wordflow-docs to the republished v0.7 docs (eb27321) | Published documentation pointer | No additional runtime feature |
| `8b6d4819dc5bc618d4dbdf7100bc50e6a1179edb` | Test: stub toast.error and toast.success in the Data Builder test | Test maintenance | No additional runtime feature |
| `b1b23e78f0d0ce6da23927bfff597080886c2244` | v0.7 handover docs: add #214 (title bar tint) and #215 (Cmd + scroll zoom) | Documentation | No additional runtime feature |
| `ba62faad9a127afd6785531c9b34613167fbf8f4` | v0.7 handover docs: add #217 (Data Editor tools stay open) and #218 (active tab in view) | Documentation | No additional runtime feature |
| `b1fa2e5b7e33a51df2ab047d6e7deb7e2a415d4e` | v0.7 handover docs: add #219 (Trends Normalise to 100%) | Documentation | No additional runtime feature |
| `538cc853bb23573294eb2334bb4c7a6d99c75649` | v0.7 handover docs: add #220 and #221 (Japanese text in Concordance) | Documentation | No additional runtime feature |
| `afe659afc8f47d5bf4d0b4af6477bca2a361f116` | v0.7 handover docs: add #224 (Select range removed) and #225 (bar fitting) | Documentation | No additional runtime feature |
| `3aacfd9402fd2c1dc87bf9e18df1a3a3795f9c81` | v0.7 handover docs: add #226 to #228 | Documentation | No additional runtime feature |
| `d200d505739ebb806a0a47f16bf76f081a32cd53` | v0.7 handover docs: add #229 (v0.5-MB help revisions) | Documentation | No additional runtime feature |
| `65299bdea6024aa86a0e6f1f7385dc5369b807aa` | v0.7 handover docs: add #230 (Clean text keeps the applied operation) | Documentation | No additional runtime feature |
| `835ae0614e35ed4e9ae4e1558cd9bcc0c4bc6ed9` | Release 0.7.8 | Version and release bookkeeping | No additional runtime feature |
| `05a3e94269f8f59e763c9d892505e6fa5590e0cd` | Test: type the recorded failures with the diagnostic field | Test maintenance | No additional runtime feature |
| `37eb1878e6248720c80ea99d5d7cda6dc92893e1` | Release notes and v0.7 handover docs: Windows fixes #231, #232 | Version and release bookkeeping | No additional runtime feature |
| `22ef4c9b1c4ee439b6095bfde10f25f782458ee1` | v0.7 handover docs: #233; Planned for v0.8 (Code designer #53, deduplication #234) | Documentation | No additional runtime feature |
| `e0f215edc48b1eccfa4ffca6337d4345fd89323e` | v0.7 handover docs: add #235 (Tasks panel naming and import outcomes) | Documentation | No additional runtime feature |
| `3b0ef7ab263726ed4fbb177641d8e7472febe43e` | v0.7 handover docs: add #236 (no file size limit), #237 (sample seed), #238 (stop words switch) | Documentation | No additional runtime feature |
| `227793d03c3222ceeed1a2a792886f759457dabc` | v0.7 handover docs: add #239 (Concordance table offsets) | Documentation | No additional runtime feature |
| `2bc91c2987111a05d664cd3a5bab7c9f80842494` | v0.7 handover docs: correct the commit count (209) | Documentation | No additional runtime feature |
| `f5e2832054d7897dfe5c1dcc7990b8c1905e6390` | v0.7 handover docs: #237 now uses the Seed as given | Documentation | No additional runtime feature |
| `53fcfaa981282574199194832aff5cf551b6c81f` | v0.7 handover docs: add #241 (Concordance context sorting) | Documentation | No additional runtime feature |
| `593484c717ff5598039d666e16e039be2fd787e1` | v0.7 handover docs: add #242 (L1/R1 as coloured text) | Documentation | No additional runtime feature |
| `843f644b0520e9d3cfa7456179c5a9b3beb6bf50` | Release 0.7.9 | Version and release bookkeeping | No additional runtime feature |
| `5664efc2a257b82934bc83a8b7a03baccf70606a` | v0.7 handover docs: add #243 to #247 | Documentation | No additional runtime feature |
| `fd18a3659a08febd3055aac577e9848a4bf4c6d9` | v0.7 handover docs: add #248 (upload limit) | Documentation | No additional runtime feature |
| `f56e8a60fe75be178363069e13d7cad3ee8b6653` | v0.7 handover docs: add #249 (Update access token opens Settings > Portal) | Documentation | No additional runtime feature |
| `ba5730bf0964d3fee848919b40d8533ea03afa15` | Release 0.7.10: bump the version, relock, and add the release notes | Version and release bookkeeping | No additional runtime feature |
| `80f78e7855f9f3586f243413cf18076a262707d6` | Help screenshots: Trends ? icons, and searching a tool's own Result again | Help screenshots and text | No additional runtime feature |
| `c4a512240deea891e1ce8eb1627b20ed0bff4e1f` | Bump ldaca-wordflow-docs to 7807b06 (v0.7 docs for release 0.7.10) | Published documentation pointer | No additional runtime feature |
| `b411079aab88c6fc2f6086ea722044ce4ad446ed` | v0.7 handover docs: refresh to c4a51224 (release 0.7.10, 180 changes) | Documentation | No additional runtime feature |
| `1b313a4912b8bd079e631c0ba54385a1922bb141` | Bump ldaca-wordflow-docs to d05638d (v0.7 docs, Help wording) | Published documentation pointer | No additional runtime feature |
| `baadffa445e8817c9d4c723fe5846a6061ad2165` | Release notes 0.7.10: light theme contrast and the Help window changes | Version and release bookkeeping | No additional runtime feature |
| `64a538e45a45c471a71ff12405a3c8b5aafdc1a1` | v0.7 handover docs: add V07-181 (#262 Help window) and V07-182 (#263 light theme), range to baadffa4 | Documentation | No additional runtime feature |
| `26bee1a901e24953c389f2ef7ee0f691915f1822` | v0.7 handover docs: add V07-183 (#264 desktop Help and the docs channel) | Documentation | No additional runtime feature |
| `20718e14326f2f934c29b055cea1d2b443840197` | v0.7 handover docs and 0.7.10 notes: V07-184 to V07-193 (#266 to #274) | Documentation | No additional runtime feature |
| `d06cb662761b0f911f545d2f97174d9d0b4b65c1` | v0.7 handover docs and 0.7.10 notes: V07-194 (#275), V07-193 corrected | Documentation | No additional runtime feature |
| `ebad094959bcf2edf4255207d64b7176efe80130` | Backend tests: satisfy ty in the Tokens-mode and sort-key tests | Test maintenance | No additional runtime feature |
| `436b8fab78d979f7d9665c3759ff4d708a477091` | v0.7 handover docs and 0.7.10 notes: V07-195 (#276), V07-196 (#277) | Documentation | No additional runtime feature |
| `6e08a2b333173b9cb079f52980e86a18843360bb` | v0.7 handover docs and 0.7.10 notes: V07-197 (#278 interactive HTML charts) | Documentation | No additional runtime feature |
| `b818821dce782acc7fadef61e3c388442dba4f5a` | v0.7 handover docs and 0.7.10 notes: V07-198 (#279), V07-199 (#278 Trends header) | Documentation | No additional runtime feature |
| `eef82952a69ae20165177ccc50c49ee8583ae5cd` | v0.7 handover docs and 0.7.10 notes: V07-200 (#280 topic search) | Documentation | No additional runtime feature |
| `f5afa54b3a839106532025d9ffe6defeac3a1f7e` | v0.7 handover docs and 0.7.10 notes: V07-201 (#281), V07-202 (#282) | Documentation | No additional runtime feature |
| `befd065172830f75cd32159a84eda9ea1b2a2bdf` | docs: record the 2026-10-04 audit fixes (V07-203 to V07-224) and 0.7.10 release notes | Documentation | No additional runtime feature |
| `903a42b3ca6e4bc121216de79680deb267adfe96` | docs: chart download Help matches the 0.7.10 downloads | Help screenshots and text | No additional runtime feature |
| `76228958df648f267dcbf7969a9fd4e66e6527fa` | docs: record V07-225 (#306 Topics slider focus and delayed keyboard apply) | Documentation | No additional runtime feature |
| `bd6c9ce18c33b75ea7f7762752eb1bb5f7fceeb9` | docs: Topics slider keyboard use in Topic Modelling Help (#306) | Documentation | No additional runtime feature |
| `4c187411c93dedd31d525c9bdb38a58d5d258540` | docs: record V07-226 (#307 topic size percentages); 0.7.10 notes for #306 and #307 | Documentation | No additional runtime feature |
| `6d47243d5b57d883ad827fa61b7e49e1a2479214` | docs: record V07-227 (#308 bubble map shape); 0.7.10 notes | Documentation | No additional runtime feature |
| `b8371ba94c04c78d688046a31353ae156082c7fc` | docs: record V07-228 (#277, #311 range filters) | Documentation | No additional runtime feature |
| `3cd4deda4f673f47d17dc2112830283792a5a0f9` | docs: 0.7.11 release notes; record V07-229 to V07-232 (#312, #295, #310, #309) | Documentation | No additional runtime feature |
