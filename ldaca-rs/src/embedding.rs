//! ONNX Runtime sentence embeddings for text analysis.
//!
//! Why this exists: embedding is the dominant cost in native topic modeling, so
//! the pipeline now uses ONNX Runtime instead of the previous CPU-only Candle
//! path. Model management stays automatic: callers provide only a Hugging Face
//! model id, and this module uses `hf-hub`'s default cache/download behavior to
//! fetch tokenizer/config/ONNX artifacts when they are missing locally.
//!
//! Contract: only repositories with ONNX artifacts are supported. If a repo has
//! only safetensors/PyTorch weights, loading fails with a clear error rather
//! than attempting conversion at runtime.
//!
//! Used by topic modelling and host adapters.

use crate::model_assets::ModelAssets;
use std::borrow::Cow;
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use anyhow::{Context, Result};
use hf_hub::{HFRepositorySync, RepoTypeModel};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use ort::ep;
use ort::session::builder::{GraphOptimizationLevel, SessionBuilder};
use ort::session::{Session, SessionInputValue};
use ort::value::{Tensor, ValueType};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokenizers::{PaddingParams, PaddingStrategy, Tokenizer, TruncationParams};

/// Canonical Sentence Transformers default with a published ONNX artifact.
pub const DEFAULT_EMBEDDER_REPO_ID: &str = "sentence-transformers/all-MiniLM-L6-v2";
const EMBEDDING_PIPELINE_VERSION: &str = "sentence-transformers-v3";

const EMBEDDING_THREADS_ENV: &str = "LDACA_EMBEDDING_THREADS";

