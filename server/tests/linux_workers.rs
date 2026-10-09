//! Opt-in acceptance on a dedicated Linux service account with the installed rootless policy.
#![cfg(target_os = "linux")]
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{path::Path, process::Command};
use uuid::Uuid;
use wordflow_server::{
    config::{Config, Mode},
    workers::Workers,
};

fn docker(args: &[&str]) -> String {
    let result = Command::new("docker").args(args).output().unwrap();
    assert!(
        result.status.success(),
        "Docker acceptance operation failed"
    );
    String::from_utf8(result.stdout).unwrap()
}
async fn json_request(
    client: &reqwest::Client,
    method: reqwest::Method,
    path: &str,
    body: Value,
) -> Value {
    let response = client
        .request(method, format!("http://worker{path}"))
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = response.status();
    let value: Value = response.json().await.unwrap();
    assert!(status.is_success(), "{status}: {value}");
    value
}
fn container(root: &Path, user: Uuid) -> String {
    let ids = docker(&[
        "ps",
        "-q",
        "--filter",
        &format!("label=org.wordflow.user={user}"),
    ]);
    let id = ids.trim().to_owned();
    assert!(!id.is_empty() && !id.contains('\n'));
    let inspect: Value = serde_json::from_str(&docker(&["inspect", &id])).unwrap();
    assert_eq!(
        inspect[0]["Mounts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|mount| mount["Type"] == "bind")
            .unwrap()["Source"],
        root.join(user.to_string()).to_string_lossy().as_ref()
    );
    id
}
struct Cleanup {
    ids: Vec<String>,
    networks: Vec<String>,
}
impl Drop for Cleanup {
    fn drop(&mut self) {
        for id in &self.ids {
            let _ = Command::new("docker")
                .args(["kill", "--signal=TERM", id])
                .output();
            let _ = Command::new("docker").args(["wait", id]).output();
            let _ = Command::new("docker").args(["rm", id]).output();
        }
        for network in &self.networks {
            let _ = Command::new("docker")
                .args(["network", "rm", network])
                .output();
        }
    }
}
#[tokio::test]
#[ignore = "requires dedicated Linux rootless Docker, cgroup delegation, fixed image and installed egress policy"]
async fn real_workers_isolate_storage_projects_credentials_sockets_and_limits() {
    let temporary = tempfile::tempdir().unwrap();
    let config = Config {
        mode: Mode::MultiUser,
        probe_network: false,
        identity: wordflow_storage::TEST_ID.into(),
        public_url: Some("https://wordflow.example/".into()),
        worker_root: None,
        worker_socket: None,
        bind: "127.0.0.1:0".parse().unwrap(),
        data_dir: Some(temporary.path().into()),
        public_base_path: "/".into(),
        allowed_origin: vec![],
        icu_path: None,
    };
    let workers = Workers::new(&config).await.unwrap();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let namespace = format!(
        "{:x}",
        Sha256::digest(temporary.path().as_os_str().as_encoded_bytes())
    );
    let names: Vec<_> = [a, b]
        .into_iter()
        .map(|user| format!("wordflow-{}-{user}", &namespace[..16]))
        .collect();
    // Register names before startup so a failed readiness probe cannot leave a container behind.
    let cleanup = Cleanup {
        ids: names.clone(),
        networks: names,
    };
    let first = workers.client(a).await.unwrap();
    assert!(!container(temporary.path(), a).is_empty());
    let second = workers.client(b).await.unwrap();
    assert!(!container(temporary.path(), b).is_empty());
    for id in &cleanup.ids {
        docker(&[
            "exec",
            id,
            "sh",
            "-ec",
            "test ! -e /var/run/docker.sock; test ! -e /run/user; test ! -e /wordflow/.system; test ! -e /srv/wordflow; test -r /wordflow/local/runtime/api.sock; test ! -e /root/.ssh; test ! -e /home/wordflow",
        ]);
        // The production launcher itself verifies effective cgroups and protected network denial.
        docker(&[
            "exec",
            id,
            "/usr/local/bin/wordflow-server",
            "--probe-network",
        ]);
    }
    std::fs::create_dir(temporary.path().join(".system")).unwrap();
    std::fs::write(
        temporary.path().join(".system/gateway-canary"),
        "gateway-only",
    )
    .unwrap();
    std::fs::write(
        temporary
            .path()
            .join(b.to_string())
            .join("cache/other-user-canary"),
        "other-user",
    )
    .unwrap();
    let other_path = temporary
        .path()
        .join(b.to_string())
        .to_string_lossy()
        .into_owned();
    let result = Command::new("docker")
        .args([
            "exec",
            &cleanup.ids[0],
            "cat",
            &format!("{other_path}/cache/other-user-canary"),
        ])
        .output()
        .unwrap();
    assert!(!result.status.success());
    let first_pref = json_request(
        &first,
        reqwest::Method::PATCH,
        "/api/preferences",
        json!({"theme":"dark-2026"}),
    )
    .await;
    assert_eq!(first_pref["theme"], "dark-2026");
    let second_pref = json_request(
        &second,
        reqwest::Method::GET,
        "/api/preferences",
        Value::Null,
    )
    .await;
    assert_eq!(second_pref["theme"], "light-2026");
    // A compromised worker can create a link that resolves outside its mount in
    // the gateway's host namespace. The gateway must reject that lookup.
    docker(&[
        "exec",
        &cleanup.ids[0],
        "sh",
        "-ec",
        "mv /wordflow/local/runtime/api.sock /wordflow/local/runtime/owned.sock; ln -s \"$1\" /wordflow/local/runtime/api.sock",
        "--",
        &format!("{other_path}/local/runtime/api.sock"),
    ]);
    assert!(workers.client(a).await.is_err());
    assert_eq!(
        json_request(
            &first,
            reqwest::Method::GET,
            "/api/preferences",
            Value::Null
        )
        .await["theme"],
        "dark-2026"
    );
    docker(&[
        "exec",
        &cleanup.ids[0],
        "sh",
        "-ec",
        "rm /wordflow/local/runtime/api.sock; mv /wordflow/local/runtime/owned.sock /wordflow/local/runtime/api.sock",
    ]);
    let project = json_request(
        &first,
        reqwest::Method::POST,
        "/api/server/project",
        json!({"name":null}),
    )
    .await;
    let id = project["project_id"].as_str().unwrap();
    assert_eq!(
        second
            .get(format!("http://worker/project/{id}/api/project"))
            .send()
            .await
            .unwrap()
            .status(),
        reqwest::StatusCode::NOT_FOUND
    );
    json_request(
        &first,
        reqwest::Method::POST,
        "/api/server/project/rename",
        json!({"project_id":id,"name":"acceptance.wfpj"}),
    )
    .await;
    assert!(
        temporary
            .path()
            .join(a.to_string())
            .join("projects/acceptance.wfpj")
            .exists()
    );
    assert!(
        !temporary
            .path()
            .join(b.to_string())
            .join("projects/acceptance.wfpj")
            .exists()
    );
    let connection = json_request(&first, reqwest::Method::POST, &format!("/project/{id}/api/ai/providers"), json!({"name":"Browser connection","provider":"custom","endpoint":"https://provider.example/v1","credential":{"action":"browser"}})).await;
    assert_eq!(connection["credential_mode"], "browser");
    let metadata = std::fs::read_to_string(
        temporary
            .path()
            .join(a.to_string())
            .join("config/ai-providers.json"),
    )
    .unwrap();
    assert!(!metadata.contains("key"));
    let adopted = Workers::new(&config).await.unwrap();
    let adopted_client = adopted.client(a).await.unwrap();
    assert_eq!(
        json_request(
            &adopted_client,
            reqwest::Method::GET,
            "/api/preferences",
            Value::Null
        )
        .await["theme"],
        "dark-2026"
    );
    workers.shutdown().await.unwrap();
    let restarted = Workers::new(&config).await.unwrap();
    let fresh = restarted.client(a).await.unwrap();
    assert_eq!(
        json_request(
            &fresh,
            reqwest::Method::GET,
            "/api/preferences",
            Value::Null
        )
        .await["theme"],
        "dark-2026"
    );
    assert_eq!(
        fresh
            .get(format!("http://worker/project/{id}/api/project"))
            .send()
            .await
            .unwrap()
            .status(),
        reqwest::StatusCode::NOT_FOUND
    );
    assert!(
        temporary
            .path()
            .join(a.to_string())
            .join("projects/acceptance.wfpj")
            .exists()
    );
    restarted.shutdown().await.unwrap();
}
