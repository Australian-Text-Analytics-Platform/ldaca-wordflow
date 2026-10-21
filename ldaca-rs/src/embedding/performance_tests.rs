//! Explicit model/device experiments; inputs, profiles and vectors stay outside Git.
use super::*;
use serde_json::{json, Value};
use std::{fs, time::Instant};

#[derive(Deserialize)]
struct Case {
    model_root: PathBuf,
    output: PathBuf,
    model: String,
    mode: String,
    batch_size: usize,
    threads: usize,
    repeats: usize,
    profile: bool,
    input: Option<PathBuf>,
    fixed_sequence: Option<usize>,
    compiled_cache: Option<PathBuf>,
}

fn providers(
    mode: &str,
    profile: bool,
    cache: Option<&Path>,
) -> Result<Vec<ort::ep::ExecutionProviderDispatch>> {
    if mode == "cpu" {
        return Ok(vec![ort::ep::CPU::default().build().error_on_failure()]);
    }
    if mode == "current" {
        return Ok(execution_providers(None)
            .into_iter()
            .map(|provider| provider.error_on_failure())
            .collect());
    }
    #[cfg(target_os = "macos")]
    {
        let units = match mode {
            "coreml-all" | "coreml-all-static" => ep::coreml::ComputeUnits::All,
            "coreml-gpu" | "coreml-gpu-static" => ep::coreml::ComputeUnits::CPUAndGPU,
            "coreml-ane" => ep::coreml::ComputeUnits::CPUAndNeuralEngine,
            _ => anyhow::bail!("Unknown embedding experiment mode"),
        };
        let mut provider = ep::CoreML::default()
            .with_model_format(ep::coreml::ModelFormat::MLProgram)
            .with_compute_units(units)
            .with_profile_compute_plan(profile);
        if let Some(cache) = cache {
            provider = provider.with_model_cache_dir(cache.to_string_lossy());
        }
        Ok(vec![provider.build().error_on_failure()])
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (profile, cache);
        anyhow::bail!("CoreML experiments require macOS")
    }
}

fn synthetic_texts() -> Vec<String> {
    let sentences = [
        "Residents need affordable housing and reliable public transport.",
        "Doctors discuss nutrition, exercise and patient health outcomes.",
        "Researchers examine climate change, energy use and biodiversity.",
        "学生学习语言。 Students learn languages, café culture and communication.",
    ];
    (0..100)
        .map(|i| {
            format!(
                "Record {i}. {}",
                sentences[i % sentences.len()].repeat(1 + i % 15)
            )
        })
        .collect()
}

fn encode(encoder: &Embedder, texts: &[String], case: &Case) -> Result<Vec<Vec<f32>>> {
    let Some(sequence) = case.fixed_sequence else {
        return encoder.encode_batches(texts, case.batch_size);
    };
    anyhow::ensure!(
        sequence == encoder.max_length(),
        "Static experiment must retain model token limit"
    );
    let mut result = Vec::with_capacity(texts.len());
    for texts in texts.chunks(case.batch_size) {
        let mut padded = texts.to_vec();
        padded.resize(case.batch_size, String::new());
        let mut vectors = encoder.encode_with_padding(&padded, PaddingStrategy::Fixed(sequence))?;
        vectors.truncate(texts.len());
        result.extend(vectors);
    }
    Ok(result)
}

