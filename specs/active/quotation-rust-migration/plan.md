# Implementation plan

1. Capture synthetic spaCy comparison data before removing the old implementation.
2. Vendor checksum-pinned UDPipe 1.4.0 library sources without edits. Add an owned,
   thread-confined CXX model bridge exposing sentence, dependency, and token ranges.
3. Port normalization, source mapping, and quotation rules. Expose the lazy
   `Expr.text.quotation(model_path=...)` expression behind the quotation feature.
4. Acquire the pinned English model atomically in Wordflow's OS cache and switch
   local extraction. Keep the remote contract and result orchestration unchanged.
5. Remove obsolete code, update dependency versions and canonical documentation.
6. Verify source-exact spans, every quotation category, feature builds, backend
   contracts, packaging, browser and desktop flows. Record unavailable checks.

No push, publication, or release is authorized by this implementation task.
