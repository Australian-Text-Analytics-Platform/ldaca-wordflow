# Local quotation runtime

The native implementation lives in `ldaca-rs` with the quotation Cargo feature.
`polars-text` 0.8.0 adapts its results to Polars. The implementation statically links
UDPipe 1.4.0. The English EWT UD 2.5 (191206) model is loaded separately. There is no spaCy,
rust-bert, NER, coreference, legacy fallback, or language selector.
The active native application restores the built-in English engine only.
Archived remote-engine contracts are not active endpoints.

| Artifact | SHA-256 |
| --- | --- |
| `english-ewt-ud-2.5-191206.udpipe` (16,309,608 bytes) | `784bd0fa85e3d831fd02a55290d0acfd05c953159dc38cc33d52e1b28add9957` |
| Official `udpipe-1.4.0-bin.zip` | `457f541e204737d354c749b473060a28b2debf625f23075543d9eba78be016c1` |

The backend downloads the model from the [LINDAT bitstream](https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/handle/11234/1-3131/english-ewt-ud-2.5-191206.udpipe).
The native backend verifies its checksum before loading or installing it. Downloads
have a 32 MiB bound and 120-second timeout, support cancellation and install through
a destination-adjacent synchronized temporary file. A failed download never
replaces a valid cached model. Each execution owns its extractor, prepared before
the database operation; source documents remain local.

Default cache roots are `~/Library/Caches` on macOS, `LOCALAPPDATA` on Windows,
and `XDG_CACHE_HOME` (or `~/.cache`) on Linux, under
`au.edu.ldaca.wordflow/udpipe/`. `WORDFLOW_QUOTATION_MODEL` selects an explicitly
provisioned file with the same checksum. An invalid override fails explicitly.
Saved results do not need the model. Ordinary tests do not download it; provisioned
native/API/E2E tests use that override, and library/adapter acceptance uses
`WORDFLOW_TEST_UDPIPE_MODEL`.

The model is attributed to Straka and Straková, *UDPipe 1 models for Universal
Dependencies 2.5*, [LINDAT](https://hdl.handle.net/11234/1-3131), under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): attribution,
non-commercial use and share-alike. Non-commercial use is accepted for this
migration. Model weights are external to wheels and source distributions.
UDPipe source is MPL-2.0. Adapted Gender Gap Tracker quotation rules and reporting
verbs retain their MIT attribution. The polars-text distributions include notices.

Direct, indirect, according-to, floating and heuristic extraction remain available.
UDPipe tokenization and dependency predictions can change detection, speakers,
token counts and quotation boundaries. Preview and new Run All results use this
engine; saved results remain readable without rewriting. Original source spelling,
accents and quotation marks are retained in all returned spans.
