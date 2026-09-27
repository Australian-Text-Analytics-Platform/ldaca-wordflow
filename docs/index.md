# Engineering Documentation

This is the canonical entry point for engineering context in LDaCA Wordflow.
Read only the sections relevant to the work at hand.

## Context Map

- [Domain glossary](../CONTEXT.md) defines the project's canonical product
  language.
- [Architecture](architecture/index.md) describes current system boundaries,
  ownership, and data flow.
- [Domain model](domain/index.md) records product invariants and lifecycle
  semantics.
- [Architecture decisions](adr/) explain accepted, hard-to-reverse trade-offs.
- [Reference](reference/) contains exact APIs, settings, and package contracts.
- [Native project persistence](architecture/backend/native-projects.md) records
  current transaction and file-ownership guarantees.
- [Standalone server](architecture/backend/server.md) describes browser libraries,
  project sessions and native release ownership.
- [Native analyses](architecture/backend/native-analyses.md) describes Frequency
  execution and project-owned result/artifact storage.
- [Runbooks](runbooks/) contains operational and development procedures.
- [Test suites](runbooks/test-suites.md) explains suite ownership, model provisioning
  and installed-artifact verification.
- [Release records](releases/) are historical snapshots, not current
  architecture.
- [Active and archived specifications](../specs/README.md) record substantial
  changes.
- [Agent configuration](agents/) tells installed engineering skills how to use
  domain documents and GitHub Issues.

## Sources Of Truth

Code, tests, manifests, build scripts, generated OpenAPI, and CI workflows are
executable sources of truth. These documents explain their design and use.
When a change makes a document misleading, update the document in the same
change rather than leaving a compatibility note or duplicate guide.

Frontend user documentation remains under `frontend/docs/` and bundled
in-application documentation remains under `frontend/public/`; those documents
serve users rather than engineering context.
