# Session error diagnostics

Retain the latest 200 error occurrences in each project window's memory. The
existing notification reporter owns toast records; accepted tasks remain owned
by the task observer. React boundaries, uncaught errors and unhandled rejections
also record failures without adding duplicate notifications. Reload discards the
history. Project files, storage formats and backend interfaces do not change.

Settings exposes expandable details and copy/clear actions. E2E consumes these
same records through instrumentation included only by test hosts. The runner
retains events across page reloads and saves them with each test's artifacts.
Tests declare expected error messages and exact counts; unexpected errors and
unfulfilled expectations fail the test.