/// A loaded ONNX sentence encoder. `Session::run` requires `&mut self`, so the
/// session sits behind a mutex while cheap tokenizer work remains lock-free.
pub struct Embedder {
    session: Mutex<Session>,
    tokenizer: Tokenizer,
    input_names: Vec<String>,
    output: EmbeddingOutput,
    pooling: PoolingConfig,
    normalize: bool,
    embedding_dim: usize,
    max_length: usize,
    model_id: String,
    provider_id: String,
    provider_fallback_reason: Option<String>,
    fixed_shape: Option<BatchShape>,
    cache_fingerprint: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct BatchShape {
    rows: usize,
    tokens: usize,
}

struct LoadedSession {
    session: Session,
    provider_id: String,
    fallback_reason: Option<String>,
    fixed_shape: Option<BatchShape>,
}

#[derive(Debug, Clone)]
enum EmbeddingOutput {
    TokenEmbeddings(String),
    SentenceEmbedding(String),
}

impl EmbeddingOutput {
    fn name(&self) -> &str {
        match self {
            Self::TokenEmbeddings(name) | Self::SentenceEmbedding(name) => name,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct SentenceTransformerModule {
    idx: usize,
    path: String,
    #[serde(rename = "type")]
    module_type: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PoolingConfig {
    word_embedding_dimension: usize,
    #[serde(default)]
    pooling_mode_cls_token: bool,
    #[serde(default)]
    pooling_mode_max_tokens: bool,
    #[serde(default)]
    pooling_mode_mean_tokens: bool,
    #[serde(default)]
    pooling_mode_mean_sqrt_len_tokens: bool,
    #[serde(default)]
    pooling_mode_weightedmean_tokens: bool,
    #[serde(default)]
    pooling_mode_lasttoken: bool,
}

impl PoolingConfig {
    fn enabled_count(&self) -> usize {
        [
            self.pooling_mode_cls_token,
            self.pooling_mode_max_tokens,
            self.pooling_mode_mean_tokens,
            self.pooling_mode_mean_sqrt_len_tokens,
            self.pooling_mode_weightedmean_tokens,
            self.pooling_mode_lasttoken,
        ]
        .into_iter()
        .filter(|enabled| *enabled)
        .count()
    }
}

struct PinnedRepo {
    repo: HFRepositorySync<RepoTypeModel>,
    snapshot_root: PathBuf,
    revision: String,
}

impl PinnedRepo {
    fn get(&self, filename: &str) -> Result<PathBuf> {
        let cached = self.snapshot_root.join(filename);
        if cached.exists() {
            Ok(cached)
        } else {
            crate::model_assets::huggingface_file(&self.repo, filename, &self.revision)
                .with_context(|| format!("fetch {filename} at revision {}", self.revision))
        }
    }
}

impl Embedder {
    /// Output embedding dimensionality when it can be read from `config.json`.
    /// Some ONNX repos omit this field; those still encode correctly and infer
    /// the real dimensionality from ORT output at runtime.
    pub fn dim(&self) -> usize {
        self.embedding_dim
    }

    /// Hugging Face repo id used for model download and embedding cache keys.
    pub fn model_id(&self) -> &str {
        &self.model_id
    }

    /// Configured session backend and policy, not a report of per-operation device use.
    pub fn provider_id(&self) -> &str {
        &self.provider_id
    }

    /// Why an accelerated session could not be prepared, if CPU fallback was required.
    pub fn provider_fallback_reason(&self) -> Option<&str> {
        self.provider_fallback_reason.as_deref()
    }

    /// Immutable Hugging Face snapshot used for every model artifact.
    /// Complete embedding-pipeline identity used by persistent caches.
    pub fn cache_fingerprint(&self) -> &str {
        &self.cache_fingerprint
    }

    /// Canonical maximum input length declared by the model.
    pub fn max_length(&self) -> usize {
        self.max_length
    }

    /// A tokenizer clone with truncation/padding disabled for segment-size measurement.
    #[cfg(feature = "topic-modeling")]
    pub(crate) fn sizing_tokenizer(&self) -> Tokenizer {
        tokenizer_for_sizing(&self.tokenizer)
    }

    /// Encode `texts` using the model's declared pooling and optional normalization.
    pub fn encode(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        if let Some(shape) = self.fixed_shape {
            let mut result = Vec::with_capacity(texts.len());
            for batch in texts.chunks(shape.rows) {
                let mut padded;
                let input = if batch.len() == shape.rows {
                    batch
                } else {
                    padded = batch.to_vec();
                    padded.resize(shape.rows, String::new());
                    &padded
                };
                let mut vectors =
                    self.encode_with_padding(input, PaddingStrategy::Fixed(shape.tokens))?;
                vectors.truncate(batch.len());
                result.extend(vectors);
            }
            return Ok(result);
        }
        self.encode_with_padding(texts, PaddingStrategy::BatchLongest)
    }

    fn encode_with_padding(
        &self,
        texts: &[String],
        padding: PaddingStrategy,
    ) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let mut tokenizer = self.tokenizer.clone();
        tokenizer.with_padding(Some(PaddingParams {
            strategy: padding,
            ..Default::default()
        }));
        let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
        let encodings = tokenizer
            .encode_batch(refs, true)
            .map_err(|e| anyhow::anyhow!("tokenizer encode_batch failed: {e}"))?;

        let batch = encodings.len();
        let seq = encodings
            .iter()
            .map(|e| e.get_ids().len())
            .max()
            .unwrap_or(0);
        if seq == 0 {
            return Ok(vec![vec![0.0; self.embedding_dim]; batch]);
        }

        let mut ids = Vec::with_capacity(batch * seq);
        let mut mask = Vec::with_capacity(batch * seq);
        let mut token_types = Vec::with_capacity(batch * seq);
        for enc in &encodings {
            ids.extend(enc.get_ids().iter().map(|id| i64::from(*id)));
            mask.extend(enc.get_attention_mask().iter().map(|id| i64::from(*id)));
            token_types.extend(enc.get_type_ids().iter().map(|id| i64::from(*id)));
        }

        let shape = [batch, seq];
        let input_ids = Tensor::from_array((shape, ids)).context("build input_ids tensor")?;
        let attention_mask =
            Tensor::from_array((shape, mask.clone())).context("build attention_mask tensor")?;
        let token_type_ids =
            Tensor::from_array((shape, token_types)).context("build token_type_ids tensor")?;

        let mut inputs = ort::inputs! {
            "input_ids" => input_ids,
            "attention_mask" => attention_mask,
        };
        if self.input_names.iter().any(|name| name == "token_type_ids") {
            inputs.push((
                Cow::from("token_type_ids"),
                SessionInputValue::from(token_type_ids),
            ));
        }

        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow::anyhow!("embedder session lock poisoned"))?;
        let outputs = session
            .run(inputs)
            .context("ONNX embedding inference failed")?;
        let output = outputs.get(self.output.name()).ok_or_else(|| {
            anyhow::anyhow!(
                "ONNX inference did not return declared output {}",
                self.output.name()
            )
        })?;
        let (shape, data) = output
            .try_extract_tensor::<f32>()
            .context("extract ONNX embedding tensor")?;
        let dims: Vec<usize> = shape.iter().map(|dim| *dim as usize).collect();
        embeddings_from_output(
            &self.output,
            &self.pooling,
            self.normalize,
            OutputBatch {
                dims: &dims,
                data,
                batch,
                sequence_length: seq,
                attention_mask: &mask,
            },
        )
    }
}

#[cfg(any(feature = "topic-modeling", test))]
fn tokenizer_for_sizing(tokenizer: &Tokenizer) -> Tokenizer {
    let mut tok = tokenizer.clone();
    let _ = tok.with_truncation(None);
    tok.with_padding(None);
    tok
}

struct OutputBatch<'a> {
    dims: &'a [usize],
    data: &'a [f32],
    batch: usize,
    sequence_length: usize,
    attention_mask: &'a [i64],
}

fn embeddings_from_output(
    output: &EmbeddingOutput,
    pooling: &PoolingConfig,
    normalize: bool,
    batch: OutputBatch<'_>,
) -> Result<Vec<Vec<f32>>> {
    let OutputBatch {
        dims,
        data,
        batch,
        sequence_length: seq,
        attention_mask: mask,
    } = batch;
    let expected_dimension = pooling
        .word_embedding_dimension
        .checked_mul(pooling.enabled_count())
        .ok_or_else(|| anyhow::anyhow!("metadata-derived embedding dimension overflow"))?;
    let mut rows = match (output, dims) {
        (EmbeddingOutput::SentenceEmbedding(_), [out_batch, dim]) if *out_batch == batch => {
            if *dim != expected_dimension {
                anyhow::bail!(
                    "sentence embedding output width {dim} does not match metadata-derived width {expected_dimension}"
                );
            }
            if data.len() != batch * dim {
                anyhow::bail!(
                    "sentence embedding tensor length {} does not match shape [{batch}, {dim}]",
                    data.len()
                );
            }
            data.chunks_exact(*dim).map(<[f32]>::to_vec).collect()
        }
        (EmbeddingOutput::TokenEmbeddings(_), [out_batch, out_seq, dim])
            if *out_batch == batch && *out_seq == seq =>
        {
            pool_token_embeddings(data, batch, seq, *dim, mask, pooling)?
        }
        other => anyhow::bail!(
            "ONNX output {} has incompatible shape {:?} for the declared Sentence Transformers graph",
            output.name(),
            other.1
        ),
    };
    if normalize {
        normalize_nested_rows(&mut rows);
    }
    Ok(rows)
}

fn pool_token_embeddings(
    hidden: &[f32],
    batch: usize,
    seq: usize,
    dim: usize,
    mask: &[i64],
    pooling: &PoolingConfig,
) -> Result<Vec<Vec<f32>>> {
    if hidden.len() != batch * seq * dim {
        anyhow::bail!(
            "hidden tensor length {} does not match shape [{batch}, {seq}, {dim}]",
            hidden.len()
        );
    }
    if mask.len() != batch * seq {
        anyhow::bail!(
            "attention mask length {} does not match shape [{batch}, {seq}]",
            mask.len()
        );
    }

    if pooling.word_embedding_dimension != dim {
        anyhow::bail!(
            "pooling metadata expects hidden size {}, but ONNX returned {dim}",
            pooling.word_embedding_dimension
        );
    }
    let mode_count = pooling.enabled_count();
    if mode_count == 0 {
        anyhow::bail!("pooling metadata enables no supported pooling mode");
    }

    let mut rows = Vec::with_capacity(batch);
    for row in 0..batch {
        let mut pooled = Vec::with_capacity(dim * mode_count);
        let mask_row = &mask[row * seq..(row + 1) * seq];
        if pooling.pooling_mode_cls_token {
            let offset = row * seq * dim;
            pooled.extend_from_slice(&hidden[offset..offset + dim]);
        }
        if pooling.pooling_mode_max_tokens {
            let mut values = vec![f32::NEG_INFINITY; dim];
            for (token, &mask_value) in mask_row.iter().enumerate() {
                if mask_value == 0 {
                    continue;
                }
                let offset = (row * seq + token) * dim;
                for col in 0..dim {
                    values[col] = values[col].max(hidden[offset + col]);
                }
            }
            for value in &mut values {
                if !value.is_finite() {
                    *value = 0.0;
                }
            }
            pooled.extend(values);
        }

        let mut sum = vec![0.0_f32; dim];
        let mut token_count = 0.0_f32;
        let mut weighted_sum = vec![0.0_f32; dim];
        let mut weight_total = 0.0_f32;
        for (token, &raw_mask_value) in mask_row.iter().enumerate() {
            let mask_value = raw_mask_value as f32;
            if mask_value == 0.0 {
                continue;
            }
            token_count += mask_value;
            let weight = (token + 1) as f32 * mask_value;
            weight_total += weight;
            let offset = (row * seq + token) * dim;
            for col in 0..dim {
                sum[col] += hidden[offset + col] * mask_value;
                weighted_sum[col] += hidden[offset + col] * weight;
            }
        }
        if pooling.pooling_mode_mean_tokens {
            let denom = token_count.max(1e-9);
            pooled.extend(sum.iter().map(|value| value / denom));
        }
        if pooling.pooling_mode_mean_sqrt_len_tokens {
            let denom = token_count.sqrt().max(1e-9);
            pooled.extend(sum.iter().map(|value| value / denom));
        }
        if pooling.pooling_mode_weightedmean_tokens {
            let denom = weight_total.max(1e-9);
            pooled.extend(weighted_sum.iter().map(|value| value / denom));
        }
        if pooling.pooling_mode_lasttoken {
            if let Some(token) = mask_row.iter().rposition(|value| *value != 0) {
                let offset = (row * seq + token) * dim;
                pooled.extend_from_slice(&hidden[offset..offset + dim]);
            } else {
                pooled.resize(pooled.len() + dim, 0.0);
            }
        }
        rows.push(pooled);
    }
    Ok(rows)
}

fn normalize_nested_rows(rows: &mut [Vec<f32>]) {
    for row in rows {
        let norm = row.iter().map(|value| value * value).sum::<f32>().sqrt();
        if norm > 0.0 {
            for value in row {
                *value /= norm;
            }
        }
    }
}

type Registry = RwLock<HashMap<(Option<ModelAssets>, String), Arc<Embedder>>>;
static REGISTRY: OnceLock<Registry> = OnceLock::new();
fn registry() -> &'static Registry {
    REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}
pub(crate) fn ensure_embedder(repo_id: Option<&str>) -> Result<Arc<Embedder>> {
    ensure_embedder_in(repo_id, None)
}
pub(crate) fn ensure_embedder_in(
    repo_id: Option<&str>,
    assets: Option<&ModelAssets>,
) -> Result<Arc<Embedder>> {
    let model = repo_id
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(DEFAULT_EMBEDDER_REPO_ID);
    let key = (assets.cloned(), model.to_owned());
    {
        let map = registry()
            .read()
            .map_err(|_| anyhow::anyhow!("embedder registry lock poisoned"))?;
        if let Some(model) = map.get(&key) {
            return Ok(Arc::clone(model));
        }
    }
    let mut map = registry()
        .write()
        .map_err(|_| anyhow::anyhow!("embedder registry lock poisoned"))?;
    if let Some(model) = map.get(&key) {
        return Ok(Arc::clone(model));
    }
    let model = Arc::new(load_embedder(model, assets)?);
    map.insert(key, Arc::clone(&model));
    Ok(model)
}

fn load_embedder(repo_id: &str, assets: Option<&ModelAssets>) -> Result<Embedder> {
    load_embedder_with(repo_id, assets, |path, max_length| {
        build_session(path, repo_id, max_length, assets, None)
    })
}

fn load_embedder_with(
    repo_id: &str,
    assets: Option<&ModelAssets>,
    session: impl FnOnce(&Path, usize) -> Result<LoadedSession>,
) -> Result<Embedder> {
    let unpinned = crate::model_assets::huggingface_model(repo_id, assets)
        .context("failed to init hf-hub api for embedder")?;
    let modules_path = crate::model_assets::huggingface_file(&unpinned, "modules.json", "main")
        .with_context(|| format!("fetch Sentence Transformers modules.json for {repo_id}"))?;
    let (snapshot_root, revision) = snapshot_from_path(&modules_path)?;
    let repo = PinnedRepo {
        repo: unpinned,
        snapshot_root,
        revision: revision.clone(),
    };

    let modules: Vec<SentenceTransformerModule> = read_json_path(&modules_path)?;
    let (transformer_path, pooling_path, normalize) = validate_module_graph(&modules, repo_id)?;
    let config_file = module_file(transformer_path, "config.json");
    let tokenizer_file = module_file(transformer_path, "tokenizer.json");
    let sentence_config_file = module_file(transformer_path, "sentence_bert_config.json");
    let pooling_file = module_file(pooling_path, "config.json");

    let config_path = repo.get(&config_file)?;
    let tokenizer_path = repo
        .get(&tokenizer_file)
        .or_else(|_| repo.get("tokenizer.json"))?;
    let pooling: PoolingConfig = read_json_path(&repo.get(&pooling_file)?)?;
    let hidden_size = read_required_usize(&config_path, "hidden_size")?;
    if hidden_size != pooling.word_embedding_dimension {
        anyhow::bail!(
            "embedding model {repo_id} declares hidden_size {hidden_size}, but pooling expects {}",
            pooling.word_embedding_dimension
        );
    }
    let mode_count = pooling.enabled_count();
    if mode_count == 0 {
        anyhow::bail!("embedding model {repo_id} enables no supported pooling mode");
    }
    let max_length = resolve_max_length(
        &repo,
        &sentence_config_file,
        &module_file(transformer_path, "tokenizer_config.json"),
        &config_path,
    )?;
    let (onnx_path, onnx_artifact) = resolve_onnx_artifact(&repo, repo_id)?;

    let mut tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| anyhow::anyhow!("load tokenizer for {repo_id}: {e}"))?;
    tokenizer
        .with_truncation(Some(TruncationParams {
            max_length,
            ..Default::default()
        }))
        .map_err(|e| anyhow::anyhow!("configure truncation: {e}"))?;

