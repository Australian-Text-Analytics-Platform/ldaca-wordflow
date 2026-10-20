//! Opt-in external-file worker. The launcher owns processes, private paths and reports.
use super::*;
use crate::project::document_matches::DocumentInput;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, time::Instant};

#[derive(Clone, Deserialize)]
struct Case {
    input: PathBuf,
    output: PathBuf,
    model_root: PathBuf,
    embedding_cache: PathBuf,
    analysis: String,
    size: Option<u64>,
    seed: u64,
    table: Option<String>,
    column: Option<String>,
    #[serde(default)]
    provision: bool,
}

fn select_table(names: &[String], selected: Option<&str>) -> Result<String> {
    match selected {
        Some(name) if names.iter().any(|candidate| candidate == name) => Ok(name.into()),
        Some(_) => Err(Error::invalid("--table is not an imported Data Block")),
        None if names.len() == 1 => Ok(names[0].clone()),
        None => Err(Error::invalid(
            "Import has multiple Data Blocks; specify --table",
        )),
    }
}

fn rank(seed: u64, ordinal: u64) -> [u8; 32] {
    Sha256::digest(format!("{seed}:{ordinal}").as_bytes()).into()
}

fn sample(count: u64, size: Option<u64>, seed: u64) -> Result<Vec<u64>> {
    let size = size.unwrap_or(count);
    if size == 0 || size > count {
        return Err(Error::invalid(
            "Sample size must be positive and no larger than the imported row count",
        ));
    }
    let mut rows = (0..count).map(|i| (rank(seed, i), i)).collect::<Vec<_>>();
    rows.sort_unstable();
    let mut selected = rows
        .into_iter()
        .take(size as usize)
        .map(|(_, i)| i)
        .collect::<Vec<_>>();
    selected.sort_unstable();
    Ok(selected)
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    fs::write(path, serde_json::to_vec_pretty(value)?)?;
    Ok(())
}

struct Recorder {
    start: Instant,
    file: fs::File,
    stages: Vec<Value>,
}
impl Recorder {
    fn event(&mut self, stage: &str) {
        if self
            .stages
            .last()
            .is_some_and(|last| last["stage"] == stage)
        {
            return;
        }
        let unix_seconds = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs_f64();
        let event = json!({"stage":stage,"seconds":self.start.elapsed().as_secs_f64(),"unix_seconds":unix_seconds});
        writeln!(self.file, "{event}").unwrap();
        self.file.flush().unwrap();
        self.stages.push(event);
    }
}

async fn runtime(case: &Case) -> Result<(ProjectRuntime, tempfile::TempDir)> {
    let work = tempfile::tempdir_in(&case.output)?;
    let mut paths = wordflow_storage::AppDirectories::browser(work.path())?;
    paths.cache = case.model_root.clone();
    paths.create()?;
    let runtime = ProjectRuntime::new(CancellationToken::new());
    runtime.set_storage(paths)?;
    runtime.set_embedding_cache_path(case.embedding_cache.clone())?;
    runtime
        .create(Some(work.path().join("benchmark.wfpj")))
        .await?;
    Ok((runtime, work))
}

fn topic_request(seed: u64, table: String, column: String) -> topic_modeling::TopicRequest {
    serde_json::from_value(json!({
        "inputs":[{"source":{"schema":"data","name":table},"column":column}],
        "embedding_model":topic_modeling::MODELS[0].id,"tokenizer":"native:plain_words_en",
        "segmentation":"automatic","max_segment_tokens":256,"minimum_topic_size":10,
        "maximum_topic_size":null,"requested_topic_count":null,"seed":seed
    }))
    .unwrap()
}

async fn provision(case: &Case, runtime: &ProjectRuntime) -> Result<Value> {
    if case.analysis == "topic" {
        let assets = runtime.model_assets()?.unwrap();
        let model = tokio::task::spawn_blocking(move || {
            ldaca_rs::embedding::Embedder::load_in(Some(topic_modeling::MODELS[0].id), &assets)
                .map_err(|error| Error::invalid(error.to_string()))
        })
        .await??;
        Ok(
            json!({"model":model.model_id(),"fingerprint":model.cache_fingerprint(),"configured_provider":model.provider_id(),"fallback_reason":model.provider_fallback_reason()}),
        )
    } else {
        quotation::prepare_model(
            runtime.client().clone(),
            CancellationToken::new(),
            runtime.quotation_path()?,
        )
        .await?;
        Ok(
            json!({"model":ldaca_rs::quotation::MODEL_FILENAME,"fingerprint":ldaca_rs::quotation::MODEL_SHA256}),
        )
    }
}

struct PreparedInput {
    sample_table: String,
    column: String,
    rows: Vec<u64>,
    input_stats: Value,
    total: u64,
    imported: imports::FileImportResult,
    import_seconds: f64,
}

