# Native browser host

This package owns standalone configuration, embedded UI serving, the single-user
file library and active-project replacement. Keep analysis/database behavior in
`wordflow-backend`. No user accounts or persistent session registry.

Build the frontend before compiling the application binary. OpenAPI export and
library tests must not require compiled frontend assets or a running server.
Run locked package tests, formatting and strict Clippy. Exercise packaged assets
from an extracted directory outside the checkout. Binder verification runs on the actual website, not a local proxy. Never publish releases as part of local verification.
