<!-- markdownlint-disable MD033 -->

<h2 id="info-annotation-overview">About Annotation</h2>

Annotation assigns a controlled label to each text row. Use it to build reviewed
training data, apply a Codebook consistently, compare coders or models, and keep
the labels beside the source text in the same Data Block.

Wordflow supports two workflows:

- **Manual** annotation opens an editable table. Changes remain drafts until
  **Save**; **Cancel** discards them.
- **AI** annotation uses a configured provider and model. Preview predicts
  labels without writing them; Run writes labels to the selected annotation
  column as each completed batch arrives. Eligible exact texts are processed once
  per Run, with each returned label applied only to eligible source rows.

New tabs default to **Only rows without annotation**. Completed labels remain
after Stop, failure, Clear, tab deletion or reopen. Provider timeouts are fatal;
Wordflow does not retry an uncertain timeout. Preview remains fresh and temporary.

Both workflows use one Annotation Data Block, its text and annotation columns,
and one Codebook Data Block containing allowed codes and descriptions. An
optional Example Data Block can supply reviewed examples to AI runs.

AI output is a proposal, not ground truth. Review differences and corrections,
check ambiguous or underrepresented codes, and interpret reliability measures
in the context of the task. Provider calls may incur cost and send the selected
text, Codebook, prompt, and examples to the configured service.

Provider connections are managed under **Settings → AI**. Their provider type
and Custom base URL stay fixed, while the display name and saved API key can be
edited. Keys are optional: a keyless built-in remains visible but cannot list
models or run Annotation until a key is added; a Custom endpoint may be
keyless. Removing a connection does not remove completed Run output, but
Preview pages and future requests still need it.

Failures retain the original provider diagnostic beside the responsible form or
result. A fatal Run failure keeps batches already committed to the source Table.
An irreducible failed prediction keeps that row's previous label and is included
in the completed report's failed counts. Credentials are not stored in analyses.

Save or cancel manual drafts before changing workflows or downloading results.
**Clear results** removes the AI report and temporary Preview; it does not erase
labels already committed to the source Table.
