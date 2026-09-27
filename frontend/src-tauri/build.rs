fn main() {
    // Cargo does not forward a dependency's rustc-link-arg to the final Tauri binary.
    // Keep Foundation Models optional so the app still launches before macOS 26.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let sdk = std::process::Command::new("xcrun")
            .arg("--show-sdk-path")
            .output()
            .expect("macOS SDK");
        let path = String::from_utf8(sdk.stdout).expect("SDK path");
        if std::path::Path::new(path.trim())
            .join("System/Library/Frameworks/FoundationModels.framework")
            .exists()
        {
            println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");
        }
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
    tauri_build::build()
}
