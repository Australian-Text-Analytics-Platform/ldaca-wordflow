# Local quotation runtime

Wordflow uses polars-text 0.8.0 with the quotation Cargo feature, statically linked
UDPipe 1.4.0 and the English EWT UD 2.5 (191206) model. There is no spaCy,
rust-bert, NER, coreference, legacy fallback, or language selector.
Remote engines retain the existing strict v2 contract.

| Artifact | SHA-256 |
| --- | --- |
| `english-ewt-ud-2.5-191206.udpipe` (16,309,608 bytes) | `784bd0fa85e3d831fd02a55290d0acfd05c953159dc38cc33d52e1b28add9957` |
| Official `udpipe-1.4.0-bin.zip` | `457f541e204737d354c749b473060a28b2debf625f23075543d9eba78be016c1` |

The backend downloads the model from the [LINDAT bitstream](https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/handle/11234/1-3131/english-ewt-ud-2.5-191206.udpipe).
[Storage ownership](../domain/files-and-storage.md) defines its cache and publication.

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
