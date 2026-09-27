<!-- markdownlint-disable MD033 -->

<h2 id="info-token-frequency-overview">About Frequency Analysis</h2>

Frequency counts tokens in one or two text collections. A token is often a word, but the exact split depends on the selected tokenizer: punctuation, hyphens and contractions can be handled differently. Choose a tokenizer for each selected text column. Automatic language recommendations help with that choice without overriding your explicit selection.

Word clouds provide a quick visual impression. Ranked lists retain exact counts and are better for checking numerical differences. Clouds display 50 tokens by default, with a maximum of 100; the complete vocabulary remains saved in the project.

Raw counts depend on corpus size. With two collections, the reference/study comparison supplies relative frequencies and keyword statistics to help distinguish unusually frequent tokens. Juxtorpus combines both frequencies into word sizes and uses colour to show their relative association with each corpus.

Select a reusable stopword Data Block and column in Results, or create an empty Table. Edit words opens removable word bubbles: type and press Enter, or paste a list. Language presets put recommendations first. Editing a View's words copies its selected column into a new Table. The ordinary Table editor is available from the node menu. Shared-list changes update displays without rerunning Frequency.

Stopwords and wildcard filters control which saved tokens you see. They do not change the stored counts or recompute the statistics. The filter applies before display limits and also applies to table downloads, which include all matching rows rather than just the visible page.

Each named analysis tab stores its latest successful result inside the `.wfpj` file. Failed or cancelled runs preserve that result. Input changes remain local drafts until a successful run; saved results remain readable if the original Data Block changes or is removed. Only a new explicit Run reads the current source again.

Download tables as CSV or Markdown and clouds as PNG, JPEG or SVG. Bundled downloads can include stopword text. Native exports use a file chooser; accepted work continues through Tasks. Frequency does not currently open Concordance from a word click because that analysis has not yet been restored.

For the complete workflow, see the [Frequency tutorial](../tutorials/token-frequency.md). Background material is available in the [ATAP text-analysis methods collection](https://www.atap.edu.au/text-analysis/methods/) and the [legacy keyword-analysis notebook](https://github.com/Australian-Text-Analytics-Platform/keywords-analysis). Use the application's Feedback action to contact the Wordflow team.

The filter, display mode, limits and statistics sorting are window-local and reset on reload. Colours and stopword source selection are saved. Table downloads read current stopwords; chart downloads use the displayed chart and its matching word list.
