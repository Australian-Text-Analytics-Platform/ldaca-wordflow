# Wordflow Usability Improvement Plan

Prepared by GPT-6 Astra on 2 November 2026, following review of GPT-6 Sol's
evaluation. Saved for Claude to review at the product owner's request.

**Status: proposal for review, not an approved implementation specification.**
No application changes have been made for this plan.

Reference branch: `research/v0.7-ui-astra-handoff`, based on local `v0.7` at
`852baa0e6720531ac7b6a00939559d78318af31e`.

Supporting material:

- [Sol's review brief and findings](ASTRA-REVIEW.md)
- [Current-status memory](MEMORY.md)
- [Interface and behavior memory](BEHAVIOR-MEMORY.md)
- [Screenshots, verification and limitations](EVIDENCE.md)

## Recommendation

**Keep one familiar Wordflow interface, but make it task-focused with
progressive disclosure. Add optional workflow presets later, rather than
building separate interfaces for different disciplines.**

The aim should be: **fewer decisions at once, clearer consequences, and no
loss of research capability.**

This plan follows review of Sol's handoff, representative screenshots,
interaction records and relevant source. It does not report a new participant
study or a fresh execution of Sol's tests.

## 1. Assessment Of Sol's Findings

The central diagnosis is persuasive: **the main problem is coordinating
several contexts, not simply having too many functions.**

Three observations are particularly important:

- A researcher can select and see a Data Block, yet the active tool still has
  no input. This is valid functionality, but an easily misunderstood
  distinction.
- Uploading, adding to a Project, analysing, editing, creating derived data and
  downloading are separate actions whose consequences are not always obvious.
- Configuration competes with the actual research output. In the
  [1024-pixel Frequency screenshot](screenshots/36-responsive-1024.png), the
  result is below the initial visible area.

Two qualifications matter:

1. **Hiding panels alone will not solve this.** Even the
   [collapsed-Project layout](screenshots/48-analysis-focused-collapsed-project.png)
   gives substantial space to controls before showing the result.
2. **Passing functional tests does not establish usability.** Sol's checks
   support the behavior descriptions, but there were no novice participants,
   realistic large Projects or completed specialist-model workflows. We have
   strong design hypotheses, not a proven preferred design.

## 2. Three Viable Options

| Option | What changes | Assessment |
|---|---|---|
| **A. Clarify and declutter the current interface** | Explicit input state, clearer actions, compact settings, better result priority | Lowest disruption. Worth doing regardless, but may leave tool discovery difficult |
| **B. Task-focused interface using the existing tools** | Option A plus research-intent entry points and a clearer input, method and result structure | **Recommended.** Addresses both discovery and day-to-day use without replacing the product |
| **C. Separate basic/advanced or discipline-specific interfaces** | Different navigation and layouts for different audiences | Highest maintenance and training cost. Risks hiding capabilities and creating confusing mode changes. Do not start here |

HASS, business and medical researchers often share activities: examining
language, comparing groups, coding responses and inspecting change over time.
**Organise around those activities rather than assuming a discipline
determines technical ability or method.**

## 3. What The Recommended Interface Would Do

### A. Make The Current Task And Its Data Unmistakable

Each analysis should visibly answer:

> **Using:** Interview responses; Text: response; Scope: all 240 rows
>
> **Doing:** Frequency analysis; Word splitting: Plain words
>
> **Output:** Counts and a word cloud; source data unchanged

This should be a compact summary, not another large panel. The example is
illustrative, not a claim about the evaluation fixture.

Keep inspection and analysis independent, but distinguish them explicitly:

- **Viewing data:** what the Data Editor shows.
- **Analysis inputs:** what the current tool will process.
- Offer an explicit **Use this Data Block** action when appropriate.

Do **not** make every graph click silently replace analysis inputs. That would
simplify one novice situation by breaking expert workflows.

### B. Put The Result Ahead Of Optional Configuration

Use a common structure across tools:

1. **Inputs:** data, column and scope.
2. **Method:** essential choices, with additional settings available locally.
3. **Results:** the principal working area after a run.
4. **Next action:** inspect, reuse, create a Data Block or download.

Retain the current appearance and existing components. The change is
hierarchy, not a reskin.

For Frequency, for example:

- Show the cloud/table immediately after the compact method summary.
- Keep an understandable indicator such as **Excluded words: none** visible.
- Open the stop-word editor when requested, rather than reserving a large
  disabled textarea.
- Put cloud size and list limits beside their respective views.

**Important:** progressive disclosure must not conceal methodological choices.
Sampling, normalization, model choice, exclusions and processing location can
change interpretation. Their controls may collapse, but their active values
should remain visible in a summary.

### C. Offer Research-Intent Entry Points Without Replacing Tool Names

On a new Project or empty analysis, offer a few optional starting points:

- Explore common words: Frequency.
- Find words in context: Concordance.
- Compare groups of texts: an appropriate comparison workflow.
- Examine change over time: Trends.
- Label and review responses: Annotation.
- Explore possible themes: Topic Modelling.

Keep the established tool names available and searchable. Experienced users
should go straight to them.

These are **shortcuts into the same tools**, not a compulsory wizard or an
automatic recommendation of the scientifically "correct" method.

### D. Explain What Each Action Will Change

Use a consistent action vocabulary, while preserving tool-specific behavior:

| Action family | What must be clear before clicking |
|---|---|
| Preview | How much data is examined; whether processing is local or remote |
| Run | Which data and settings are used; where results will appear |
| Apply edit | Which existing Data Block/column changes; available recovery |
| Create derived Data Block | What each output row represents; source remains separate |
| Download | What leaves the app and in which format |

For Concordance, a summary such as **"Create one row per match"** is more useful
initially than asking users to interpret every `CONC_*` column. Keep detailed
column selection available, including the distinction between matches and
documents.

Similarly, distinguish **Clear results**, **Remove inputs** and **Clear
selection** instead of relying on surrounding context to explain "Clear".

### E. Make Supporting Panes Available, Not Continuously Demanding Attention

Keep the Data Block list and lineage graph. They are valuable differentiators.

Prototype a focused arrangement where:

- The main analysis gets priority.
- Data inspection and lineage have obvious, labeled entry points.
- Users can pin those panes open for sustained comparison or editing.
- Tasks remain visible when running, failed or needing attention.
- The application remembers explicit layout choices rather than repeatedly
  rearranging itself.

Offer this first as an optional presentation. Do not reset existing users'
layouts.

### F. Simplify Annotation By Prerequisites, Not By Removing Capability

Show a short, editable setup sequence:

**Choose text -> Define/import labels -> Choose Manual or AI -> Review output
destination -> Start**

Optional examples and detailed inference controls can follow those
prerequisites. Explain **Codebook** as "labels and their definitions" while
retaining the established term.

For confidential business or medical research, **where text is processed and
whether it is sent to an external provider must remain prominent**, not hidden
under Advanced. An easier interface must not imply privacy compliance or
methodological validity.

## 4. How Profiles Should Work, If Needed

Introduce profiles only after the common interface improvements have been
tested. Prefer names such as **Text exploration**, **Coding and review**, or
**Corpus comparison**, rather than "Beginner" and "Expert".

A first profile version should change only:

- Suggested tools and starting points.
- Which supporting panes initially open.
- Guidance and disclosure preferences.

It should **not** silently change analysis parameters, provider choices, data,
saved results or input roles.

Required safeguards:

- An obvious **All tools** route.
- Existing analyses remain reachable, even outside the profile's suggested
  tools.
- Switching profiles preserves drafts and work.
- Local overrides are understandable and reversible.
- Research-method templates, if added later, are separate from presentation
  profiles and require explicit review.

The existing visibility preferences are a useful foundation, but not a
complete profile system.

## 5. Proposed Delivery Plan

| Phase | Work | Decision gate |
|---|---|---|
| **1. Establish priorities** | Identify three frequent research journeys and the most costly workshop misunderstandings. Inventory controls by purpose and consequence | Agree what "first successful session" means |
| **2. Prototype two alternatives** | Compare a clarified current layout with the recommended task-focused layout. Cover import, Frequency, Concordance reuse and Annotation setup | No application implementation until the alternatives are reviewed |
| **3. Test with researchers** | Observe task completion after the same short introduction. Include novices across backgrounds and experienced Wordflow users | Choose based on observed comprehension, not visual preference alone |
| **4. Pilot one complete journey** | Implement import, Frequency, Concordance, derived Data Block creation, reuse and export, with explicit input state and result-first layout | Preserve existing behavior and verify Chromium/WebKit, keyboard access and realistic screen sizes |
| **5. Extend selectively** | Apply the successful interaction pattern to Builder, Trends, Topics, Quotation and Annotation, respecting their differences | Add profiles only if remaining navigation overload justifies them |

Most initial changes concern presentation and frontend interaction. Durable
draft recovery, profile persistence or richer saved navigation need separate
state/API decisions; they should not be smuggled into a visual cleanup.

### Suggested Evaluation Gates

These are proposed targets, not measured results:

- After a fixed short introduction, at least **80%** complete the agreed core
  journey without facilitator intervention.
- Participants can correctly identify the input, processing scope and whether
  an action edits or creates data.
- No unnoticed wrong-input, destructive-edit or external-data-transfer errors
  in the study; any occurrence triggers redesign.
- Experienced users can still find specialist functions and complete their
  comparison workflows without a material regression.
- The result is meaningfully visible at an agreed minimum laptop size, not
  merely free of horizontal overflow.

A small formative study will guide iteration, not prove population-wide
success.

## Bottom Line

**Start with clearer input/output state and a result-first layout. Then add
optional task-oriented starting points. Treat profiles as a later convenience,
not the primary cure.**

This preserves Wordflow's breadth while reducing how much of its internal
organisation researchers must understand before doing useful work. The next
step should be reviewing two interaction prototypes, not changing production
code.

## Requested Claude Review

Review the proposal against the linked evidence and current behavior. In
particular, challenge the recommendation, identify conflicts with specialist
workflows or prior user-feedback decisions, and distinguish low-risk
presentation changes from changes requiring explicit state or domain
decisions. Treat the evaluation targets as proposals to refine, not established
requirements. Do not implement application changes as part of this review.
