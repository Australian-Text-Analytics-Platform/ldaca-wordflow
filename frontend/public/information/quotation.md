<!-- markdownlint-disable MD033 -->

<h2 id="info-quotation-overview">About Quotation Extraction</h2>

Quotation identifies quoted speech, speakers and reporting verbs in English
news-style text using rules adapted from the
[Gender Gap Tracker](https://github.com/sfu-discourse-lab/GenderGapTracker).
The rules were developed for Canadian news. Validate a representative sample
when working with another genre or English variety.

Select one Data Block and its document column. **Preview** calculates only the
requested page from the current source and stays temporary. **Run** processes
distinct exact texts and commits completed batches, including checked texts with
no quotations. Stop or a crash retains completed batches; **Resume** explicitly
skips checked texts under the same extraction configuration.

New results attach to current source rows by exact text and can page by documents
or quotations. Duplicates remain separate source rows. Edited, removed or newly
unprocessed texts do not match; a missing source shows the ordinary engine error.
**Add to Project** creates an independent live View and includes checked empty
outcomes. Historical results retain their snapshot meaning until Rerun.

Quotation, speaker and verb underlines refer to the original text. Context length,
source colour and visible fields affect presentation without repeating extraction.
Preview sorts source columns before paging; saved match rows also support sorting
by generated quotation fields. See the [Quotation tutorial](../tutorials/quotation.md)
for the complete workflow.

<h3 id="info-quotation-licenses">Model and native software notices</h3>

Extraction runs locally. First use downloads the pinned English EWT model;
subsequent use works offline from the per-user cache. Saved results need no model.
The model is **UDPipe 1 models for Universal Dependencies 2.5**, by Straka and
Straková, available through [LINDAT](https://hdl.handle.net/11234/1-3131) under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): attribution,
non-commercial use and share-alike. Model weights are downloaded separately.

Bundled UDPipe source retains its [MPL-2.0 license](./assets/quotation/udpipe-MPL-2.0.md).
The adapted Gender Gap Tracker rules and reporting verbs retain their
[MIT license and attribution](./assets/quotation/quotation-rules-MIT.md).
Remote engines are not available in the native application.

Read the [open access article](https://doi.org/10.1515/cllt-2023-0104) or the
[ATAP overview](https://www.atap.edu.au/posts/quotation-tool/). For help, use the
Feedback button in the sidebar to contact the Sydney Informatics Hub team.
