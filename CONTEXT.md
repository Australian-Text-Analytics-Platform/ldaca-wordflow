# LDaCA Wordflow

Wordflow is a text-analysis application for importing, transforming and analysing
corpora in a DuckDB project. This glossary describes the current native system.
Archived server terminology and unimplemented analysis workflows are historical
reference, not current product contracts.

## Project and data

**Project**: The database belonging to one application window. A saved project is
one `.wfpj` file; an Untitled project is initially in memory. Its runtime owns
connections, tasks and lifecycle permissions. Different projects can run
independently. See [project semantics](docs/domain/native-projects.md).
_Avoid_: Workspace, Data Root, user-owned server workspace.

**Data Block**: A registered Table or View with project metadata. Visible Data
Blocks appear in the sidebar and normal graph; hidden registrations can support
imports. `Node` is the backend/API representation, not product terminology.

**Table**: A database object storing rows. Changing its values or columns changes
the object in place. Materializing a View converts its current rows to a Table.

**View**: A named live SQL query. Its current definition determines its database
dependencies. Query-layer Undo belongs to edits of that definition; there is no
general database Undo/Redo or version history.

**SQL dependency**: A direct reference from a source Table/View to a dependent
View, calculated from current SQL. It is not stored as historical lineage.

**Logical link**: A stored virtual association between registered Data Blocks,
independent of their current SQL. It does not enforce dependencies or trigger
transitive data refresh. A pair may carry both a logical link and SQL dependency.

**Document Column Preference**: An optional Data Block default for a newly added
text-input selector. Submitted analysis settings capture their own column choice.

**Tokenizer Preference**: An optional Data Block default for a newly added input's
tokenizer. It is independent of its document-column preference. It is neither a
cached token column nor a substitute for submitted analysis settings.

**Semantic Column Type**: Explicit meaning layered over a DuckDB physical type,
including producer-supplied Arrow extension metadata. A similar column name or
physical shape does not establish semantic identity.

**Stopword Data Block**: An ordinary Table or View selected by an analysis together
with one column. Its current normalized words filter saved Frequency results;
it is not an artifact or copied array in analysis preferences.

## Tools and analyses

**Tool**: A function opened from the **Tools** sidebar, such as Data Loader,
Preprocessing or Frequency. A tool may contain named analysis tabs.
_Avoid_: view for a tool; **View** means a SQL database object.

**Analysis tab**: A project-owned named slot of one analysis kind. It stores its
order within that kind, durable presentation preferences and at most one latest
successful result. Frequency is currently the only restored analysis tool.

**Analysis draft**: Window-local input, column and tokenizer edits. Drafts survive
tab/tool navigation but not reload. A completed run does not overwrite newer
local edits. Frequency browsing controls are also window-local; colours and
stopword source/column/enabled selection are durable tab preferences.

**Result**: An immutable successful run with captured submitted settings, source
descriptions and a versioned typed descriptor. A new success replaces the tab's
previous result atomically; failure or cancellation preserves it. Provenance is
not a live dependency or a source-version guarantee.

**Artifact**: A named output owned by a result: a private typed Table/View or a
binary BLOB in the project. Artifacts are absent from both graph modes and do not
become Data Blocks automatically. See [native analyses](docs/architecture/backend/native-analyses.md).

**Task**: An accepted, runtime-owned operation with progress, cancellation and a
terminal summary. Task history is bounded and in memory, separate from saved
results. Navigating away or disconnecting does not cancel accepted work.

**SQL console**: Project SQL cells with local unrun drafts and saved source after
execution. Default mode can mutate the database; Read and Preview use read-only
transactions. Arbitrary Execute refreshes broadly, while known application writes
identify affected objects and their SQL dependants.

**Data View**: The shared preview of one Table/View. Its target is independent of
graph selection. Previewing or editing an unregistered database object never
registers it automatically.
