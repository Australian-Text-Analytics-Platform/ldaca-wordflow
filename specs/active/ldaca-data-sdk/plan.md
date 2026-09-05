# Implementation order

1. Capture current Wordflow table values/types and protocol behavior.
2. Build the independent native crate and Arrow table surface.
3. Implement ONI access, conversion and the Python bindings.
4. Integrate Wordflow and remove the superseded provider/runtime code.
5. Verify interfaces, application flows, packaging and documentation.

Keep the application at 0.8.0 and the new SDK at 0.1.0. Build against Arrow 59,
PyO3 0.29 and compatible pyo3-arrow/pyo3-async-runtimes. Use the Arrow capsule
protocol without mandatory pyarrow/polars/pandas dependencies.
