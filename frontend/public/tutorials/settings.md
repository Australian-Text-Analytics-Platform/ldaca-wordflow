<!-- markdownlint-disable MD033 MD041 -->

[← Back to Help home](./index.md)

<h1 id="help-settings-section">Settings</h1>

Open **Settings** with the gear icon at the top right of the window. It has six
tabs down its left side: **General**, **Portal**, **Servers**, **Project**,
**Views** and **Guidance**. A change takes effect as soon as you make it; there
is no Save button. The question-mark icons in Settings open the matching
section of this page.

Most settings follow your account: they are the same wherever you sign in. A
few are kept on this computer or in this web browser instead, and each section
below says which.

<h2 id="help-settings-general">General</h2>

<h3 id="help-settings-appearance">Appearance</h3>

The switch changes between the **Light 2026** and **Dark 2026** themes. The
interface changes at once and the choice follows your account. See
[Appearance](./ui.md#help-ui-appearance).

<h3 id="help-settings-preference-sync">Preference sync</h3>

This shows what follows your account, with a count of each: your favourite
Projects and the views that are visible. The theme, **Enable multi-tab** and
the two **Guidance** switches follow your account too.

Three things are kept elsewhere:

- AI provider keys and the LDaCA access token are stored separately (see
  [Servers](#help-settings-servers) and [Portal](#help-settings-portal)).
- The Contextual Hints you have acknowledged are remembered on this computer
  (see [Contextual Hints](#help-settings-contextual-hints)).
- **Automatically check for updates** belongs to the desktop app on this
  computer.

<h3 id="help-settings-multi-tab">Enable multi-tab</h3>

When this is on, each analysis tool can hold several tabs, so you can keep
several analyses side by side. It is on by default. Turn it off to show one
analysis in each tool; your tabs and their results are not deleted, and they
come back when you turn it on again.

<h3 id="help-settings-desktop-updates">Desktop updates</h3>

Shown in the desktop app only. With **Automatically check for updates** on,
Wordflow looks for a new version when it starts, and daily while it stays open,
and opens its update window when there is one. The check sends nothing about
you, your Projects or your data. Turn the switch off to stop these checks.

<h2 id="help-settings-portal">Portal</h2>

The **LDaCA access token** lets Wordflow browse and import collections from the
[LDaCA Data Portal](https://data.ldaca.edu.au), including access-controlled
ones your account may use. You get a token by signing in to the Data Portal.
Paste it here; entering a new one replaces the saved one, and you can remove it
at any time. The badge beside the heading says whether a token is saved. On a
Wordflow server it can also say **Set by the server**: the server then provides
a token, and one you save here is used instead of it.

In the desktop app the token is kept on this computer. On a Wordflow server it
is saved in this web browser, for the account you are signed in with, so a
different browser or a private window needs it again. It is sent only when you
browse or import LDaCA collections. See
[Import LDaCA collections](./data-loader.md#help-data-loader-import-ldaca-button).

<h2 id="help-settings-servers">Servers</h2>

Servers are other computers that Wordflow can send work to. Each has an
address and, usually, an API key. Nothing is sent to a server until you run a
tool that uses it.

<h3 id="help-settings-servers-ai">Generative AI</h3>

Providers used by **Annotation** in AI mode and by the
[AI Code Designer](./annotation.md#help-annotation-code-designer). Without one,
Annotation can only be done by hand. Add a provider (OpenRouter, OpenAI,
Anthropic, Google, or a **Custom** server with its own address), give it a name
and its API key, and optionally a default model. Names, keys and default models
can be changed later; the provider type and a Custom address stay fixed.

In the desktop app, providers and keys are stored on this computer, and a saved
key is never shown again. On a Wordflow server they are saved in this web
browser for the account you are signed in with, so a different browser or a
private window needs them again; on a shared computer, remove them when you
finish. A key is sent only with the requests that use it. Texts you annotate
with a provider are sent to that provider. See the
[AI workflow](./annotation.md#help-annotation-ai).

<h3 id="help-settings-servers-topic">Topic Modelling</h3>

Servers that read text for Topic Modelling on a remote GPU, which is much
faster than this computer on large corpora. This is only for people who have
access to such a server, for example through their university or a research
cloud. Most people do not, and Topic Modelling works without one by reading the
text on this computer. A Wordflow server may provide its own; those are listed
but cannot be changed here. See
[Remote GPU](./topic-modeling.md#help-topic-modeling-remote-gpu).

<h2 id="help-settings-project">Project</h2>

<h3 id="help-settings-data-folder">Data folder</h3>

The data folder is where Wordflow keeps your Projects, imported files and
settings. Changing it reloads Wordflow and does not copy anything from the old
folder. On a shared server it is set by the person who runs Wordflow, and
Settings says so. See [Data folder](./ui.md#help-ui-working-directory).

<h3 id="help-settings-tool-caches">Tool caches</h3>

Wordflow keeps the results of slow steps, so later runs on the same text are
faster. This list shows how much space each cache uses. **Clear** frees the
space after you confirm; nothing in your Projects changes, and the next run on
the same text is slower while the cache fills again. See
[Tool caches](./ui.md#help-ui-tool-caches).

<h3 id="help-settings-favourite-projects">Favourite Projects</h3>

The Projects you starred in the Data Loader. **Remove** takes a Project off
this list; it does not delete the Project.

<h2 id="help-settings-views">Views</h2>

**Visible views** chooses which tools appear in the sidebar. Untick a tool to
hide it and tick it to bring it back. Hiding a tool does not delete its tabs
or results. The Data Loader is always shown, so your Projects stay reachable.
The pencil icon beside **Views** in the sidebar opens the same list.

<h2 id="help-settings-guidance">Guidance: Contextual Hints and Suggestions</h2>

Wordflow has two kinds of guidance. They do different jobs, and each has its
own switch under **Settings → Guidance**. Both are on by default.

| | Contextual Hints | Suggestions |
|---|---|---|
| What they are | Short tips that teach the interface | Reminders that a result or run looks off |
| When they appear | As you reach a milestone in a tool for the first time | Each time the situation happens |
| What they point at | The next control to use | The settings that may help |
| How they go away | **Got it**, or using what the hint points at | By themselves once you carry on, or **Dismiss** |
| Do they come back? | Not once acknowledged, until you reset the history | Yes, whenever the situation happens again |
| Switch | **Show contextual hints** | **Show suggestions** |

Neither ever dims or blocks the page: you can keep working while one shows.

<h3 id="help-settings-contextual-hints">Contextual Hints</h3>

Contextual Hints show you around while you learn Wordflow.

- **When they appear.** Each function (the Data Loader, the Data Builder,
  Export and each analysis tool) has a few hints tied to milestones: for
  example, after you add a Data Block, or when the first result arrives. One
  hint shows at a time, and the next waits until your next click or key press,
  so you can first do what the hint showed.
- **What a hint looks like.** It outlines what it points at, pulsing when that
  is a button to click.
- **Acknowledging a hint.** Choose **Got it**, press **Enter**, or simply use
  what it points at. An acknowledged hint does not appear again on this
  computer.
- **Pausing.** **Not now**, or **Escape**, pauses hints for the current visit to
  that function without acknowledging anything. Leave the function and come
  back to see the hint again.
- **Turning them off.** Untick **Show contextual hints**. A hint's
  **Turn off hints…** shows the way: it points at the Settings gear, then at
  **Guidance** and the option, which you untick yourself. Tick it again at any
  time to turn hints back on.

A **Guided Tour**, where Help offers one, is started deliberately and is not
affected by this switch.

<h4 id="help-settings-reset-hints">Bringing acknowledged hints back</h4>

A hint you have acknowledged does not appear again by itself. The badge under
**Show contextual hints** counts the hints you have acknowledged.
**Reset Contextual Hint history** sets that count back to zero, so those hints
can appear again when you next reach their milestones. Use it after a break
from Wordflow, or before showing Wordflow to someone new.

Resetting affects only you, on this computer, and nothing else in Wordflow
changes. It does not turn hints on: **Show contextual hints** must be ticked
too.

<h3 id="help-settings-suggestions">Suggestions</h3>

Suggestions appear, with a lightbulb, when a result or a run looks off. A
pulsing border marks the settings that may help while the suggestion shows.
They need no closing: they fade once you carry on with other things (typing in
a field does not count), or choose **Dismiss** to close one at once. Either
way, the suggestion comes back when the same situation happens again. Buttons
that lose work, such as **Clear results** and **Stop**, are named but never
marked.

A suggestion appears in these situations:

| Tool | When | What it suggests |
|---|---|---|
| Concordance | A **Preview** finds no matches on the page it checked, while the Data Block has more documents | Show more **Documents per page**, or **Run** to search them all |
| Topic Modelling | One topic holds more than half of the grouped passages | A lower **Max topic size** |
| Topic Modelling | The run found more topics than the map can show clearly, so they open merged | Move **Number of topics**, or raise **Min topic size** and run again |
| Topic Modelling | Fewer than five topics | A slightly lower **Min topic size** |
| Topic Modelling | 30% or more of the documents are [Ungrouped](./topic-modeling.md#help-topic-modeling-ungrouped) | Under **Advanced**, set [Ungrouped passages](./topic-modeling.md#help-topic-modeling-ungrouped-passages) to **Join a topic they fit**; if many remain after that, **Always join the nearest topic** |
| Topic Modelling | A run is still splitting or reading the text after five minutes | **Stop**, then lower **Sampling** to read fewer documents |
| Topic Modelling | The input is large: from about 15,700 documents, or 66,000 passages without Topic sampling | A sample of documents or passages for a faster first run |
| Topic Modelling | A finished run read the text on this computer's processor, and no Topic Modelling server is set up | A remote GPU server, only if you have access to one |
| Topic Modelling | **Max tokens** was set by hand and your passages are much shorter | **Apply** lowers Max tokens to fit |
| Topic Modelling | The text is not English, or is Chinese, Japanese or Korean, and the English model is chosen | The **Multilingual** model |
| Trends | A rate divides by a reference Data Block that lacks one of the Group By columns | Read the note under the chart, which says what the rates divide by |
| Export and downloads | An Excel download is refused because a cell holds more than 32,767 characters | Choose **CSV** to keep the full text |

Some Topic Modelling suggestions point at settings that show only when
**Advanced** is on; the suggestion says so.

Clicking a disabled **Run** is related but separate: it outlines what Run is
waiting for, such as an empty **Tokeniser model** in Frequency, whether or not
Suggestions are on.

To turn Suggestions off, untick **Show suggestions**. A suggestion's
**Turn off suggestions…** shows the way there, as **Turn off hints…** does.
Tick it again at any time to turn them back on.
