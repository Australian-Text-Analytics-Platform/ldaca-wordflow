# Native browser host

This package owns standalone configuration, embedded UI serving, per-user file
libraries and project registries, gateway authentication and Linux worker
lifecycle. Keep analysis/database behavior in `wordflow-backend` and directory
values/preferences in `wordflow-storage`. Gateway authentication state must remain
outside worker mounts. Worker provider keys must remain request scoped.

Build the frontend before compiling the application binary. OpenAPI export and
library tests must not require compiled frontend assets or a running server.
Run locked package tests, formatting and strict Clippy. Exercise packaged assets
from an extracted directory outside the checkout. Linux worker validation must
use real rootless containers and effective cgroup/network limits. Binder
verification runs on the actual website, not a local proxy. Never publish
releases as part of local verification.
