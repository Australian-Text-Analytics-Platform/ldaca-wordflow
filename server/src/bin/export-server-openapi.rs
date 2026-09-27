//! Contract generation performs no host or asset initialization.
use std::io::Write;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let document = serde_json::to_value(wordflow_server::openapi())?;
    let mut output = std::io::stdout().lock();
    serde_json::to_writer_pretty(&mut output, &document)?;
    writeln!(output)?;
    Ok(())
}
