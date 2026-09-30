# Vite+ migration

Adopt Vite+ 1.0.0 across Wordflow builds, Vitest tests, Oxlint linting and Oxfmt
formatting. Global Vite+ manages the pinned Node 24.15.0 and pnpm 11.24.0
environment. Use the recommended native correctness policy with type-aware
checking rather than preserving strict ESLint and specialized JS plugins.

Preserve React Compiler, application entry points, ports, proxies, native hooks,
E2E ownership, build verification and all existing test assertions. This change
has no application API or project-data migration. Work in an isolated checkout
and integrate without overwriting unrelated local work.
