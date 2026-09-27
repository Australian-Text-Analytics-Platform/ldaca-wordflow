use std::{env, path::PathBuf, process::Command};
fn main() {
    println!("cargo:rerun-if-changed=native/FoundationModels.swift");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo OUT_DIR"));
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        _ => panic!("Unsupported macOS architecture"),
    };
    let sdk = Command::new("xcrun")
        .arg("--show-sdk-path")
        .output()
        .expect("macOS builds require Xcode");
    assert!(sdk.status.success(), "Cannot locate the macOS SDK");
    let sdk = String::from_utf8(sdk.stdout).expect("SDK path");
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-swift-version",
            "5",
            "-O",
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-module-name",
            "WordflowFoundationModels",
            "-target",
            &format!("{arch}-apple-macosx13.0"),
            "-sdk",
            sdk.trim(),
            "-module-cache-path",
        ])
        .arg(out.join("swift-cache"))
        .arg("native/FoundationModels.swift")
        .arg("-o")
        .arg(out.join("libWordflowFoundationModels.a"))
        .status()
        .expect("Compile Foundation Models bridge");
    assert!(
        status.success(),
        "Foundation Models bridge compilation failed"
    );
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=WordflowFoundationModels");
    println!(
        "cargo:rustc-link-search=native={}/usr/lib/swift",
        sdk.trim()
    );
    // The framework is optional on supported older desktop systems. Every use is availability-guarded.
    if PathBuf::from(sdk.trim())
        .join("System/Library/Frameworks/FoundationModels.framework")
        .exists()
    {
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=FoundationModels");
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");
    }
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}
