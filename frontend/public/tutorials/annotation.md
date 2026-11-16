<!-- markdownlint-disable MD033 MD041 -->

[← Back to Help home](./index.md)
<h1 id="help-annotation-section">Annotation</h1>

Use Annotation to apply one of the codes in a Codebook to each source row,
either directly or with predictions from a configured AI provider.

<h2 id="help-annotation-setup">Set up the source and Codebook</h2>

1. Under **Annotation Data Block**, add one Data Block and choose the text
   column.
2. Under **Annotation column**, select an existing text column, or choose
   **Start new annotation** and name a new, empty column. This is an immediate
   Data Block Edit.

   ![Create annotation column dialog](tutorials/assets/annotation/create_annotation_column.png)

3. Under **Codebook**, add a Data Block and map its code and description
   columns. Use **Create new** when you need an empty Codebook, then click
   **Edit** beside **Codes** to add, rename, or remove codes and their
   descriptions before labelling. Drag a code by its grip to change the order;
   the code lists and the Codes card follow it. The
   [AI Code Designer](#help-annotation-code-designer) can draft a first set of
   codes for you.

   ![Edit codebook dialog with three codes](tutorials/assets/annotation/edit_codebook.png)

   Each code should appear once, with its own description. If a code is
   repeated, or two codes share a description, the Codes card and the Edit
   dialog say so and suggest a fix: remove repeated rows, choose one of a
   code's descriptions or merge them, or give each code its own description.
   AI Preview and Run wait until each code has one description.

   AI annotation gives every text one of the codes and never leaves it empty,
   since an empty label means "not coded yet". Keep a code such as **Other**
   for texts that fit none of the rest; without one, the model picks the
   closest code.

   **Task context** (optional, at the top of the Edit dialog) says what the
   texts are and what the codes are for, for example "Posts from a workers'
   forum, 2019 to 2023; the codes record attitudes to working from home". It
   is saved with the Codebook, so it goes wherever the Codebook is used, and
   AI annotation sends it after the **Prompt**, before the codes. In the
   Codebook Data Block it is one row named `__task_context__`; that row is
   never a code.

   Turn on **Ordered scale** when the codes are levels from low to high, such
   as a rating, rather than separate categories. See
   [Ordered scales](#help-annotation-scale).

   The Edit dialog keeps unsaved changes, whether typed or drafted by the AI
   Code Designer, until you choose **Save** or discard them. Closing the
   dialog, pressing Esc or switching to another tab or tool keeps them, and
   the Codes card says so; **Cancel** asks before discarding. They last while
   Wordflow stays open: reloading the page loses them.

4. Use the **Manual / AI** switch to choose a mode. The source and Codebook are
   shared between both modes.

![Annotation setup: source Data Block, annotation column, Codebook, and the Manual / AI switch](tutorials/assets/annotation/setup.png)

<h3 id="help-annotation-code-designer">AI Code Designer</h3>

The AI Code Designer drafts a first Codebook for you to review and tune. It
reads a sample of your texts and a short **Brief**, and suggests codes with
definitions, plus a code named **Other** for texts that fit none of them. When
**Ordered scale** is on, it drafts levels from the lowest to the highest
instead, plus a **Not applicable** code outside the scale. It
also shows how to describe a coding task to an AI model in plain language. It
works in both Manual and AI mode, and it only drafts: the thinking and the
checking stay with you.

1. In the Edit dialog, write the **Brief** above Task context: what you want
   to find out, as a research question, hypothesis or aim, in up to 250 words.
   Task context, if you have one, is sent too as background. The Brief is kept
   with this tab on this computer and is never sent with annotation.
2. Set **Maximum classes** (2 to 10, default 3). Other comes on top, so the
   default gives at most four codes. The model may suggest fewer. For an
   ordered scale this is **Maximum levels**, with Not applicable on top.
3. Choose **AI Code Designer**. If the Codebook already has codes, a warning
   comes first: the draft replaces them, and starting a fresh Codebook with
   **Create new** keeps them. Choose **Continue** to go on.
4. The designer window says what is sent where. Check the **Provider** and
   **Model**: they start on this tab's AI choice, but you can pick a stronger
   reasoning model for this one request without changing the model used for
   annotation. **Sample size** (default 100, 20 to 300) is how many texts are
   sent, picked at random from the distinct, non-empty texts in the text
   column, each cut to its first 150 words; the same **Sample seed** picks the
   same texts. **Thinking effort** (default High; None turns thinking off)
   applies when the model supports thinking. Turn on **Advanced** at the top
   right to read or change the system prompt; **Restore default** brings back
   Wordflow's. Categories and ordered scales each keep their own prompt.
5. Choose **Design codebook**. The window stays open and shows what it is
   doing and for how long. Thinking models can take several minutes, and
   local models longer; **Stop** cancels the request. A request that runs
   longer than five minutes stops with a message.
6. The draft fills the Edit dialog, marked **AI draft, not saved**. Read
   every code and definition, change what you like, and choose **Save**.
   Saving is one Data Block Edit, so Undo in the Data Editor brings back the
   previous Codebook. The designer never changes Task context.

The model is asked to describe kinds of content in general words, never to
quote your texts or name people, places or organisations that appear only in
them. It may not always comply, so check every definition for real text or
names from your data before saving or sharing the Codebook. Your sample texts
are sent to the AI provider you choose, as they are for Preview and Run.

Once you change the codes by hand and save, the Brief turns grey and the
designer waits: the Brief no longer describes your codes. You can still select
and copy it, and editing it makes it the Brief for the next draft. Saving a
draft exactly as the designer wrote it doesn't do this.

<h3 id="help-annotation-scale">Ordered scales</h3>

Some coding places each text on a scale, such as how urgent, how positive or
how certain it is, rather than sorting it into categories. Turn on **Ordered
scale**, at the top right of the Edit dialog, and the codes become levels: the
first is the lowest and the last the highest. It is a setting of the whole
Codebook: Save writes it into the Codebook, and AI annotation, the AI Code
Designer and Compare to all follow it. Drag a level by its grip to put the
levels in order.

A code for texts the scale doesn't fit, such as **Not applicable**, is not a
level: it is not above the highest level or below the lowest. Mark it with the
**Outside the scale** button (a crossed circle) beside it: the button turns
orange and the code moves under the heading "Outside the scale: the codes
below are not levels". Every code under that heading is outside the scale;
every code above it is a level. Dragging a code among the codes outside the
scale takes it off the scale, and dragging it among the levels makes it a
level. Keep one such code, as categories keep Other: an empty label means "not
coded yet", so a text the scale doesn't fit needs a code of its own.

In the Codebook Data Block the setting is one row named `__scale__`: the codes
above it are the levels, in order, and the codes below it are outside the
scale. Deleting that row makes all the codes categories again.

With an ordered scale:

- AI annotation rates each text against the level definitions on its own, not
  against the other texts sent with it, and gives a text the scale doesn't fit
  a code outside the scale. Examples whose label is not in the Codebook are not
  sent.
- **Compare to** uses weighted Kappa and ordinal Alpha, which count a near
  miss as a smaller disagreement than a far one, and shades the confusion
  matrix by how far apart the codes are. See
  [Reliability statistics](#help-annotation-reliability).
- Write each level so it can be judged from one text alone. Wording such as
  "more than usual" or "above average" asks the model to compare texts it
  cannot see, and the same text can then get different levels in different
  batches. Three to five levels are usually easier to apply consistently than
  many fine steps.

The annotation column stays text, so the levels sort alphabetically in tables
and charts. To sort or plot them in scale order, duplicate the column in the
Data Editor, change the copy's type to **Category**, and put the levels in
order. Names that start with a number, such as "1 Low" and "2 Medium", already
sort in scale order.

<h2 id="help-annotation-manual">Manual workflow</h2>

Choose **Start** to open the annotation table. Select a Codebook value for each
row from its **Select code** list; each change is written directly to the annotation column as a Data Block
Edit. Start captures the source, annotation column, Codebook mapping, and table
inputs. You can edit the setup as the draft for the next table without changing
the open table. Choose **Close** even if that draft is incomplete; the next
Start captures the new setup. Switching modes hides but does not rewrite the
open Manual snapshot.

![Manual annotation table with the code list open for one row](tutorials/assets/annotation/manual_table.png)

Use **Compare to** to add another coder or model. Each comparison starts masked
as `•••` so you can code without seeing how individual rows were coded. Its
header always shows the reliability score (hover or focus it for the method
and the confusion matrix) and the row-filter menu; reveal the column from the
eye button to show its values and difference colours. Removing the filtered
column clears the filter; hiding it does not. Choose the statistic at the top
of the **Compare to** list; see
[Reliability statistics](#help-annotation-reliability).

![Compare to list with the reliability statistic and the columns to compare](tutorials/assets/annotation/compare_to_menu.png)

<h3 id="help-annotation-reliability">Reliability statistics</h3>

The score in each comparison header says how well the two columns agree,
counting only rows where both hold a Codebook code. Reliability statistics
summarise agreement but do not explain why labels differ: read the
disagreeing rows too.

- **Percent Agreement** (%): the share of rows where both columns hold the same
  code. It is easy to read, but two coders who guess still agree some of the
  time.
- **Cohen's Kappa** (κ, the default): agreement corrected for the agreement
  chance alone would give. 1 is perfect agreement, 0 is no better than chance,
  and below 0 is worse than chance.
- **Krippendorff's Alpha** (α): another chance-corrected measure, widely used
  in content analysis. It reads like Kappa. As a rough guide, Krippendorff
  suggests relying on data with an Alpha of 0.8 or more, and drawing only
  tentative conclusions from 0.667 to 0.8.

With an [ordered scale](#help-annotation-scale), rating a text Medium rather
than High is a smaller disagreement than Low rather than High, so Kappa and
Alpha take the distance into account:

- **Weighted Kappa** (shown as κw) gives partial credit for a near miss. A
  disagreement costs the square of its distance in levels (quadratic weights):
  on a five-level scale, one level apart costs a sixteenth of the two ends.
- **Ordinal Alpha** (shown as αo) uses Krippendorff's ordinal distance, which
  also counts how many coded texts lie between the two levels.
- A code outside the scale, such as Not applicable, is not near any level:
  against a level it costs as much as the two ends of the scale.
- Percent Agreement still counts exact matches only.

**Alpha across all coders.** With **Krippendorff's Alpha** chosen and two or
more columns in **Compare to**, the annotation column shows one more score:
Alpha across every coder at once, such as **α 0.907 · 3 coders** (αo on an
ordered scale). Each comparison column keeps its own score against the
annotation column. A text counts when at least two of the coders gave it a
Codebook code, so coders who each coded only part of the texts still count. In
Preview the score covers the page on screen. Cohen's Kappa and Percent
Agreement compare two columns only, so with them chosen the annotation column
shows no score.

Its tooltip shows the coincidence matrix, Krippendorff's way of showing where
several coders agree: code against code, each cell counting the pairs of codes
two different coders gave the same text. The pairs from a text with three codes
count half each, so a text adds as much as it has codes. Agreement runs down
the diagonal in green, and on a scale disagreements are shaded orange as in the
confusion matrix.

The first line of the score's tooltip names the method, such as "Weighted
Cohen's Kappa on an ordered scale" or "Cohen's Kappa on categories", so the two
can't be mistaken for each other. Turning the scale on or off changes the
statistics of earlier Previews and Runs too, as long as the Codebook still has
the same codes. The AI labels themselves don't change: a Run made before the
scale was turned on was asked to classify, not to rate, so run it again to
have the texts rated on the scale.

In the confusion matrix, rows are the column you compare against and columns
are the comparison. Agreement runs down the diagonal in green. On a scale, the
levels come in scale order, then the codes outside the scale, and each
disagreement is shaded orange by how far apart the two codes are: the farther
apart, the darker.

![Confusion matrix of an ordered scale: agreement in green down the diagonal, and disagreements shaded orange by distance on the scale](tutorials/assets/annotation/scale_confusion_matrix.png)

The funnel button in the annotation column header and in each comparison header
opens a filter menu with two independent conditions: **Differs** and a value
radio (**All rows**, **Has value**, **Empty**). On a comparison column, Differs
keeps rows whose label differs from the annotation column; on the annotation
column it keeps rows that differ from at least one selected comparison column.
Conditions combine, so Differs with Has value narrows further, while Empty greys
out Differs because an empty cell never differs. Only one column carries a filter
at a time; setting a filter on another column replaces it. Filtered rows and
counts are calculated before server pagination. Preview has no row filter
because its rows are chosen by the AI request.

![Row filter menu of the annotation column](tutorials/assets/annotation/row_filter_menu.png)

A cell counts as **empty** when it is blank or holds a value that is not a
code in the Codebook (for example `P` instead of `promise`, or a date pasted by
accident). Such values are still displayed, in muted italics, but they never
count as differences, never contribute to reliability, and match **Empty**
rather than **Has value**. Matching is exact after trimming spaces; `Promise`
is not `promise`. Without a Codebook only the blank rule applies.

The table fills the space below the parameters, so dragging the bar between
the parameters and the results shows more or fewer rows. To set the table's own
height, drag its bottom-right corner; double-click the corner to let it fill the
space again. The height is shared by Manual, Preview, and Review, and the table
scrolls inside its frame when a page does not fit.

Drag a column header's grip to move the column; a correction column and its
arrow stay beside the annotation column. The tab remembers the order.

**Compare to** and **Show metadata** are exclusive roles: a selected column is
disabled in the other menu, and **Select all** skips disabled columns. The
active correction column appears in neither menu. Add a correction column when
you want reviewed decisions kept separately, and use metadata columns to retain
useful source context in the table.

<span id="help-annotation-row-viewer"></span>
Long metadata values wrap within their column. To read a whole row, select the
**View row** button (the expand icon, **View the whole row**) at the start of
the row in the Manual, Preview, and Review tables. It opens Row Details with
the full text and every visible column in table order: the annotation (or the
predicted label beside the existing annotation), any correction, Compare to
columns, and metadata. Comparison values stay
hidden until you reveal that column, and the viewer is read-only; use
**Previous** and **Next** to move between rows.

<h2 id="help-annotation-ai">AI workflow</h2>

![AI mode: optional Example Data Block, example sampling, and the provider and model row](tutorials/assets/annotation/ai_settings.png)

Choose a **Provider** (a connection you set up) and a **Model**; both are always shown, since they decide where your text is sent. Provider
credentials stay in Settings and are attached only when the request is sent.
On a Wordflow server, your connections and keys are saved in your web browser,
not on the server, and only for the account you're signed in with: they stay
after you sign out or close the browser, another account signed in on the same
browser can't see or use them, and in a different browser or a private
(incognito) window you need to enter them again. On a shared computer, delete
them when you finish.
Create or edit connections under **Settings → Servers**, in **Generative AI**
(the **AI** tab before 0.7.16). API keys are optional when
saving, but a built-in provider marked **Needs API key** cannot list models,
Preview, or Run until you add one. Custom endpoints may be keyless. Editing
a key updates future requests; a Run already queued or running keeps the key
captured when it was submitted.
A server may also provide its own providers, listed first and marked
**Provided by this Wordflow server**: they need no key and can't be edited, and one
may limit **Requests at once**, so your next Run with it waits until your
current one finishes.
When the provider describes its models (OpenRouter, Google, or a LiteLLM
gateway with model descriptions set), the **Model** list shows a one-line
description under each model to help you choose; the model name is still what
is used.
Models the provider marks as another kind, such as embedding or OCR models on
a LiteLLM gateway, aren't listed: they can't annotate.
A new tab starts with the model last chosen or run with that provider in the
same Project, on this computer. If the Project hasn't used the provider yet,
it starts with the provider's **Default model** from Settings, if you set one,
or the server's default for its own providers. Choosing a model in a Project
never changes the default in Settings.
The rest of the AI settings are advanced: turn on [**Advanced**](./ui.md#help-ui-tool-mode) at the top right of the Annotation parameters to see them, listed under **Advanced settings**. With **Advanced** off, Preview and Run use no Example Data Block, the default prompt, and the default for every setting below; what you had set is kept for when you turn it on again. Choosing **Use as example** beside a correction column turns **Advanced** on.

An **Example Data Block** is optional; if used, choose both its text column and
an existing annotation column containing reviewed labels. Set **Max examples
per code**, then choose **Random**, **First N**, or **Last N**. Random sampling
also accepts a nonnegative seed and defaults to 0. The same Data Block snapshot,
maximum, method, and seed produce the same per-code subset throughout one
Analysis; groups with fewer examples contribute every usable row.

**Advanced settings** also include the instruction prompt, the settings for the
selected provider, and the Run settings. Each provider's settings offer
**Thinking** (the model reasons before it answers; see
[Thinking](#help-annotation-thinking) for when to turn it on) and, where the
model uses it, **Temperature** (lower gives more consistent answers). Anthropic
has no temperature setting.
Below them, the Run settings apply to every provider: **Which rows to
annotate** (**Only rows without an annotation**, the default, or **Annotate all
rows again**), **Rows per request** (at most how many rows go to the model in
each request; long texts go in smaller requests, see
[Long texts](#help-annotation-long-texts)), **Requests at once** (how many
requests Run sends at the same time:
2 for a Custom provider, 10 for the others, kept for each provider), and
**Retries if a request fails**. A server on your own computer usually works on
one or two requests at a time; set **Requests at once** to its own limit, so
requests don't wait in its queue until they time out. Defaults are a good
starting point. Change one setting deliberately, because provider capability,
cost, latency, and repeatability vary by model.

<h3 id="help-annotation-long-texts">Long texts</h3>

Every model can read only so much text in one request, called its context
window and counted in tokens. When the provider tells Wordflow a model's
context window, Preview and Run fill each request with as many rows as fit,
up to **Rows per request**, so long texts are sent a few at a time and short
ones many at a time. A Preview page of long texts may therefore take several
requests. OpenRouter, and Custom providers and servers that report it, tell
Wordflow the window; OpenAI, Anthropic and Google do not.

When the window is not known, each request holds **Rows per request** rows. If
the model refuses a request as too long, Wordflow sends it again in smaller
parts, and uses the window the provider states in its refusal for the rest of
the Run. Lower **Rows per request** if you see this often.

A single text that is too long for the model on its own cannot be annotated:
in a Run its row counts as failed, and the notice names the model and its
context window; in a Preview the page fails with the same message. Wordflow
never shortens a text to make it fit. Choose a model that takes longer texts,
use fewer examples, or split the texts first with **Segment** in the
[Data Builder](./preprocessing.md#help-preprocessing-segment-section).

<h3 id="help-annotation-thinking">Thinking</h3>

**Thinking** is off by default. With it off, the model answers with the labels
straight away, so Preview and Run are much faster and cost less.

Turn it on when the codes are complicated: subtle distinctions, codes that
depend on irony or stance, or descriptions with several conditions. The model
then reasons before it answers, which can make the labels more precise. The
trade-off is cost and speed: the reasoning can take thousands of extra output
tokens per request, which you pay for, and each request takes longer.
**Thinking effort** (low, medium or high) sets how much room the model has to
think; more room can help hard cases and costs more.

To decide, Preview the same rows with **Thinking** off and on, and compare both
with rows you have labelled yourself. Keep it on only if the labels clearly
improve.

Not every model can think. For a Custom provider, **Thinking** off also turns
off the thinking of models that think by default, such as Qwen on oMLX or vLLM;
turn it on if you want them to think.

<h3 id="help-annotation-preview">Preview</h3>

The AI workflow ends with one row of buttons: **Preview**, **Run** (see
[Run and review](#help-annotation-run-all)) and **Clear results** (see
[Results, Clear, and Undo](#help-annotation-results)).

Choose **Preview** to see predicted labels for a sample of rows without writing
to the annotation column. Page through the predictions,
compare them with existing labels, add corrections if useful, then revise the
Codebook, examples, model, or settings when the errors show a pattern.
Pages you have seen are kept with the tab and saved with the Project, so going
back to a page, reloading or reopening the tab doesn't ask the provider again;
a new Preview or **Clear results** removes them. Preview waits as long as the provider
allows; choose **Stop** when you no longer want to wait. After a Preview, the button turns on again when you change a
setting. See [How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h3 id="help-annotation-run-all">Run and review</h3>

Choose **Run** only after Preview is satisfactory. Run uses the same data and
settings as that Preview and writes labels to the selected annotation column. The
Review table reflects the current Data Block and supports the same hidden-first
comparisons, row filters, reliability, metadata, resizable frame, and correction
controls. A reviewed
correction column can also be selected as the Example annotation column for a
later run.

Run sends each distinct text once: rows with the same text, such as repeated
replies or retweets, share one answer, so the provider is asked (and paid) only
once for them. While Run works, **Tasks** shows how many texts are classified so
far, about how long is left, any failed batches, and that the run is waiting for
the AI provider between answers. A slow provider can take minutes per batch; the
run is still alive while Tasks keeps updating.

The labels that have come back are kept as the run goes, in a temporary Data
Block named after yours with *annotation in progress* (the text column and the
annotation column, one row per distinct text). When the run finishes, its labels
go into the annotation column and the temporary Data Block is removed. If the run
stops before that (you click **Stop**, close the tab, Wordflow or the computer
restarts), the temporary Data Block stays, so the labels already paid for are not
lost. The Annotation tab then offers **Write them into the column**, which fills
the rows with those texts and keeps every other value, and **Remove**. After
writing them, it says which rows the next Run sends. With the default, **Only
rows without an annotation**, Run sends only the rest; if the tab is set to
**Annotate all rows again**, it offers **Annotate only the empty rows**. The tab
keeps that choice for later Runs; change it under **Advanced settings** (turn on **Advanced** first). You can
also join the temporary Data Block to your Data Block on the text column
yourself.

A request that times out or finds the provider busy is tried again (see
**Retries if a request fails**). If it still fails, its rows count as failed and
the run goes on. If three requests in a row fail that way, or the provider never
answers, the run stops; the labels that came back are kept as above. Other
provider-wide failures, such as a wrong API key, are shown in Annotation and
Tasks and write no labels.
When only individual rows cannot fit the model's context window (see
[Long texts](#help-annotation-long-texts)) or produce a valid
response, successful rows are published and a warning reports failed rows and
batches. Failed rows keep their existing values in **Annotate all rows again** and
remain blank in **Only rows without an annotation**; a successful explicit empty prediction may still
clear a value.

<h2 id="help-annotation-results">Results, Clear, and Undo</h2>

The download icon above the Annotations table, and above the Review table
after a Run, saves the annotated Data Block (all its columns, with your
codes) as CSV or Excel, without going through the Export view.

**Clear results** removes the tab's Preview and Run results; it does not undo labels
already written to the Data Block. Use **Undo** in the Data Editor to reverse
the latest manual edit, AI write, or column creation. Undo history lasts only
until the Project is closed.

Settings are locked while Preview or Run is working. After a failure or a stop,
you can edit the settings and choose Preview or Run again straight away; the new
Preview or Run replaces the tab's earlier results, so **Clear results** is not needed
first. Tables on screen keep the settings of the Preview, Run or Start that
made them while you edit the next setup. See [How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

Before using labels downstream, sample every code, inspect uncertain or costly
errors, and record who or what produced the labels. Treat AI predictions and
agreement scores as evidence for review rather than proof of correctness.

[← Back to Help home](./index.md)