    let LoadedSession {
        session,
        provider_id,
        fallback_reason,
        fixed_shape,
    } = session(&onnx_path, max_length)?;
    let input_names = session
        .inputs()
        .iter()
        .map(|input| input.name().to_string())
        .collect::<Vec<_>>();
    let embedding_dim = hidden_size
        .checked_mul(mode_count)
        .ok_or_else(|| anyhow::anyhow!("embedding dimension overflow for {repo_id}"))?;
    let output = select_embedding_output(&session, embedding_dim)?;
    let cache_fingerprint = embedding_fingerprint(
        &revision,
        &onnx_artifact,
        &pooling,
        normalize,
        max_length,
        embedding_dim,
        &provider_id,
    );

    Ok(Embedder {
        session: Mutex::new(session),
        tokenizer,
        input_names,
        output,
        pooling,
        normalize,
        embedding_dim,
        max_length,
        model_id: repo_id.to_string(),
        provider_id,
        provider_fallback_reason: fallback_reason,
        fixed_shape,
        cache_fingerprint,
    })
}

fn snapshot_from_path(path: &Path) -> Result<(PathBuf, String)> {
    let snapshot_root = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Hugging Face cache path has no snapshot parent"))?;
    let snapshots_dir = snapshot_root
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str());
    if snapshots_dir != Some("snapshots") {
        anyhow::bail!(
            "Hugging Face artifact {} is not stored in an immutable snapshot",
            path.display()
        );
    }
    let revision = snapshot_root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("Hugging Face snapshot has no revision"))?;
    Ok((snapshot_root.to_path_buf(), revision.to_string()))
}

