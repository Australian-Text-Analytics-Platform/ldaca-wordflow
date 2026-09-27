//! Explicit, side-effect-free export; no application or project is initialized.
use std::io::Write;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let document = serde_json::to_value(wordflow_backend::openapi::document())?;
    let mut output = std::io::stdout().lock();
    serde_json::to_writer_pretty(&mut output, &document)?;
    writeln!(output)?;
    Ok(())
}
