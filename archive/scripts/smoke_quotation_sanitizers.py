"""Compile the actual CXX bridge and UDPipe with ASan/UBSan in isolation.

Requires clang/clang++, Cargo and WORDFLOW_TEST_UDPIPE_MODEL. The harness avoids
loading Python/Polars so sanitizer diagnostics concern the native boundary.
"""
import os
from pathlib import Path
import shutil
import sys
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="quotation-sanitizers-") as directory:
    work = Path(directory)
    shutil.copytree(root / "src/quotation", work / "src/quotation")
    shutil.copytree(root / "vendor", work / "vendor")
    shutil.copyfile(root / "build.rs", work / "build.rs")
    (work / "Cargo.toml").write_text('''[package]
name = "polars_text"
version = "0.8.0"
edition = "2021"
[features]
default = ["quotation"]
quotation = []
[dependencies]
cxx = "=1.0.199"
[build-dependencies]
cxx-build = "=1.0.199"
''')
    (work / "src/main.rs").write_text(r'''
#[path="quotation/bridge.rs"] mod bridge;
fn main() {
    let bytes = std::fs::read(std::env::var("WORDFLOW_TEST_UDPIPE_MODEL").unwrap()).unwrap();
    std::thread::scope(|scope| {
        for _ in 0..4 {
            let bytes = &bytes;
            scope.spawn(move || {
                for _ in 0..8 {
                    let mut model = bridge::ffi::load_model(bytes).unwrap();
                    for text in ["Alice said, \"The project will finish tomorrow morning.\"", "🙂 José can't finish.\nNoise\0 More words.", ""] {
                        let _ = model.pin_mut().parse(text).unwrap();
                    }
                }
            });
        }
    });
    assert!(bridge::ffi::load_model(b"broken").is_err());
}
''')
    sanitizers = os.environ.get("QUOTATION_SANITIZERS", "address,undefined")
    env = dict(os.environ, CC="clang", CXX="clang++",
               CXXFLAGS=f"-fsanitize={sanitizers} -fno-omit-frame-pointer",
               RUSTFLAGS=f"-C linker=clang++ -C link-arg=-fsanitize={sanitizers}",
               ASAN_OPTIONS="detect_leaks=0", UBSAN_OPTIONS="halt_on_error=1:print_stacktrace=1")
    if sys.platform == "darwin":
        runtime = Path(subprocess.check_output(["clang++", "-print-resource-dir"], text=True).strip()) / "lib/darwin"
        env["RUSTFLAGS"] += f" -C link-arg={runtime}/libclang_rt.asan_osx_dynamic.dylib -C link-arg={runtime}/libclang_rt.ubsan_osx_dynamic.dylib -C link-arg=-Wl,-rpath,{runtime}"
    else:
        env["RUSTFLAGS"] += " -C link-arg=-lasan -C link-arg=-lubsan"
    host = next(line.split(": ", 1)[1] for line in subprocess.check_output(["rustc", "-vV"], text=True).splitlines() if line.startswith("host: "))
    subprocess.run(["cargo", "run", "--target", host, "--manifest-path", str(work / "Cargo.toml")], env=env, check=True, cwd=work)