async fn import_input(case: &Case, runtime: &ProjectRuntime) -> Result<PreparedInput> {
    let started = Instant::now();
    let imported = runtime
        .import_files(imports::FileImportRequest {
            paths: vec![case.input.clone()],
            root: None,
            selected: None,
        })
        .await?;
    let import_seconds = started.elapsed().as_secs_f64();
    let table = select_table(&imported.table_names, case.table.as_deref())?;
    let requested_column = case.column.clone();
    let collection = case
        .input
        .extension()
        .and_then(|v| v.to_str())
        .is_some_and(|v| {
            v.eq_ignore_ascii_case("zip")
                || imports::TEXT_EXTENSIONS
                    .iter()
                    .any(|ext| v.eq_ignore_ascii_case(ext))
        });
    let size = case.size;
    let seed = case.seed;
    let (sample_table, column, rows, input_stats, total) = runtime.with_writable_project(move |db| {
        let relation = Relation {schema:"data".into(),name:table.clone()};
        let columns = mutations::columns(&db.conn, &relation)?;
        let text_collection = collection && ["file_path","base_name","extension","document"].iter().all(|field|columns.iter().any(|(name,_)|name==field));
        let column = requested_column.or_else(|| text_collection.then(|| "document".into()))
            .ok_or_else(|| Error::invalid("Tabular inputs require --column"))?;
        if !columns.iter().any(|(name, kind)| name == &column && kind == "VARCHAR") {
            return Err(Error::invalid("--column must identify an imported text column"));
        }
        let total: u64 = db.conn.query_row(&format!("SELECT count(*) FROM {}",relation.sql()),[],|r|r.get(0))?;
        let selected = sample(total,size,seed)?;
        db.conn.execute_batch("CREATE TEMP TABLE benchmark_selection(ordinal UBIGINT)")?;
        {
            let mut append = db.conn.appender("benchmark_selection")?;
            for ordinal in &selected { append.append_row(params![ordinal])?; }
            append.flush()?;
        }
        let sampled = unique_object_name(&db.conn,"data","benchmark_input",true,&[])?;
        let target = format!("data.{}",query::quote(&sampled));
        let ordinal = query::quote(&format!("profile_{}",Uuid::new_v4().simple()));
        db.conn.execute_batch(&format!(
            "CREATE TABLE {target} AS WITH numbered AS MATERIALIZED (SELECT row_number() OVER ()-1 AS {ordinal},* FROM {}) SELECT src.* EXCLUDE({ordinal}) FROM numbered src JOIN benchmark_selection picked ON src.{ordinal}=picked.ordinal ORDER BY src.{ordinal}; INSERT INTO wordflow.nodes(table_name,document_column) VALUES ({},{})",
            relation.sql(), query::literal(&sampled), query::literal(&column)
        ))?;
        let field = query::quote(&column);
        let stats = db.conn.query_row(&format!("SELECT count(*),count(DISTINCT {field}) FILTER(WHERE length(trim({field}))>0),count(*) FILTER(WHERE {field} IS NULL OR length(trim({field}))=0),coalesce(sum(octet_length(encode({field}))),0)::UBIGINT,count({field}) FROM {target}"), [], |r| Ok(json!({"rows":r.get::<_,u64>(0)?,"distinct_nonblank_texts":r.get::<_,u64>(1)?,"blank_or_null_rows":r.get::<_,u64>(2)?,"text_bytes":r.get::<_,u64>(3)?,"nonnull_rows":r.get::<_,u64>(4)?})))?;
        Ok((sampled,column,selected,stats,total))
    }).await?;
    write_json(&case.output.join("sample.json"), &rows)?;
    write_json(
        &case.output.join("import.json"),
        &json!({"total_rows":total,"selected":input_stats,"skipped":imported.skipped,"seconds":import_seconds}),
    )?;
    eprintln!(
        "Imported {total} rows, selected {}, skipped {} files",
        rows.len(),
        imported.skipped.len()
    );
    Ok(PreparedInput {
        sample_table,
        column,
        rows,
        input_stats,
        total,
        imported,
        import_seconds,
    })
}

