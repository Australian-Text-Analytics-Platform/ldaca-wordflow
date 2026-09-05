# Implementation approach

1. Preserve original test bodies, collected parameter cases and the dirty-checkout
   baseline before editing. Read tests, shared fixtures and responsible production
   behavior; use coverage contexts only as supporting evidence.
2. Work by package: strengthen meaningful assertions before pruning weaker
   duplicates. Record explicit replacements. Keep native and Python boundary
   responsibilities separate.
3. Split long independent scenarios and consolidate repeated setup/cases. Perform
   backend ownership moves after behavioral test changes; keep the SDK's shared
   compatibility fixtures in one location.
4. Use AnyIO for backend tests, pytest-asyncio for SDK bindings, explicit model
   provisioning and real native test execution in feature CI. Exercise full and
   reduced installed wheels outside the checkout.
5. Run focused/repeated concurrency checks, complete suites/static checks and
   source-distribution rebuilds. Record production defects separately and update
   the durable [testing runbook](../../../docs/runbooks/test-suites.md).

The audit CSV uses original identifiers as stable keys even after moves or merges.
Each original collected parameter case is retained in a JSON-valued CSV cell.
Replacement identifiers and current execution results connect that history to the
new layout. This evidence is a snapshot, not a maintained test inventory.

One attempted configuration was reverted: backend importlib discovery prevented
spawned workers from importing test helpers. The normal backend import mode is
retained; standalone package suites use importlib for installed-artifact testing.