fn read_json_path<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let contents = std::fs::read_to_string(path)
        .with_context(|| format!("read model metadata {}", path.display()))?;
    serde_json::from_str(&contents)
        .with_context(|| format!("parse model metadata {}", path.display()))
}

fn module_file(module_path: &str, filename: &str) -> String {
    if module_path.is_empty() {
        filename.to_string()
    } else {
        format!("{module_path}/{filename}")
    }
}

fn validate_module_graph<'a>(
    modules: &'a [SentenceTransformerModule],
    repo_id: &str,
) -> Result<(&'a str, &'a str, bool)> {
    if modules.len() < 2 || modules.len() > 3 {
        anyhow::bail!(
            "unsupported Sentence Transformers graph for {repo_id}: expected Transformer, Pooling, and optional Normalize"
        );
    }
    for (expected, module) in modules.iter().enumerate() {
        if module.idx != expected {
            anyhow::bail!("unsupported non-contiguous module graph for {repo_id}");
        }
        let path = Path::new(&module.path);
        if path.is_absolute()
            || path
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
                && !module.path.is_empty()
        {
            anyhow::bail!(
                "unsupported Sentence Transformers module path {:?} for {repo_id}",
                module.path
            );
        }
    }
    if !is_standard_module(&modules[0].module_type, "Transformer")
        || !is_standard_module(&modules[1].module_type, "Pooling")
    {
        anyhow::bail!(
            "unsupported Sentence Transformers graph for {repo_id}: first modules must be Transformer and Pooling"
        );
    }
    let normalize = match modules.get(2) {
        Some(module) if is_standard_module(&module.module_type, "Normalize") => true,
        Some(module) => anyhow::bail!(
            "unsupported Sentence Transformers module {} for {repo_id}",
            module.module_type
        ),
        None => false,
    };
    Ok((&modules[0].path, &modules[1].path, normalize))
}

fn is_standard_module(module_type: &str, name: &str) -> bool {
    module_type.starts_with("sentence_transformers.models.")
        && module_type.rsplit('.').next() == Some(name)
}

fn read_required_usize(path: &Path, key: &str) -> Result<usize> {
    let value: serde_json::Value = read_json_path(path)?;
    valid_usize(value.get(key))
        .ok_or_else(|| anyhow::anyhow!("model metadata {} has no valid {key}", path.display()))
}

fn valid_usize(value: Option<&serde_json::Value>) -> Option<usize> {
    value
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .filter(|value| *value > 0 && *value < 1_000_000)
}

fn resolve_max_length(
    repo: &PinnedRepo,
    sentence_config_file: &str,
    tokenizer_config_file: &str,
    model_config_path: &Path,
) -> Result<usize> {
    let sentence = repo
        .get(sentence_config_file)
        .ok()
        .map(|path| read_json_path(&path))
        .transpose()?;
    let tokenizer = repo
        .get(tokenizer_config_file)
        .ok()
        .map(|path| read_json_path(&path))
        .transpose()?;
    let model = read_json_path(model_config_path)?;
    canonical_max_length(sentence.as_ref(), tokenizer.as_ref(), &model)
}

fn canonical_max_length(
    sentence: Option<&serde_json::Value>,
    tokenizer: Option<&serde_json::Value>,
    model: &serde_json::Value,
) -> Result<usize> {
    sentence
        .and_then(|value| valid_usize(value.get("max_seq_length")))
        .or_else(|| tokenizer.and_then(|value| valid_usize(value.get("model_max_length"))))
        .or_else(|| valid_usize(model.get("max_position_embeddings")))
        .ok_or_else(|| {
            anyhow::anyhow!("embedding model metadata has no valid canonical maximum length")
        })
}

fn select_embedding_output(session: &Session, embedding_dim: usize) -> Result<EmbeddingOutput> {
    let rank = |dtype: &ValueType| match dtype {
        ValueType::Tensor { shape, .. } => Some(shape.len()),
        _ => None,
    };
    for candidate in ["token_embeddings", "last_hidden_state"] {
        if let Some(output) = session
            .outputs()
            .iter()
            .find(|output| output.name() == candidate && rank(output.dtype()) == Some(3))
        {
            return Ok(EmbeddingOutput::TokenEmbeddings(output.name().to_string()));
        }
    }
    if let Some(output) = session
        .outputs()
        .iter()
        .find(|output| output.name() == "sentence_embedding" && rank(output.dtype()) == Some(2))
    {
        if let ValueType::Tensor { shape, .. } = output.dtype() {
            let declared_dim = shape.get(1).copied().unwrap_or(-1);
            if declared_dim > 0 && declared_dim as usize != embedding_dim {
                anyhow::bail!(
                    "ONNX sentence_embedding width {declared_dim} does not match metadata-derived width {embedding_dim}"
                );
            }
        }
        return Ok(EmbeddingOutput::SentenceEmbedding(
            output.name().to_string(),
        ));
    }
    let outputs = session
        .outputs()
        .iter()
        .map(|output| format!("{}:{:?}", output.name(), output.dtype()))
        .collect::<Vec<_>>()
        .join(", ");
    anyhow::bail!(
        "ONNX model exposes no supported named sentence or token embedding output ({outputs})"
    )
}

