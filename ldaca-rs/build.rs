fn main() {
    #[cfg(feature = "quotation")]
    {
        cxx_build::bridge("src/quotation/bridge.rs")
            .file("src/quotation/bridge.cpp")
            .file("vendor/udpipe/udpipe.cpp")
            .include(".")
            .include("vendor/udpipe")
            .std("c++17")
            .flag_if_supported("-Wno-unused-parameter")
            .compile("wordflow_udpipe");
        for path in [
            "src/quotation/bridge.rs",
            "src/quotation/bridge.h",
            "src/quotation/bridge.cpp",
            "vendor/udpipe/udpipe.cpp",
            "vendor/udpipe/udpipe.h",
        ] {
            println!("cargo:rerun-if-changed={path}");
        }
    }
}
