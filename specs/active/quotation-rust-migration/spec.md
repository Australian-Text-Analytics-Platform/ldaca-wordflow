# Native local quotation extraction

Replace local spaCy quotation extraction with a row-preserving Rust Polars
expression backed by a private CXX bridge to UDPipe 1.4.0. Preserve direct,
indirect, AccordingTo, floating, and heuristic extraction, source-exact Unicode
spans, and the canonical grouped Arrow schema. Exact spaCy parity is not required.

Remote engines, existing stored Results, and Workspace formats are unchanged.
The English EWT UD 2.5 model downloads on first use into the OS application cache;
its CC BY-NC-SA licence was accepted. No model weights belong in distributions.
Remove the superseded Python algorithm, adapter, and spaCy dependency after tests.
