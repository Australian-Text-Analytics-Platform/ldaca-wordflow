# Wordflow UI: Review Brief For GPT-Astra

**Purpose:** understand the existing interface and suggest a feasible direction
for improving learnability. This round collected evidence; it did not approve
or implement an interface redesign.

Read [current evaluation memory](MEMORY.md), the
[behavior map](BEHAVIOR-MEMORY.md), and the [screenshot/test index](EVIDENCE.md).
Reference branch: `research/v0.7-ui-astra-handoff`, based on `v0.7` at `852baa0e`.

## Executive Synthesis

Wordflow has already unified many primitives. Its complexity is not simply
nine tools with different visual styles. Researchers must coordinate several
independent contexts simultaneously:

1. Which Project and tool am I in?
2. What am I inspecting in the graph/Data Editor?
3. What have I added to this tool, and in which input role?
4. Which analysis tab, parameters and retained Result am I looking at?
5. Will this action preview, run, edit data, create data, or download a file?

A consistent appearance helps, but does not answer all five questions.
The strongest hypothesis to investigate is **coordination and state visibility
cost**, alongside control density and terminology. This is an expert
inspection hypothesis, not a measured finding about novice participants.

The app already has useful foundations for progressive disclosure: persistent
view visibility, safe tab-chrome suppression, a collapsible Project panel,
contextual Help, hints, suggestions, and Annotation advanced settings.
Profiles could potentially compose some of these mechanisms, but the
collection of preferences is not itself an existing profile architecture.

## What Should Be Preserved

- The recognizable shell, visual language, Data Block colors and lineage.
- Flexible routing of tabular data between specialist tools.
- Comparison workflows, configurable research methods, manual and AI
  Annotation, and specialist output controls.
- Independent inspection and analysis when experienced users need it.
- User-feedback fixes accumulated in the
  [migration ledger](../../releases/v0.7-to-v0.8-migration-instructions.md),
  especially R1-R7 and R13-R14.
- Access to advanced functionality without forcing separate incompatible
  applications or losing saved work.

No evidence here supports deleting tools because they appear complex or are
irrelevant to one imagined researcher.

## Findings To Examine

Priority is review attention, not a validated severity score or an approved
implementation backlog. Confidence applies to the observation; the user
impact remains a hypothesis until tested with researchers.