fn embedding_fingerprint(
    revision: &str,
    artifact: &str,
    pooling: &PoolingConfig,
    normalize: bool,
    max_length: usize,
    embedding_dim: usize,
    provider: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(ort::info().as_bytes());
    hasher.update([0]);
    for value in [
        EMBEDDING_PIPELINE_VERSION.to_string(),
        revision.to_string(),
        artifact.to_string(),
        pooling.word_embedding_dimension.to_string(),
        pooling.pooling_mode_cls_token.to_string(),
        pooling.pooling_mode_max_tokens.to_string(),
        pooling.pooling_mode_mean_tokens.to_string(),
        pooling.pooling_mode_mean_sqrt_len_tokens.to_string(),
        pooling.pooling_mode_weightedmean_tokens.to_string(),
        pooling.pooling_mode_lasttoken.to_string(),
        normalize.to_string(),
        max_length.to_string(),
        embedding_dim.to_string(),
        provider.to_string(),
    ] {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    hex::encode(hasher.finalize())
}

fn resolve_onnx_artifact(repo: &PinnedRepo, repo_id: &str) -> Result<(PathBuf, String)> {
    const CANDIDATES: &[&str] = &[
        "onnx/model.onnx",
        "model.onnx",
        "onnx/model_quantized.onnx",
        "onnx/model_qint8_avx512.onnx",
        "onnx/model_quantized_uint8.onnx",
    ];

    let mut errors = Vec::new();
    for candidate in CANDIDATES {
        match repo.get(candidate) {
            Ok(path) => {
                ensure_external_onnx_data(repo, candidate);
                return Ok((path, (*candidate).to_string()));
            }
            Err(err) => errors.push(format!("{candidate}: {err}")),
        }
    }

    anyhow::bail!(
        "unsupported embedding model {repo_id}: only Hugging Face repositories with ONNX artifacts are supported; tried {} ({})",
        CANDIDATES.join(", "),
        errors.join("; ")
    )
}

fn ensure_external_onnx_data(repo: &PinnedRepo, onnx_file: &str) {
    let companion = format!("{onnx_file}_data");
    let _ = repo.get(&companion);
}

fn build_session(
    onnx_path: &Path,
    model_id: &str,
    max_length: usize,
    assets: Option<&ModelAssets>,
    profile: Option<&Path>,
) -> Result<LoadedSession> {
    #[cfg(target_os = "macos")]
    let fixed_shape = coreml_batch_shape(model_id, onnx_path, max_length);
    #[cfg(not(target_os = "macos"))]
    let fixed_shape: Option<BatchShape> = None;
    #[cfg(not(target_os = "macos"))]
    let _ = (model_id, max_length, assets);

    let preferred = || -> Result<LoadedSession> {
        #[cfg(target_os = "macos")]
        anyhow::ensure!(
            fixed_shape.is_some(),
            "Static CoreML execution is not validated for this model/artifact"
        );
        let provider_id = planned_provider_id(fixed_shape);
        #[cfg(target_os = "macos")]
        let cache = assets.map(|assets| {
            assets.huggingface.join("coreml").join(coreml_cache_key(
                onnx_path,
                &provider_id,
                ort::info(),
            ))
        });
        #[cfg(not(target_os = "macos"))]
        let cache: Option<PathBuf> = None;
        if let Some(cache) = &cache {
            std::fs::create_dir_all(cache).context("Prepare compiled CoreML cache")?;
        }
        let mut builder = configured_session_builder(execution_providers(cache.as_deref()))?;
        if let Some(shape) = fixed_shape {
            builder = fixed_session_builder(builder, shape)?;
        }
        let session = profiled_builder(builder, profile)?.commit_from_file(onnx_path)?;
        if let Some(shape) = fixed_shape {
            let expected = [shape.rows as i64, shape.tokens as i64];
            let compatible = session.inputs().iter().all(|input| {
                matches!(input.dtype(), ValueType::Tensor {shape,..} if shape.as_ref() == expected)
            });
            anyhow::ensure!(
                compatible,
                "ONNX inputs do not match the validated CoreML batch shape"
            );
        }
        Ok(LoadedSession {
            session,
            provider_id,
            fallback_reason: None,
            fixed_shape,
        })
    };
    match preferred() {
        Ok(session) => Ok(session),
        Err(error) if !cfg!(any(target_os = "macos", target_os = "windows")) => Err(error),
        Err(error) => {
            let session = profiled_builder(
                configured_session_builder(vec![ort::ep::CPU::default()
                    .build()
                    .error_on_failure()])?,
                profile,
            )?
            .commit_from_file(onnx_path)
            .with_context(|| {
                format!("Accelerated model preparation failed ({error:#}); CPU fallback failed")
            })?;
            Ok(LoadedSession {
                session,
                provider_id: "CPUExecutionProvider".into(),
                fallback_reason: Some(format!("{error:#}")),
                fixed_shape: None,
            })
        }
    }
}

fn fixed_session_builder(mut builder: SessionBuilder, shape: BatchShape) -> Result<SessionBuilder> {
    for (name, value) in [
        ("batch_size", shape.rows),
        ("sequence_length", shape.tokens),
    ] {
        builder = builder
            .with_dimension_override(name, value as i64)
            .map_err(|error| anyhow::anyhow!("Configure fixed embedding dimensions: {error:?}"))?;
    }
    Ok(builder)
}

fn profiled_builder(builder: SessionBuilder, profile: Option<&Path>) -> Result<SessionBuilder> {
    match profile {
        Some(path) => builder
            .with_profiling(path)
            .map_err(|error| anyhow::anyhow!("Configure ONNX profiling: {error:?}")),
        None => Ok(builder),
    }
}

#[cfg(target_os = "macos")]
fn coreml_batch_shape(model_id: &str, artifact: &Path, max_length: usize) -> Option<BatchShape> {
    (artifact
        .file_name()
        .is_some_and(|name| name == "model.onnx")
        && matches!(
            model_id,
            DEFAULT_EMBEDDER_REPO_ID
                | "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        ))
    .then_some(BatchShape {
        rows: 32,
        tokens: max_length,
    })
}

#[cfg(target_os = "macos")]
fn coreml_cache_key(path: &Path, policy: &str, runtime: &str) -> String {
    let mut hash = Sha256::new();
    for part in ["coreml-cache-v1", &path.to_string_lossy(), policy, runtime] {
        hash.update(part.as_bytes());
        hash.update([0]);
    }
    hex::encode(hash.finalize())
}

fn configured_session_builder(
    providers: Vec<ort::ep::ExecutionProviderDispatch>,
) -> Result<SessionBuilder> {
    let mut builder = Session::builder()
        .context("create ONNX Runtime session builder")?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|err| anyhow::anyhow!("configure ONNX graph optimization: {err:?}"))?
        .with_memory_pattern(false)
        .map_err(|err| anyhow::anyhow!("configure ONNX memory pattern: {err:?}"))?
        // DirectML requires sequential execution and one Run caller per session.
        .with_parallel_execution(false)
        .map_err(|err| anyhow::anyhow!("configure ONNX execution mode: {err:?}"))?;

    builder = builder
        .with_intra_threads(computation_threads())
        .map_err(|err| anyhow::anyhow!("configure ONNX intra-op threads: {err:?}"))?
        .with_inter_threads(1)
        .map_err(|err| anyhow::anyhow!("configure ONNX inter-op threads: {err:?}"))?;

    if !providers.is_empty() {
        builder = builder
            .with_execution_providers(providers)
            .map_err(|err| anyhow::anyhow!("configure ONNX execution providers: {err:?}"))?;
    }

    Ok(builder)
}

fn execution_providers(cache: Option<&Path>) -> Vec<ort::ep::ExecutionProviderDispatch> {
    #[cfg(not(target_os = "macos"))]
    let _ = cache;
    #[cfg(target_os = "windows")]
    let providers = vec![ep::DirectML::default()
        .with_device_filter(ep::directml::DeviceFilter::Gpu)
        .with_performance_preference(ep::directml::PerformancePreference::HighPerformance)
        .build()
        .error_on_failure()];
    #[cfg(target_os = "macos")]
    let providers = {
        let mut provider = ep::CoreML::default()
            .with_model_format(ep::coreml::ModelFormat::MLProgram)
            .with_compute_units(ep::coreml::ComputeUnits::All);
        if let Some(cache) = cache {
            provider = provider.with_model_cache_dir(cache.to_string_lossy());
        }
        vec![provider.build().error_on_failure()]
    };
    #[cfg(target_os = "linux")]
    let providers = Vec::new();
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let providers = Vec::new();
    providers
}

fn planned_provider_id(shape: Option<BatchShape>) -> String {
    #[cfg(not(target_os = "macos"))]
    let _ = shape;
    #[cfg(target_os = "windows")]
    let providers = [
        "DmlExecutionProvider:Gpu:HighPerformance",
        "CPUExecutionProvider",
    ];
    #[cfg(target_os = "macos")]
    let providers = [
        shape.map_or_else(
            || "CPUExecutionProvider".into(),
            |shape| {
                format!(
                    "CoreMLExecutionProvider:MLProgram:ALL:{}x{}",
                    shape.rows, shape.tokens
                )
            },
        ),
        "CPUExecutionProvider".into(),
    ];
    #[cfg(target_os = "linux")]
    let providers = ["CPUExecutionProvider"];
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let providers = ["CPUExecutionProvider"];
    providers.join("+")
}

fn embedding_threads() -> Option<usize> {
    env::var(EMBEDDING_THREADS_ENV)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|threads| *threads > 0)
}

/// Bound native computation by the process's available CPUs and an explicit host cap.
pub(crate) fn computation_threads() -> usize {
    let available = std::thread::available_parallelism().map_or(1, usize::from);
    bounded_threads(available, embedding_threads())
}

fn bounded_threads(available: usize, cap: Option<usize>) -> usize {
    cap.map_or(available, |cap| cap.min(available)).max(1)
}

impl Embedder {
    /// Load a model explicitly, sharing an already-loaded immutable model when available.
    /// Load exclusively from this host's asset cache.
    pub fn load_in(model_id: Option<&str>, assets: &ModelAssets) -> Result<Arc<Self>> {
        ensure_embedder_in(model_id, Some(assets))
    }
    pub fn load(model_id: Option<&str>) -> Result<Arc<Self>> {
        ensure_embedder(model_id)
    }
    /// Encode ordered batches without a persistent cache.
    pub fn encode_batches(&self, texts: &[String], batch_size: usize) -> Result<Vec<Vec<f32>>> {
        anyhow::ensure!(batch_size > 0, "batch_size must be positive");
        let mut vectors = Vec::with_capacity(texts.len());
        for batch in texts.chunks(batch_size) {
            vectors.extend(self.encode(batch)?);
        }
        Ok(vectors)
    }
    /// Encode with a dedicated disposable cache. The project database must not be used here.
    #[cfg(feature = "cache")]
    pub fn encode_cached(
        &self,
        path: &Path,
        texts: &[String],
        batch_size: usize,
    ) -> Result<Vec<Arc<Vec<f32>>>> {
        anyhow::ensure!(batch_size > 0, "batch_size must be positive");
        crate::embedding_cache::get_or_insert_embeddings(
            path,
            crate::embedding_cache::CacheScope {
                model_id: self.model_id(),
                fingerprint: self.cache_fingerprint(),
                provider_id: self.provider_id(),
            },
            texts,
            |misses| self.encode_batches(misses, batch_size),
        )
    }
}

#[cfg(test)]
#[path = "embedding/performance_tests.rs"]
mod performance_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    use tokenizers::models::wordlevel::WordLevel;

    #[test]
    fn native_threads_obey_available_processors_and_explicit_caps() {
        assert_eq!(bounded_threads(8, None), 8);
        assert_eq!(bounded_threads(8, Some(2)), 2);
        assert_eq!(bounded_threads(2, Some(32)), 2);
        assert_eq!(bounded_threads(0, None), 1);
    }

    #[test]
    #[ignore = "explicit isolated model provisioning and ONNX provider acceptance"]
    fn preferred_provider_and_cpu_fallback_execute_real_embedding_nodes() -> Result<()> {
        let root = PathBuf::from(
            env::var_os("WORDFLOW_TEST_EMBEDDING_ASSETS")
                .context("Set an isolated embedding asset directory")?,
        );
        let assets = ModelAssets {
            huggingface: root.join("huggingface"),
            lindera: root.join("lindera"),
            temporary: root.join("tmp"),
        };
        std::fs::create_dir_all(&assets.temporary)?;
        let profiles = tempfile::tempdir_in(&assets.temporary)?;
        let texts = (0..73)
            .map(|i| match i % 5 {
                0 => String::new(),
                1 => "Affordable homes and lower rent.".into(),
                2 => "医生讨论健康。 Café culture and Unicode text.".into(),
                3 => format!(
                    "Record {i}. {}",
                    "Doctors treat patients in hospitals. ".repeat(50)
                ),
                _ => format!("Record {i}. Reliable public transport."),
            })
            .collect::<Vec<_>>();
        for (index, model) in [
            DEFAULT_EMBEDDER_REPO_ID,
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        ]
        .into_iter()
        .enumerate()
        {
            let preferred_profile = profiles.path().join(format!("preferred-{index}"));
            let preferred = load_embedder_with(model, Some(&assets), |path, max_length| {
                build_session(
                    path,
                    model,
                    max_length,
                    Some(&assets),
                    Some(&preferred_profile),
                )
            })?;
            let cpu = load_embedder_with(model, Some(&assets), |path, _| {
                Ok(LoadedSession {
                    session: configured_session_builder(vec![ort::ep::CPU::default()
                        .build()
                        .error_on_failure()])?
                    .commit_from_file(path)?,
                    provider_id: "CPUExecutionProvider".into(),
                    fallback_reason: None,
                    fixed_shape: None,
                })
            })?;
            let expected = cpu.encode_batches(&texts, 17)?;
            for count in [0, 1, 31, 32, 33, 65, 73] {
                let actual = preferred.encode(&texts[..count])?;
                assert_vectors_agree(&expected[..count], &actual);
            }
            assert_vectors_agree(&expected, &preferred.encode_batches(&texts, 17)?);
            let profile = preferred
                .session
                .lock()
                .map_err(|_| anyhow::anyhow!("Session lock poisoned"))?
                .end_profiling()?;
            let events: Vec<serde_json::Value> = serde_json::from_slice(&std::fs::read(profile)?)?;
            let used = events
                .iter()
                .filter_map(|event| event["args"]["provider"].as_str())
                .collect::<std::collections::BTreeSet<_>>();
            #[cfg(target_os = "macos")]
            assert!(
                used.contains("CoreMLExecutionProvider"),
                "Preferred CoreML nodes did not execute"
            );
            #[cfg(target_os = "windows")]
            assert!(
                used.contains("DmlExecutionProvider"),
                "Preferred DirectML nodes did not execute"
            );
            if preferred.provider_id() != cpu.provider_id() {
                assert_ne!(preferred.cache_fingerprint(), cpu.cache_fingerprint());
            }
            #[cfg(target_os = "macos")]
            {
                let blocked = profiles.path().join(format!("blocked-{index}"));
                std::fs::write(&blocked, "not a directory")?;
                let blocked_assets = ModelAssets {
                    huggingface: blocked,
                    ..assets.clone()
                };
                let fallback = load_embedder_with(model, Some(&assets), |path, max_length| {
                    build_session(path, model, max_length, Some(&blocked_assets), None)
                })?;
                assert_eq!(fallback.provider_id(), "CPUExecutionProvider");
                assert!(fallback
                    .provider_fallback_reason()
                    .is_some_and(|reason| reason.contains("compiled CoreML cache")));
                assert_vectors_agree(&expected, &fallback.encode_batches(&texts, 17)?);
            }
            eprintln!(
                "EMBEDDING PROVIDERS {model}: {used:?}; policy={}",
                preferred.provider_id()
            );
        }
        Ok(())
    }

    fn assert_vectors_agree(expected: &[Vec<f32>], actual: &[Vec<f32>]) {
        assert_eq!(expected.len(), actual.len());
        for (left, right) in expected.iter().zip(actual) {
            assert_eq!(left.len(), right.len());
            assert!(right.iter().all(|value| value.is_finite()));
            let dot = left
                .iter()
                .zip(right)
                .map(|(a, b)| f64::from(*a) * f64::from(*b))
                .sum::<f64>();
            let norm = |values: &[f32]| {
                values
                    .iter()
                    .map(|x| f64::from(*x).powi(2))
                    .sum::<f64>()
                    .sqrt()
            };
            assert!(dot / (norm(left) * norm(right)) > 0.9999);
            assert!(left.iter().zip(right).all(|(a, b)| (a - b).abs() < 1e-3));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn static_coreml_shape_is_limited_to_validated_models() {
        let artifact = Path::new("/models/onnx/model.onnx");
        assert_eq!(
            coreml_batch_shape(DEFAULT_EMBEDDER_REPO_ID, artifact, 256),
            Some(BatchShape {
                rows: 32,
                tokens: 256
            })
        );
        assert_eq!(
            coreml_batch_shape(
                "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                artifact,
                128
            ),
            Some(BatchShape {
                rows: 32,
                tokens: 128
            })
        );
        assert_eq!(
            coreml_batch_shape("unvalidated/model", artifact, 8192),
            None
        );
        assert_eq!(
            coreml_batch_shape(
                DEFAULT_EMBEDDER_REPO_ID,
                Path::new("/models/onnx/model_quantized.onnx"),
                256
            ),
            None
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn compiled_model_cache_separates_artifacts_policies_and_runtime_builds() {
        let key = coreml_cache_key(
            Path::new("/models/snapshots/sha-a/model.onnx"),
            "all:32x256",
            "ort-a",
        );
        assert_eq!(
            key,
            coreml_cache_key(
                Path::new("/models/snapshots/sha-a/model.onnx"),
                "all:32x256",
                "ort-a"
            )
        );
        for (path, policy, runtime) in [
            ("/models/snapshots/sha-b/model.onnx", "all:32x256", "ort-a"),
            ("/models/snapshots/sha-a/model.onnx", "gpu:32x256", "ort-a"),
            ("/models/snapshots/sha-a/model.onnx", "all:16x256", "ort-a"),
            ("/models/snapshots/sha-a/model.onnx", "all:32x256", "ort-b"),
        ] {
            assert_ne!(key, coreml_cache_key(Path::new(path), policy, runtime));
        }
    }

    fn mean_pooling() -> PoolingConfig {
        PoolingConfig {
            word_embedding_dimension: 2,
            pooling_mode_cls_token: false,
            pooling_mode_max_tokens: false,
            pooling_mode_mean_tokens: true,
            pooling_mode_mean_sqrt_len_tokens: false,
            pooling_mode_weightedmean_tokens: false,
            pooling_mode_lasttoken: false,
        }
    }

    #[test]
    fn mean_pool_normalize_matches_hand_computation() {
        // batch=1, seq=2, dim=2. Second token masked out, so the pooled vector
        // equals the first token's vector, then L2-normalized.
        let hidden = vec![3.0_f32, 4.0, 100.0, 100.0];
        let mask = vec![1_i64, 0];
        let out = embeddings_from_output(
            &EmbeddingOutput::TokenEmbeddings("last_hidden_state".to_string()),
            &mean_pooling(),
            true,
            OutputBatch {
                dims: &[1, 2, 2],
                data: &hidden,
                batch: 1,
                sequence_length: 2,
                attention_mask: &mask,
            },
        )
        .unwrap();
        let row = &out[0];
        assert!((row[0] - 0.6).abs() < 1e-5, "got {}", row[0]);
        assert!((row[1] - 0.8).abs() < 1e-5, "got {}", row[1]);
    }

    #[test]
    fn embeddings_from_2d_output_normalizes_rows() {
        let out = embeddings_from_output(
            &EmbeddingOutput::SentenceEmbedding("sentence_embedding".to_string()),
            &mean_pooling(),
            true,
            OutputBatch {
                dims: &[1, 2],
                data: &[3.0, 4.0],
                batch: 1,
                sequence_length: 1,
                attention_mask: &[1],
            },
        )
        .unwrap();
        assert!((out[0][0] - 0.6).abs() < 1e-5, "got {}", out[0][0]);
        assert!((out[0][1] - 0.8).abs() < 1e-5, "got {}", out[0][1]);
    }

    #[test]
    fn embeddings_from_2d_output_rejects_metadata_width_mismatch() {
        let error = embeddings_from_output(
            &EmbeddingOutput::SentenceEmbedding("sentence_embedding".to_string()),
            &mean_pooling(),
            false,
            OutputBatch {
                dims: &[1, 3],
                data: &[1.0, 2.0, 3.0],
                batch: 1,
                sequence_length: 1,
                attention_mask: &[1],
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("metadata-derived width"));
    }

    #[test]
    fn pooling_concatenates_standard_modes_in_sentence_transformers_order() {
        let pooling = PoolingConfig {
            word_embedding_dimension: 2,
            pooling_mode_cls_token: true,
            pooling_mode_max_tokens: true,
            pooling_mode_mean_tokens: true,
            pooling_mode_mean_sqrt_len_tokens: true,
            pooling_mode_weightedmean_tokens: true,
            pooling_mode_lasttoken: true,
        };
        let row = pool_token_embeddings(&[1.0, 2.0, 3.0, 4.0], 1, 2, 2, &[1, 1], &pooling)
            .unwrap()
            .remove(0);

        let expected = [
            1.0,
            2.0,
            3.0,
            4.0,
            2.0,
            3.0,
            4.0 / 2.0_f32.sqrt(),
            6.0 / 2.0_f32.sqrt(),
            7.0 / 3.0,
            10.0 / 3.0,
            3.0,
            4.0,
        ];
        assert_eq!(row.len(), expected.len());
        assert!(
            row.iter()
                .zip(expected)
                .all(|(actual, expected)| (actual - expected).abs() < 1e-5),
            "got {row:?}"
        );
    }

    #[test]
    fn sizing_tokenizer_clears_padding() {
        let mut vocab = HashMap::new();
        vocab.insert("[UNK]".to_string(), 0);
        vocab.insert("hello".to_string(), 1);
        let model = WordLevel::builder()
            .vocab(vocab.into_iter().collect())
            .unk_token("[UNK]".to_string())
            .build()
            .unwrap();
        let mut tokenizer = Tokenizer::new(model);
        tokenizer.with_padding(Some(PaddingParams {
            strategy: PaddingStrategy::Fixed(8),
            ..Default::default()
        }));

        assert_eq!(tokenizer.encode("hello", false).unwrap().get_ids().len(), 8);
        let sizing = tokenizer_for_sizing(&tokenizer);
        assert_eq!(sizing.encode("hello", false).unwrap().get_ids().len(), 1);
    }

    #[test]
    fn sentence_transformer_max_length_has_precedence() {
        let sentence = serde_json::json!({"max_seq_length": 256});
        let tokenizer = serde_json::json!({"model_max_length": 384});
        let model = serde_json::json!({"max_position_embeddings": 512});
        assert_eq!(
            canonical_max_length(Some(&sentence), Some(&tokenizer), &model).unwrap(),
            256
        );
        assert_eq!(
            canonical_max_length(None, Some(&tokenizer), &model).unwrap(),
            384
        );
        assert!(canonical_max_length(None, None, &serde_json::json!({})).is_err());
    }

    #[test]
    fn module_graph_rejects_dense_and_non_contiguous_modules() {
        let transformer = SentenceTransformerModule {
            idx: 0,
            path: String::new(),
            module_type: "sentence_transformers.models.Transformer".to_string(),
        };
        let pooling = SentenceTransformerModule {
            idx: 1,
            path: "1_Pooling".to_string(),
            module_type: "sentence_transformers.models.Pooling".to_string(),
        };
        assert!(validate_module_graph(&[transformer.clone(), pooling.clone()], "test").is_ok());

        let dense = SentenceTransformerModule {
            idx: 2,
            path: "2_Dense".to_string(),
            module_type: "sentence_transformers.models.Dense".to_string(),
        };
        assert!(
            validate_module_graph(&[transformer.clone(), pooling.clone(), dense], "test")
                .unwrap_err()
                .to_string()
                .contains("unsupported")
        );

        let mut non_contiguous = pooling;
        non_contiguous.idx = 3;
        assert!(validate_module_graph(&[transformer, non_contiguous], "test").is_err());
    }

    #[test]
    fn embedding_fingerprint_changes_with_revision_and_provider() {
        let pooling = mean_pooling();
        let first =
            embedding_fingerprint("sha-a", "onnx/model.onnx", &pooling, true, 256, 2, "cpu");
        let revision =
            embedding_fingerprint("sha-b", "onnx/model.onnx", &pooling, true, 256, 2, "cpu");
        let provider =
            embedding_fingerprint("sha-a", "onnx/model.onnx", &pooling, true, 256, 2, "coreml");
        assert_ne!(first, revision);
        assert_ne!(first, provider);
    }
}
