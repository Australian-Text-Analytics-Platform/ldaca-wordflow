fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().nth(1).is_some() {
        return Err("Test reset accepts no identity or path overrides".into());
    }
    wordflow_backend::ai::clear_test_credentials()?;
    Ok(())
}