| ID | Priority / confidence | Evidence-backed observation | Interpretation and question for Astra |
|---|---|---|---|
| U1 | High / high | A selected Data Block opens the Data Editor while the active tool can still show `Data Blocks (0/2)` and a disabled Run. [Screenshot](screenshots/05-editor-selection-not-tool-input.png) | Inspection selection and tool inputs are intentionally separate, but visually adjacent. How can short training and local feedback make the distinction predictable without removing expert independence? |
| U2 | High / high | Upload, Add to Project, input addition, Run, result publication and Download are distinct steps. Builder, analysis tools and Data Editor use different action cycles. [Behavior sequences](BEHAVIOR-MEMORY.md#4-interaction-sequences-and-why-they-matter) | Can action labeling, placement and outcome explanations communicate the effect before the user clicks, while preserving the different semantics? |
| U3 | High / high | At 1024 x 768, Frequency parameters and result-display controls consume the initial view, with the cloud below it. Disabled stop-word controls remain substantial. [Laptop screenshot](screenshots/36-responsive-1024.png) | Distinguish method-defining settings from display refinements. What should be continuously visible, locally disclosed or moved closer to the result? |
| U4 | High / high | Tool list, graph/list selection, analysis tabs, Data Editor tabs, Tasks and quick access are concurrent navigation systems. [Quick access](screenshots/47-quick-access.png) | Which context should anchor orientation? Avoid adding profiles as yet another unexplained navigation layer |
| U5 | Medium / high | A six-row Slice creates a new lineage branch; Find & replace edits in place and temporarily replaces the graph with its form. [Derivation](screenshots/30-builder-derived-lineage.png), [editing](screenshots/33-editor-tool-replaces-graph.png) | How should users recognize "make new data" versus "change this data", and understand where the graph went? |
| U6 | Medium / high | Labels differ by surface: Loader/Data Loader, Builder/Data Builder, Topics/Topic Modelling, plus F/C/T/TM/Q/A task/tab names. Engineering terms differ again. | Short labels save space but introduce translation work. Which labels should training and status messages reinforce? This is not a request for wholesale renaming |
| U7 | Medium / high | Concordance output dialog exposes numerous `CONC_*` columns and says "immutable Result". [Output dialog](screenshots/34-concordance-output-dialog.png) | A productive specialist output can still expose implementation language. Could an understandable summary precede exact column selection without removing that control? |
| U8 | Medium / high | Existing hide-view and multi-tab preferences work and preserve access to saved work. [Visibility](screenshots/41-hidden-active-view-falls-back.png), [tab safety](screenshots/42-multiple-tabs-remain-reachable.png) | Extend or compose prior mechanisms before inventing another UI framework. Define what a profile changes, where it is saved, and how someone escapes it |
| U9 | Medium / high | Annotation AI setup exposes main/codebook/example roles, column mapping, sampling, provider configuration and advanced settings. [AI setup](screenshots/44-annotation-ai-setup.png) | Complexity reflects real research needs. Which prerequisites should become a short task-oriented setup path, and which belong in local disclosure? Do not assume one "advanced" bucket fits all roles |
| U10 | Medium / high | Hints, suggestions, information icons, Help, tooltips and quick access already coexist. Topic setup displayed actionable short-text advice. [Suggestion](screenshots/22-topics-inputs.png), [Help](screenshots/46-help-home.png) | Evaluate guidance timing and competing messages, not just the number of help mechanisms. Existing Help should support a clearer flow rather than compensate for hidden state |
| U11 | Medium / high | Phone layout stacks without document-level horizontal overflow, but the first result is far below the initial viewport. [Phone screenshot](screenshots/36-responsive-390.png) | Responsive fitting is not the same as task usability. Decide supported research screen sizes before optimizing a new layout |
| U12 | Medium / medium | Unsubmitted drafts did not survive fresh browser contexts, whereas completed analyses restored inputs/results. Only the view is URL-search state. | Distinguish expected draft lifetime from user expectations before proposing profile switching, resumable tasks or deep links |

### Limited Interface-Guideline Checks

These are narrow source findings, not a comprehensive accessibility audit:

- [ConcordanceParameterPanel.tsx](../../../frontend/src/features/views/concordance/components/ConcordanceParameterPanel.tsx):190,
  :205 - context-length labels have no `htmlFor`/input `id` association or
  alternate accessible names; the live accessibility tree exposes two unnamed
  spinbuttons.
- [TokenFrequencyResultsPanel.tsx](../../../frontend/src/features/views/token-frequency/components/panels/TokenFrequencyResultsPanel.tsx):180 -
  the display-control grid uses viewport `md:grid-cols-2` inside an independently
  resizable pane. At a 1024 px viewport its actual analysis pane is much narrower.
  Review against the repository's container-width policy; no overflow failure
  is claimed from this alone.

No application fixes were made during evidence collection.

## Candidate Approaches To Compare, Not Predetermine

| Direction | Why it is relevant | What must be resolved |
|---|---|---|
| Same shell with progressive disclosure | Preserves familiarity and can use existing primitives | What is basic for each task? How are active non-default settings summarized? Can every hidden feature be found? |
| Named research/task profiles | Could reduce irrelevant choices while preserving the toolset | Profile owner/scope, switching, custom overrides, mixed-method workflows, entry/exit, and saved-state compatibility |
| Task-oriented entry paths over the same tools | Could connect a research intention to an initial workflow | Avoid prescribing a method or duplicating the underlying tools; define how users return to unrestricted exploration |
| Stronger context/outcome communication | Directly addresses U1, U2 and U5 without a wholesale reskin | Prototype with genuine novice users; preserve expert shortcuts and independent inspection |

These options can be combined, but combining all of them immediately could
add more concepts than it removes.

## Ready-To-Use Prompt For Astra

> Review this evidence package for Wordflow, a text-analysis app used by HASS
> researchers after short training. Use the reference commit and distinguish
> live observations, source contracts, historical notes and untested behavior.
> This is a planning task: do not edit the application yet.
>
> Our goal is a more intuitive interface without removing useful specialist
> functions, replacing the recognizable appearance, or discarding behavior
> designed from real feedback. Consider progressive basic/advanced disclosure
> and research/task profiles, but do not assume either is the answer.
>
> First explain the user's current mental model and identify where the UI asks
> them to coordinate too many contexts. Separate information-architecture,
> state-visibility, terminology, control-density and discoverability problems
> from actual bugs. Do not treat unused-in-this-audit features as unused by
> researchers.
>
> Compare two or three feasible directions using the current shell, view
> registry, input panels, tabs, preferences and guidance boundaries. For each,
> describe a novice's first successful task, an expert's route to the complete
> functionality, switching/recovery behavior, the treatment of existing
> Projects/tabs/results, likely implementation surfaces, and risks. State
> whether parameters or only presentation would change.
>
> Recommend an incremental research/prototype plan rather than a wholesale
> rewrite. Rank changes by expected learnability benefit, confidence, effort
> and regression risk. Specify what can be tested without backend changes and
> what requires a data/state contract decision. Use the migration ledger as
> behavior that must not be casually lost.
>
> Propose short-training usability sessions using import -> inspect -> analyse
> -> derive -> reuse -> export, plus one Annotation and one specialist
> workflow. Measure successful completion without help, critical errors,
> requests for assistance, ability to explain the current input/output state,
> time after a fixed introduction, and expert feature retrieval. Suggest
> thresholds to agree before implementation, not invented measured results.
>
> End with unresolved product decisions and the smallest evidence-gathering
> steps needed to resolve them. Account for the audit's missing large-project,
> hosted-user, native desktop and credential/model-dependent coverage.

## Important Limits On Conclusions

No novice participants were observed. One small synthetic corpus cannot show
the load of a 50-Data-Block mixed-method Project or justify a preferred
research-profile taxonomy. Topic/Quotation model outputs, AI inference,
inter-annotator reliability, real Portal imports, and native desktop behavior
were not validated. The earlier v0.8 parity audit is historical, not a current
comparison or a recommendation to adopt that branch.