async fn measure(case: Case) -> Result<Value> {
    fs::create_dir_all(&case.output)?;
    let (runtime, _work) = runtime(&case).await?;
    if case.provision {
        let model = provision(&case, &runtime).await?;
        runtime.close().await?;
        return Ok(json!({"status":"provisioned","model":model}));
    }
    let PreparedInput {
        sample_table,
        column,
        rows,
        input_stats,
        total,
        imported,
        import_seconds,
    } = import_input(&case, &runtime).await?;
    let kind = if case.analysis == "topic" {
        "topic-modeling"
    } else {
        "quotation"
    };
    let tab = runtime
        .create_analysis_tab(CreateTab {
            kind: kind.into(),
            name: None,
        })
        .await?;
    let recorder = Arc::new(Mutex::new(Recorder {
        start: Instant::now(),
        file: fs::File::create(case.output.join("events.jsonl"))?,
        stages: vec![],
    }));
    let capture = recorder.clone();
    runtime
        .shared
        .tasks
        .observe_progress(Arc::new(move |_, progress| {
            // Quotation's count messages describe one continuous extraction/write stage.
            let stage = if progress.message == "Loading quotation model" {
                "Loading quotation model and first batch"
            } else if progress.message.ends_with("distinct texts checked") {
                "Extracting and committing quotations"
            } else {
                &progress.message
            };
            capture.lock().unwrap().event(stage);
        }));
    recorder.lock().unwrap().event("Submitting analysis");
    let cache_before = fs::metadata(&case.embedding_cache).map_or(0, |file| file.len());
    let started = Instant::now();
    let original_table = sample_table.clone();
    let analysis = if case.analysis == "topic" {
        runtime
            .submit_topic_model(tab.id, topic_request(case.seed, sample_table, column))
            .await?
            .wait()
            .await?
    } else {
        runtime
            .submit_quotation(
                tab.id,
                quotation::QuotationRequest {
                    input: DocumentInput {
                        source: ObjectTarget {
                            schema: Some("data".into()),
                            name: sample_table,
                        },
                        column,
                    },
                },
                false,
            )
            .await?
            .wait()
            .await?
    };
    let seconds = started.elapsed().as_secs_f64();
    recorder.lock().unwrap().event("Analysis complete");
    let stages = recorder.lock().unwrap().stages.clone();
    let mut durations = Vec::new();
    for pair in stages.windows(2) {
        durations.push(json!({"stage":pair[0]["stage"],"seconds":pair[1]["seconds"].as_f64().unwrap()-pair[0]["seconds"].as_f64().unwrap()}));
    }
    let payload = analysis
        .result
        .as_ref()
        .ok_or_else(|| Error::invalid("Analysis did not save a result"))?
        .payload
        .clone();
    let query_started = Instant::now();
    let saved_id = analysis.id;
    runtime
        .with_project(move |db| read_analysis(&db.conn, saved_id))
        .await?;
    let output = if case.analysis == "topic" {
        let manifest: topic_modeling::TopicResultV1 = serde_json::from_value(payload)?;
        assert_eq!(
            manifest
                .sources
                .iter()
                .map(|source| source.total_count as usize)
                .sum::<usize>(),
            rows.len()
        );
        let query = if manifest.natural_topic_count > 0 {
            topic_modeling::TopicQuery::Map {
                topic_count: manifest.natural_topic_count,
                colour_by: None,
            }
        } else {
            topic_modeling::TopicQuery::Words {
                topic_count: 0,
                stopword_source: None,
            }
        };
        // No-topic results have no map; the saved manifest is still a valid result.
        if manifest.natural_topic_count > 0 {
            runtime.query_topic_model(analysis.id, query).await?;
        }
        json!({"documents":manifest.sources.iter().map(|source|source.document_count).sum::<usize>(),"segments":manifest.segment_count,"topics":manifest.natural_topic_count,"resolved_model":manifest.resolved_model})
    } else {
        let manifest: quotation::QuotationResultV1 = serde_json::from_value(payload)?;
        assert_eq!(
            manifest.document_count,
            input_stats["nonnull_rows"].as_u64().unwrap()
        );
        runtime.quotation_page(analysis.id,serde_json::from_value(json!({"projection":"documents","page":1,"page_size":20,"sort":null,"document_id":null}))?).await?;
        json!({"documents":manifest.document_count,"matching_documents":manifest.matching_documents,"quotations":manifest.match_count})
    };
    let read_seconds = query_started.elapsed().as_secs_f64();
    let source_rows_after: u64 = runtime
        .with_project(move |db| {
            Ok(db.conn.query_row(
                &format!(
                    "SELECT count(*) FROM data.{}",
                    query::quote(&original_table)
                ),
                [],
                |row| row.get(0),
            )?)
        })
        .await?;
    assert_eq!(source_rows_after, rows.len() as u64);
    let model = provision(&case, &runtime).await?;
    runtime.close().await?;
    let cache_after = fs::metadata(&case.embedding_cache).map_or(0, |file| file.len());
    Ok(
        json!({"status":"succeeded","analysis":case.analysis,"import_seconds":import_seconds,
        "input":input_stats,"imported_rows":total,"skipped_files":imported.skipped.len(),
        "analysis_seconds":seconds,"documents_per_second":rows.len() as f64/seconds,
        "saved_read_seconds":read_seconds,"stages":durations,"output":output,"model":model,"source_rows_after":source_rows_after,
        "request":analysis.request,"embedding_cache_bytes_before":cache_before,"embedding_cache_bytes_after":cache_after,
        "available_processors":std::thread::available_parallelism().map_or(1,usize::from)}),
    )
}

