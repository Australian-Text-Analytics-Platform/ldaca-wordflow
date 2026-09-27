# Project schema reset

Implement the approved clean cutover to integer schema version 1. Reject older
projects before opening for writes. The application schemas are `data` and
`wordflow`; application records use tabs owning at most one submitted analysis,
and analyses owning artifacts. No migration, result history or persistent task
state is introduced.

An analysis owns its submitted request and optional completed output. Clear
retains its identity and request. Run atomically replaces the analysis before
preparation; publication only completes that exact accepted identity. Preview
and form edits remain local. Published Data Blocks remain independently owned.

Arrow extension annotations have one qualified, recursive representation in
`wordflow.arrow_metadata`, including independent saved-output copies. Tab
settings contain display settings only. APIs, caches, desktop exports and Quick
Look adopt the new ownership and naming together.

Acceptance follows the user-approved ownership, metadata, frontend and native
regression matrix. Archived source and unrelated working-tree changes remain
untouched.
