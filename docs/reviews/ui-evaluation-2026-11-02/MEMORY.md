# UI Evaluation Memory: 2 November 2026

This is a dated handoff, not a new product specification or a replacement for
the engineering documentation. Revalidate it when the reference commit changes.

## Read Next

1. [Astra review brief](ASTRA-REVIEW.md): findings, constraints and the prompt
   for the next model.
2. [Behavior memory](BEHAVIOR-MEMORY.md): interface inventory and interaction
   contracts.
3. [Evidence](EVIDENCE.md): screenshots, test results, reproduction and limits.
4. [Astra's improvement plan](ASTRA-PLAN.md): proposed direction and phased
   delivery plan, awaiting Claude and product-owner review.
5. [Changes trialled on this branch](IMPLEMENTATION.md): the low-risk
   wording, accessibility and Frequency layout changes Claude implemented after
   reviewing the plan, with verification and merge notes.

## Scope And Reference

- Evaluation branch: `research/v0.7-ui-astra-handoff`, created directly from
  local `v0.7`, commit `852baa0e6720531ac7b6a00939559d78318af31e`.
- Frontend manifest: 0.7.19. The baseline's latest application release commit
  is `7d020b93`; the branch tip adds migration-report documentation.
- The evaluation itself was understanding and evidence collection. No
  application behavior, styling, dependencies, settings schema or production
  data was changed during it. Later, Claude trialled a set of frontend and Help
  changes on this branch; [IMPLEMENTATION.md](IMPLEMENTATION.md) lists them.
  Screenshots and findings in this folder describe the baseline, not those
  changes.
- Preserve the existing appearance, useful specialist functions, Data Block
  workflow and user-feedback-driven safeguards. The goal is learnability after
  short training, not minimum feature count.
- Basic/advanced disclosure and research profiles are possibilities for later
  evaluation, not approved designs.
- Unrelated pre-existing untracked directories were left untouched.

## What Was Recovered From Earlier Agents

The following local notes were read selectively. Unrelated personal, deployment
and operational information was not copied into this repository.

| Source | Relevant lesson | Treatment in this evaluation |
|---|---|---|
| Claude parent-workspace `MEMORY.md` and `v07-to-v08-frontend-migration.md` | Recent UI changes must retain their reasons and observable behavior when migrated | Used the committed migration record as the regression/decision ledger, not as a redesign brief |
| Claude `tooltips-at-a-glance.md` | Short tooltips, with explanations and examples in Help | Preserve the tooltip/Help distinction |
| Claude `feedback_detach_mandatory_columns.md` from the older checkout's memory | Shared output dialogs must not impose one tool's mandatory-column rules on every tool | Treat consistency as shared interaction grammar, not identical semantics |
| Claude `metaphors-need-consistent-roles.md` | Different deployment forms lead to the same app; analogies should not imply different data or behavior | Profiles must not casually become incompatible products |
| Claude `parity-audit-2026-10.md` and the local 16 October parity report | Earlier migrations lost subtle behavior and needed live WebKit testing | Used as historical warning; did not inherit old parity counts or performance claims as current facts |
| Shared [migration instructions](../../releases/v0.7-to-v0.8-migration-instructions.md) and [branch change record](../../releases/v0.7-branch-changes.md) | Detailed cross-cutting rules and per-change acceptance behavior for Codex or similar agents | Checked relevant current source and live behavior rather than assuming every historical entry still applies |
| Root and frontend operating guides | Current ownership, terminology, container layout and validation rules | Current instructions take precedence over old memory |

No separate Codex auto-memory file was found in the repository or a local
Codex home directory. The repository's `.codex` directory contains environment
configuration, not UI memory. The shared Codex-targeted migration instructions,
agent guides and handover records were available and reviewed; their wording
does not prove which agent authored each entry. Recent Copilot session-history
lookup returned no matching sessions within seven days.

The local handover-source README says earlier scratch notes were lost to
temporary-directory cleanup and identifies the committed release documents as
the surviving complete record. New evaluation memory and screenshots therefore
live together in this repository rather than depending on temporary paths.

## Current Status In One Page

- Nine function views coexist with a persistent Project Graph, Data Editor,
  Data Block list, Tasks, analysis tabs, Settings and Help.
- The UI already supports hiding views, hiding ordinary one-tab chrome,
  collapsing the Project panel, resizing panes, contextual hints, suggestions,
  and an Annotation advanced-settings disclosure.
- These are separate preferences and mechanisms, not a named research-profile
  system. There is no general basic/advanced interface switch in the inspected
  view registry or preference surfaces.
- Graph/Data Editor selection and a tool's inputs are different state. This
  was demonstrated live with a selected Data Block and an empty Frequency tab.
- Data Block Edits, derived Data Blocks, analysis Results and downloaded files
  have different effects. Not every Run automatically creates a Data Block.
- One major pressure point is simultaneous context: choosing a tool, choosing
  its input and column, understanding the current tab/result, managing the
  Project, and finding output actions.
- At 1024 x 768 the Frequency result can sit below the initial visible area
  while parameter and display controls consume the main pane. At 390 px the
  application stacks without document-level horizontal overflow, but this
  does not establish mobile usability.

## Verification And Caveats

Core live workflows passed in Chromium, with persisted-result checks also
passing in WebKit. Four focused existing frontend test files passed, 34 tests.
The [evidence record](EVIDENCE.md) distinguishes completed analyses from screens
that were only inspected.

The normal launcher initially failed because `pnpm` was not on PATH and then
because a dependency rebuild encountered an untrusted certificate. A cached
pnpm runner and the existing editable backend environment were used instead.
Backend package metadata and health report 0.7.15 although its imported source
is this checkout. Installed Polars is 1.44.1 and polars-text is 0.7.0. This is a
source-checkout UI evaluation, not a clean 0.7.19 distribution qualification.

The bright circular badge covering the upper-left corner of screenshots is
development-only TanStack Query devtools, not a production navigation feature.
Do not treat it as a product-design finding.

No real participant study, production-account access, remote inference,
credentialed Portal import or model-quality evaluation was performed.
