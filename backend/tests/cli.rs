use std::{net::TcpListener, process::Command};

#[test]
fn invalid_bind_configuration_exits_unsuccessfully() {
    let result = Command::new(env!("CARGO_BIN_EXE_wordflow-api-dev"))
        .env("WORDFLOW_BIND_ADDR", "not-a-socket-address")
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(!result.stderr.is_empty());
}

#[test]
fn occupied_port_exits_instead_of_selecting_another_port() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let result = Command::new(env!("CARGO_BIN_EXE_wordflow-api-dev"))
        .env(
            "WORDFLOW_BIND_ADDR",
            listener.local_addr().unwrap().to_string(),
        )
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(!result.stderr.is_empty());
}
