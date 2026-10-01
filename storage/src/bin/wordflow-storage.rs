use wordflow_storage::{AppDirectories, DEV_ID, TEST_ID};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some("--identity") {
        return Err("Usage: wordflow-storage --identity <Dev or Test identity>".into());
    }
    let id = args.next().ok_or("Missing identity")?;
    if ![DEV_ID, TEST_ID].contains(&id.as_str()) || args.next().is_some() {
        return Err("Development tooling may resolve only Dev and Test identities".into());
    }
    println!("{}", serde_json::to_string(&AppDirectories::native(&id)?)?);
    Ok(())
}