#[tokio::test]
#[ignore = "external private corpus; invoke scripts/profile-analyses.mjs"]
async fn external_file_profile_worker() {
    let path = std::env::var_os("WORDFLOW_PROFILE_CASE").expect("Use scripts/profile-analyses.mjs");
    let case: Case = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    let output = case.output.clone();
    let result = measure(case).await;
    match result {
        Ok(result) => write_json(&output.join("result.json"), &result).unwrap(),
        Err(error) => {
            write_json(
                &output.join("result.json"),
                &json!({"status":"failed","error":error.to_string()}),
            )
            .unwrap();
            panic!("External-file benchmark failed; see private result.json");
        }
    }
}

#[test]
fn samples_are_nested_preserve_order_and_reject_oversized_requests() {
    let small = sample(100, Some(10), 7).unwrap();
    let large = sample(100, Some(30), 7).unwrap();
    assert!(small.iter().all(|i| large.contains(i)));
    assert!(large.windows(2).all(|pair| pair[0] < pair[1]));
    assert_eq!(large, sample(100, Some(30), 7).unwrap());
    assert_ne!(large, sample(100, Some(30), 8).unwrap());
    assert!(sample(3, Some(4), 7).is_err());
    assert!(sample(0, None, 7).is_err());
    assert_eq!(sample(3, None, 7).unwrap(), vec![0, 1, 2]);
}

#[tokio::test]
async fn external_import_selection_keeps_rows_and_requires_a_text_column() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("input.csv");
    fs::write(&input, "text,n\nhello,1\nhello,2\n,3\n").unwrap();
    let mut case = Case {
        input,
        output: root.path().join("run"),
        model_root: root.path().join("models"),
        embedding_cache: root.path().join("embeddings.duckdb"),
        analysis: "topic".into(),
        size: None,
        seed: 7,
        table: None,
        column: None,
        provision: false,
    };
    let error = measure(case.clone()).await.unwrap_err();
    assert!(error.message.contains("--column"));
    assert!(select_table(&["a".into(), "b".into()], None).is_err());
    assert!(select_table(&["a".into()], Some("b")).is_err());
    case.column = Some("text".into());
    let (runtime, _work) = runtime(&case).await.unwrap();
    let prepared = import_input(&case, &runtime).await.unwrap();
    assert_eq!(prepared.input_stats["rows"], 3);
    assert_eq!(prepared.input_stats["nonnull_rows"], 2);
    assert_eq!(prepared.input_stats["distinct_nonblank_texts"], 1);
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn imported_zip_views_keep_whole_text_rows_and_original_metadata() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("mixed.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(&input).unwrap());
    for (name, text) in [
        ("b.txt", "same\nwhole text"),
        ("a.txt", "same\nwhole text"),
        (".hidden.txt", "hidden"),
        ("lookup.csv", "id\n1\n"),
    ] {
        archive
            .start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        archive.write_all(text.as_bytes()).unwrap();
    }
    archive.finish().unwrap();
    let mut case = Case {
        input,
        output: root.path().join("run"),
        model_root: root.path().join("models"),
        embedding_cache: root.path().join("embeddings.duckdb"),
        analysis: "topic".into(),
        size: None,
        seed: 7,
        table: None,
        column: None,
        provision: false,
    };
    fs::create_dir_all(&case.output).unwrap();
    let (runtime, _work) = runtime(&case).await.unwrap();
    let error = import_input(&case, &runtime).await.err().unwrap();
    assert!(error.message.contains("--table"));
    runtime.close().await.unwrap();
    case.table = Some("mixed".into());
    let (runtime, _work) = self::runtime(&case).await.unwrap();
    let prepared = import_input(&case, &runtime).await.unwrap();
    assert_eq!(prepared.input_stats["rows"], 2);
    assert_eq!(prepared.input_stats["distinct_nonblank_texts"], 1);
    let table = prepared.sample_table;
    let values = runtime
        .with_project(move |db| {
            Ok(db
                .conn
                .prepare(&format!(
                    "SELECT file_path,document FROM data.{}",
                    query::quote(&table)
                ))?
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<duckdb::Result<Vec<_>>>()?)
        })
        .await
        .unwrap();
    assert_eq!(
        values,
        [
            ("a.txt".into(), "same\nwhole text".into()),
            ("b.txt".into(), "same\nwhole text".into())
        ]
    );
    runtime.close().await.unwrap();
    case.column = Some("missing".into());
    let (runtime, _work) = self::runtime(&case).await.unwrap();
    assert!(
        import_input(&case, &runtime)
            .await
            .err()
            .unwrap()
            .message
            .contains("text column")
    );
    runtime.close().await.unwrap();
}