#[test]
#[ignore = "private provisioned-model CPU/GPU experiment; launch each case in a fresh process"]
fn embedding_device_experiment() -> Result<()> {
    let path = env::var_os("WORDFLOW_EMBEDDING_CASE").context("Set WORDFLOW_EMBEDDING_CASE")?;
    let case: Case = serde_json::from_slice(&fs::read(path)?)?;
    anyhow::ensure!(
        case.batch_size > 0 && case.repeats > 0 && case.threads > 0,
        "Positive experiment sizes required"
    );
    let checkout = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .context("Workspace root")?
        .canonicalize()?;
    let output = case.output.canonicalize()?;
    anyhow::ensure!(
        !output.starts_with(&checkout),
        "Experiment output must be outside the checkout"
    );
    for path in std::iter::once(&case.model_root).chain(case.compiled_cache.iter()) {
        anyhow::ensure!(
            !path.canonicalize()?.starts_with(&checkout),
            "Experiment model caches must be outside the checkout"
        );
    }
    let assets = ModelAssets {
        huggingface: case.model_root.join("huggingface"),
        lindera: case.model_root.join("lindera"),
        temporary: output.join("tmp"),
    };
    fs::create_dir_all(&assets.temporary)?;
    let texts: Vec<String> = match &case.input {
        Some(path) => serde_json::from_slice(&fs::read(path)?)?,
        None => synthetic_texts(),
    };
    anyhow::ensure!(!texts.is_empty(), "Nonempty experiment input required");
    fs::write(output.join("input.json"), serde_json::to_vec(&texts)?)?;
    let loaded = Instant::now();
    let encoder = load_embedder_with(&case.model, Some(&assets), |path, max_length| {
        if case.mode == "current" {
            let profile = case.profile.then(|| output.join("onnx"));
            return build_session(
                path,
                &case.model,
                max_length,
                Some(&assets),
                profile.as_deref(),
            );
        }
        let mut builder = configured_session_builder(providers(
            &case.mode,
            case.profile,
            case.compiled_cache.as_deref(),
        )?)?
        .with_intra_threads(case.threads)
        .map_err(|error| anyhow::anyhow!("Experiment threads: {error:?}"))?;
        if let Some(sequence) = case.fixed_sequence {
            builder = fixed_session_builder(
                builder,
                BatchShape {
                    rows: case.batch_size,
                    tokens: sequence,
                },
            )?;
        }
        if case.profile {
            builder = builder
                .with_profiling(output.join("onnx"))
                .map_err(|error| anyhow::anyhow!("Experiment profile: {error:?}"))?;
            builder = builder
                .with_log_level(ort::logging::LogLevel::Info)
                .map_err(|error| anyhow::anyhow!("Experiment logging: {error:?}"))?;
        }
        Ok(LoadedSession {
            session: builder.commit_from_file(path)?,
            provider_id: case.mode.clone(),
            fallback_reason: None,
            fixed_shape: None,
        })
    })?;
    let load_seconds = loaded.elapsed().as_secs_f64();
    let mut sizer = encoder.tokenizer.clone();
    sizer.with_padding(None);
    sizer
        .with_truncation(None)
        .map_err(|error| anyhow::anyhow!("Sizing tokenizer: {error}"))?;
    let token_counts = sizer
        .encode_batch(texts.iter().map(String::as_str).collect::<Vec<_>>(), true)
        .map_err(|error| anyhow::anyhow!("Sizing input: {error}"))?
        .iter()
        .map(|tokens| tokens.len())
        .collect::<Vec<_>>();
    let onnx_inputs = encoder
        .session
        .lock()
        .map_err(|_| anyhow::anyhow!("Session lock poisoned"))?
        .inputs()
        .iter()
        .map(|input| format!("{}:{:?}", input.name(), input.dtype()))
        .collect::<Vec<_>>();
    let first = Instant::now();
    encode(&encoder, &texts[..texts.len().min(case.batch_size)], &case)?;
    let first_batch_seconds = first.elapsed().as_secs_f64();
    let mut seconds = vec![];
    let mut vectors = vec![];
    for _ in 0..case.repeats {
        let started = Instant::now();
        vectors = encode(&encoder, &texts, &case)?;
        seconds.push(started.elapsed().as_secs_f64());
        anyhow::ensure!(
            vectors.len() == texts.len()
                && vectors
                    .iter()
                    .all(|v| v.len() == encoder.dim() && v.iter().all(|x| x.is_finite())),
            "Invalid experiment embeddings"
        );
    }
    let mut provider_events = HashMap::<String, (u64, f64)>::new();
    if case.profile {
        let profile = encoder
            .session
            .lock()
            .map_err(|_| anyhow::anyhow!("Session lock poisoned"))?
            .end_profiling()?;
        let events: Vec<Value> = serde_json::from_slice(&fs::read(profile)?)?;
        for event in events {
            if let Some(provider) = event["args"]["provider"].as_str() {
                let entry = provider_events.entry(provider.into()).or_default();
                entry.0 += 1;
                entry.1 += event["dur"].as_f64().unwrap_or(0.0);
            }
        }
    }
    fs::write(output.join("vectors.json"), serde_json::to_vec(&vectors)?)?;
    fs::write(
        output.join("result.json"),
        serde_json::to_vec_pretty(&json!({
            "status":"succeeded", "model":case.model, "mode":case.mode, "rows":texts.len(),
            "text_sha256":hex::encode(Sha256::digest(serde_json::to_vec(&texts)?)),
        "batch_size":case.batch_size, "threads":if case.mode=="current" {computation_threads()}else{case.threads}, "profiled":case.profile,
            "load_seconds":load_seconds,"first_batch_seconds":first_batch_seconds,"encode_seconds":seconds,
            "dimension":encoder.dim(), "runtime":ort::info(), "onnx_inputs":onnx_inputs,
            "configured_provider":encoder.provider_id(),"fallback_reason":encoder.provider_fallback_reason(),
            "fingerprint":encoder.cache_fingerprint(),
        "model_token_limit":encoder.max_length(),"input_token_counts":token_counts,
            "fixed_sequence":case.fixed_sequence, "provider_events_count_and_microseconds":provider_events
        }))?,
    )?;
    Ok(())
}
