//! Quotation-only checkpoints: checked exact texts and matches commit together.
use super::*;
use ldaca_rs::quotation::{MODEL_SHA256, Quote};
use std::sync::{Mutex, mpsc};

const CHECKPOINT: &str = "quotation_checkpoint";
const EXTRACTOR_VERSION: u32 = 1;
const BATCH_SIZE: usize = 8;

#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub(crate) struct QuotationPartial {
    pub checked_texts: u64,
    pub total_texts: u64,
}
#[derive(Clone, Serialize, Deserialize)]
struct Checkpoint {
    version: u32,
    extractor_version: u32,
    model: String,
    generation: Uuid,
    manifest: QuotationResultV1,
    progress: QuotationPartial,
}
struct Work {
    checkpoint_id: Uuid,
    checkpoint: Checkpoint,
    todo: String,
    offset: u64,
}
type Batch = Vec<(String, String)>;
type Completed = Vec<(String, String, Vec<Quote>)>;

fn checkpoint(conn: &Connection, id: Uuid) -> Result<Option<(Uuid, Checkpoint)>> {
    let row: Option<(String, Vec<u8>)> = conn.query_row(
        "SELECT id::VARCHAR,content FROM wordflow.artifacts WHERE analysis_id=? AND name=? AND storage_kind='blob'",
        params![id.to_string(),CHECKPOINT], |r| Ok((r.get(0)?,r.get(1)?)),
    ).optional()?;
    row.map(|(artifact, bytes)| {
        let checkpoint: Checkpoint = serde_json::from_slice(&bytes)?;
        if checkpoint.version != 1 {
            return Err(Error::new(
                "analysis_version_unsupported",
                "Unsupported partial Quotation result version",
            ));
        }
        Ok((decode_uuid(&artifact)?, checkpoint))
    })
    .transpose()
}
pub(super) fn retained(conn: &Connection, id: Uuid) -> Result<Option<QuotationResultV1>> {
    Ok(checkpoint(conn, id)?.map(|(_, value)| value.manifest))
}
pub(in crate::project) fn partial(conn: &Connection, id: Uuid) -> Result<Option<QuotationPartial>> {
    Ok(checkpoint(conn, id)?.map(|(_, value)| value.progress))
}
fn claim(conn: &Connection, tab: Uuid, id: Uuid) -> Result<()> {
    claim_tab(conn, tab, "quotation")?;
    if conn.execute(
        "UPDATE wordflow.analyses SET request=request WHERE id=? AND tab_id=? AND result IS NULL",
        params![id.to_string(), tab.to_string()],
    )? != 1
    {
        return Err(Error::new(
            "analysis_unavailable",
            "The Quotation run was cleared, replaced or already completed",
        ));
    }
    Ok(())
}
impl Database {
    pub(in crate::project) fn quotation_resume(
        &self,
        tab: Uuid,
        request: &QuotationRequest,
    ) -> Result<Uuid> {
        let analysis = read_tab(&self.conn, tab)?
            .analysis
            .ok_or_else(|| Error::invalid("No partial Quotation run to resume"))?;
        let current = read_analysis(&self.conn, analysis.id)?;
        let (_, retained) = checkpoint(&self.conn, analysis.id)?.ok_or_else(|| {
            Error::invalid("No partial Quotation run to resume. Start a fresh Run.")
        })?;
        if current.kind != "quotation"
            || current.result.is_some()
            || current.request != serde_json::to_value(request)?
            || retained.extractor_version != EXTRACTOR_VERSION
            || retained.model != MODEL_SHA256
        {
            return Err(Error::invalid(
                "Extraction settings changed or this run is complete. Start a fresh Run.",
            ));
        }
        Ok(analysis.id)
    }
    fn start_quotation(
        &mut self,
        tab: Uuid,
        id: Uuid,
        request: &QuotationRequest,
        resume: bool,
    ) -> Result<Work> {
        if resume && self.quotation_resume(tab, request)? != id {
            return Err(Error::invalid("The partial run was replaced"));
        }
        let tx = self.conn.transaction()?;
        claim(&tx, tab, id)?;
        let mut docs = capture_documents(&tx, &request.input, None)?;
        distinct_documents(&tx, &mut docs)?;
        let (checkpoint_id, mut checkpoint) = if resume {
            checkpoint(&tx, id)?
                .ok_or_else(|| Error::invalid("No partial Quotation run to resume"))?
        } else {
            let documents = Uuid::new_v4();
            let matches = Uuid::new_v4();
            let projection_id = Uuid::new_v4();
            let documents_sql = format!("wordflow.{}", artifact_table(documents));
            let matches_sql = format!("wordflow.{}", artifact_table(matches));
            tx.execute_batch(&format!(
                "CREATE TABLE {documents_sql} AS SELECT ''::VARCHAR AS document_id,source FROM {} WHERE FALSE; CREATE TABLE {matches_sql}(document_id VARCHAR,{MATCH_COLUMNS}); CREATE VIEW wordflow.{} AS {}",
                docs.name,artifact_table(projection_id),projection(&documents_sql,&matches_sql)
            ))?;
            for (artifact, name) in [
                (documents, "documents"),
                (matches, "matches"),
                (projection_id, "projection"),
            ] {
                register_table(&tx, id, artifact, name)?;
            }
            let checkpoint_id = Uuid::new_v4();
            let checkpoint = Checkpoint {
                version: 1,
                extractor_version: EXTRACTOR_VERSION,
                model: MODEL_SHA256.into(),
                generation: Uuid::new_v4(),
                manifest: QuotationResultV1 {
                    input: docs.input.clone(),
                    columns: docs.columns.clone(),
                    documents,
                    matches,
                    projection: projection_id,
                    document_count: 0,
                    matching_documents: 0,
                    match_count: 0,
                    processed_column: Some(docs.input.column.clone()),
                },
                progress: QuotationPartial {
                    checked_texts: 0,
                    total_texts: docs.count,
                },
            };
            register_blob(
                &tx,
                id,
                checkpoint_id,
                CHECKPOINT,
                "application/vnd.wordflow.quotation-checkpoint+json",
                &serde_json::to_vec(&checkpoint)?,
            )?;
            (checkpoint_id, checkpoint)
        };
        let todo = temporary_name();
        let column = query::quote(&docs.input.column);
        let checked_column = query::quote(
            checkpoint
                .manifest
                .processed_column
                .as_ref()
                .ok_or_else(|| Error::invalid("Partial Quotation text binding is unavailable"))?,
        );
        tx.execute_batch(&format!(
            "CREATE TEMP TABLE {todo} AS SELECT uuid()::VARCHAR AS document_id,d.source FROM {} d WHERE NOT EXISTS (SELECT 1 FROM wordflow.{} p WHERE encode(p.source.{checked_column})=encode(d.source.{column}))",
            docs.name,artifact_table(checkpoint.manifest.documents)
        ))?;
        let pending: u64 =
            tx.query_row(&format!("SELECT count(*) FROM {todo}"), [], |r| r.get(0))?;
        checkpoint.generation = Uuid::new_v4();
        checkpoint.progress.total_texts = checkpoint.progress.checked_texts + pending;
        tx.execute(
            "UPDATE wordflow.artifacts SET content=? WHERE id=? AND analysis_id=?",
            params![
                serde_json::to_vec(&checkpoint)?,
                checkpoint_id.to_string(),
                id.to_string()
            ],
        )?;
        PendingChange::new(&tx, ChangeScope::analysis(id), &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(Work {
            checkpoint_id,
            checkpoint,
            todo,
            offset: 0,
        })
    }
    fn quotation_batch(&self, work: &mut Work, column: &str) -> Result<Batch> {
        check_cancellation(&self.cancellation)?;
        let rows=self.conn.prepare(&format!("SELECT document_id,source.{} FROM {} ORDER BY document_id LIMIT {BATCH_SIZE} OFFSET {}",query::quote(column),work.todo,work.offset))?.query_map([],|r|Ok((r.get(0)?,r.get(1)?)))?.collect::<duckdb::Result<Batch>>()?;
        work.offset += rows.len() as u64;
        Ok(rows)
    }
    fn commit_quotation_batch(
        &mut self,
        tab: Uuid,
        id: Uuid,
        work: &mut Work,
        completed: Completed,
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        claim(&tx, tab, id)?;
        let (_, current) =
            checkpoint(&tx, id)?.ok_or_else(|| Error::invalid("This Quotation run was cleared"))?;
        if current.generation != work.checkpoint.generation {
            return Err(Error::invalid("This Quotation run was superseded"));
        }
        let documents = format!("wordflow.{}", artifact_table(current.manifest.documents));
        let matches = format!("wordflow.{}", artifact_table(current.manifest.matches));
        let column = query::quote(current.manifest.processed_column.as_ref().ok_or_else(|| {
            Error::new(
                "analysis_corrupt",
                "Partial Quotation text binding is unavailable. Start a fresh Run.",
            )
        })?);
        let mut next = current;
        for (document_id, text, quotes) in completed {
            check_cancellation(&self.cancellation)?;
            tx.execute(
                &format!(
                    "INSERT INTO {documents} VALUES (?,struct_pack({column}:=CAST(? AS VARCHAR)))"
                ),
                params![document_id, text],
            )?;
            append_quotes(
                &tx,
                &matches,
                SqlValue::Text(document_id),
                quotes,
                &self.cancellation,
            )?;
            next.progress.checked_texts += 1;
        }
        tx.execute(
            "UPDATE wordflow.artifacts SET content=? WHERE id=? AND analysis_id=?",
            params![
                serde_json::to_vec(&next)?,
                work.checkpoint_id.to_string(),
                id.to_string()
            ],
        )?;
        PendingChange::new(&tx, ChangeScope::analysis(id), &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        work.checkpoint = next;
        Ok(())
    }
    fn finish_quotation(&mut self, tab: Uuid, id: Uuid) -> Result<Analysis> {
        let manifest = manifest(&self.conn, id)?;
        self.publish_analysis_version(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: "quotation",
            },
            2,
            None,
            move |_| Ok(serde_json::to_value(manifest)?),
        )
    }
    pub(in crate::project) fn run_quotation_parallel(
        &mut self,
        tab: Uuid,
        id: Uuid,
        request: QuotationRequest,
        bytes: Arc<Vec<u8>>,
        resume: bool,
        mut progress: impl FnMut(&str, Option<f64>),
    ) -> Result<Analysis> {
        let mut work = self.start_quotation(tab, id, &request, resume)?;
        let workers = std::thread::available_parallelism()
            .map_or(1, usize::from)
            .min(4);
        let cancellation = self.cancellation.child_token();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        std::thread::scope(|scope| -> Result<()> {
            let (jobs, supplied) = mpsc::sync_channel::<Batch>(workers);
            let supplied = Arc::new(Mutex::new(supplied));
            let (completed, results) = mpsc::sync_channel::<Result<Completed>>(workers);
            for _ in 0..workers {
                let supplied = supplied.clone();
                let completed = completed.clone();
                let bytes = bytes.clone();
                let cancellation = cancellation.clone();
                scope.spawn(move || {
                    let mut extractor =
                        match QuotationExtractor::from_bytes(&bytes).map_err(quote_error) {
                            Ok(extractor) => extractor,
                            Err(error) => {
                                let _ = completed.send(Err(error));
                                return;
                            }
                        };
                    loop {
                        let batch = match supplied
                            .lock()
                            .unwrap_or_else(std::sync::PoisonError::into_inner)
                            .recv()
                        {
                            Ok(batch) => batch,
                            Err(_) => break,
                        };
                        let result = batch
                            .into_iter()
                            .map(|(id, text)| {
                                check_cancellation(&cancellation)?;
                                let quotes = extractor.extract(&text).map_err(quote_error)?;
                                Ok((id, text, quotes))
                            })
                            .collect::<Result<Completed>>();
                        let failed = result.is_err();
                        if completed.send(result).is_err() || failed {
                            break;
                        }
                    }
                });
            }
            drop(completed);
            let mut active = 0;
            for _ in 0..workers {
                let batch = self.quotation_batch(&mut work, &request.input.column)?;
                if batch.is_empty() {
                    break;
                }
                jobs.send(batch).map_err(quote_error)?;
                active += 1;
            }
            while active > 0 {
                check_cancellation(&self.cancellation)?;
                match results.recv_timeout(std::time::Duration::from_millis(50)) {
                    Ok(result) => {
                        self.commit_quotation_batch(tab, id, &mut work, result?)?;
                        active -= 1;
                        let done = work.checkpoint.progress.checked_texts;
                        let total = work.checkpoint.progress.total_texts;
                        progress(
                            &format!("{done} of {total} distinct texts checked"),
                            Some(if total == 0 {
                                1.0
                            } else {
                                done as f64 / total as f64
                            }),
                        );
                        let batch = self.quotation_batch(&mut work, &request.input.column)?;
                        if !batch.is_empty() {
                            jobs.send(batch).map_err(quote_error)?;
                            active += 1;
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(error) => return Err(quote_error(error)),
                }
            }
            drop(jobs);
            Ok(())
        })?;
        progress("Saving completed Quotation run", Some(1.0));
        self.finish_quotation(tab, id)
    }
    #[cfg(test)]
    pub(in crate::project) fn run_quotation(
        &mut self,
        tab: Uuid,
        id: Uuid,
        request: QuotationRequest,
        mut extractor: QuotationExtractor,
        mut progress: impl FnMut(&str),
    ) -> Result<Analysis> {
        let mut work = self.start_quotation(tab, id, &request, false)?;
        loop {
            let batch = self.quotation_batch(&mut work, &request.input.column)?;
            if batch.is_empty() {
                break;
            }
            let completed = batch
                .into_iter()
                .map(|(id, text)| {
                    let quotes = extractor.extract(&text).map_err(quote_error)?;
                    Ok((id, text, quotes))
                })
                .collect::<Result<Completed>>()?;
            self.commit_quotation_batch(tab, id, &mut work, completed)?;
            progress("Extracting quotations");
        }
        self.finish_quotation(tab, id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup(project: &mut Project) -> (Uuid, Uuid, QuotationRequest) {
        project.database.conn.execute_batch("CREATE TABLE data.docs(text VARCHAR,category VARCHAR); INSERT INTO data.docs VALUES ('same','first'),('same','second'),('','empty'),(NULL,'absent'); INSERT INTO wordflow.nodes(table_name) VALUES ('docs')").unwrap();
        let tab = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "quotation".into(),
                name: None,
            })
            .unwrap()
            .id;
        let request = QuotationRequest {
            input: DocumentInput {
                source: "docs".into(),
                column: "text".into(),
            },
        };
        let id = project
            .database
            .begin_analysis_run(tab, "quotation", serde_json::to_value(&request).unwrap())
            .unwrap();
        (tab, id, request)
    }
    #[test]
    #[ignore = "subprocess helper for committed_quotation_checkpoint_recovers_after_process_exit"]
    fn quotation_checkpoint_crash_writer() {
        let path = std::env::var_os("WORDFLOW_QUOTATION_CRASH_PATH").expect("test-owned path");
        let mut project = Project::create(Path::new(&path)).unwrap();
        let (tab, id, request) = setup(&mut project);
        let mut work = project
            .database
            .start_quotation(tab, id, &request, false)
            .unwrap();
        project
            .database
            .commit_quotation_batch(
                tab,
                id,
                &mut work,
                vec![(Uuid::new_v4().to_string(), "same".into(), vec![])],
            )
            .unwrap();
        // Exit without dropping DuckDB so the parent must recover the committed WAL.
        std::process::exit(0);
    }
    #[test]
    fn committed_quotation_checkpoint_recovers_after_process_exit() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("crash.wfpj");
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "project::quotation::execution::tests::quotation_checkpoint_crash_writer",
            ])
            .env("WORDFLOW_QUOTATION_CRASH_PATH", &path)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let mut wal = path.as_os_str().to_os_string();
        wal.push(".wal");
        assert!(Path::new(&wal).exists());
        let project = Project::open(&path).unwrap();
        let tab = project.database.tabs(Some("quotation")).unwrap().remove(0);
        let summary = tab.analysis.unwrap();
        assert!(!summary.has_result);
        assert_eq!(summary.quotation_partial.unwrap().checked_texts, 1);
        assert_eq!(
            project
                .database
                .quotation_output(summary.id)
                .unwrap()
                .unwrap()
                .manifest
                .document_count,
            2
        );
    }
    #[test]
    fn checked_empty_results_survive_reopen_and_resume_without_rechecking() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("partial.wfpj");
        let mut project = Project::create(&path).unwrap();
        let (tab, id, request) = setup(&mut project);
        let mut first = project
            .database
            .start_quotation(tab, id, &request, false)
            .unwrap();
        project
            .database
            .commit_quotation_batch(
                tab,
                id,
                &mut first,
                vec![(Uuid::new_v4().to_string(), "same".into(), vec![])],
            )
            .unwrap();
        assert!(project.database.analysis(id).unwrap().result.is_none());
        drop(project);
        let mut project = Project::open(&path).unwrap();
        let summary = project
            .database
            .analysis_tab(tab)
            .unwrap()
            .analysis
            .unwrap();
        assert!(!summary.has_result);
        assert_eq!(summary.quotation_partial.unwrap().checked_texts, 1);
        let output = project.database.quotation_output(id).unwrap().unwrap();
        assert_eq!(output.manifest.document_count, 2);
        assert_eq!(output.manifest.match_count, 0);
        assert!(output.analysis.result.is_none());
        let mut resumed = project
            .database
            .start_quotation(tab, id, &request, true)
            .unwrap();
        let remaining = project
            .database
            .quotation_batch(&mut resumed, "text")
            .unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].1, "");
        assert!(
            project
                .database
                .commit_quotation_batch(
                    tab,
                    id,
                    &mut first,
                    vec![(Uuid::new_v4().to_string(), "late".into(), vec![])]
                )
                .is_err()
        );
        let published = project
            .database
            .publish_quotation(
                id,
                QuotationPublish {
                    projection: Projection::Documents,
                    name: "Published partial".into(),
                    metadata: vec!["category".into()],
                    fields: vec![],
                },
            )
            .unwrap();
        project
            .database
            .commit_quotation_batch(
                tab,
                id,
                &mut resumed,
                remaining
                    .into_iter()
                    .map(|(id, text)| (id, text, vec![]))
                    .collect(),
            )
            .unwrap();
        project.database.finish_quotation(tab, id).unwrap();
        assert!(
            project
                .database
                .quotation_output(id)
                .unwrap()
                .unwrap()
                .partial
                .is_none()
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row(
                    &format!(
                        "SELECT count(*) FROM {}",
                        published
                            .resolve(&project.database.conn)
                            .unwrap()
                            .relation
                            .sql()
                    ),
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            2
        );
        project.database.clear_analysis_tab(tab).unwrap();
        assert!(partial(&project.database.conn, id).unwrap().is_none());
        assert!(
            project
                .database
                .commit_quotation_batch(
                    tab,
                    id,
                    &mut resumed,
                    vec![(Uuid::new_v4().to_string(), "late".into(), vec![])]
                )
                .is_err()
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row(
                    "SELECT count(*) FROM data.\"Published partial\" WHERE QUOTE_extraction=''",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            2
        );
    }
    #[test]
    fn failed_batch_rolls_back_checked_texts_matches_and_progress() {
        let mut project = Project::untitled().unwrap();
        let (tab, id, request) = setup(&mut project);
        let mut work = project
            .database
            .start_quotation(tab, id, &request, false)
            .unwrap();
        let table = format!(
            "wordflow.{}",
            artifact_table(work.checkpoint.manifest.matches)
        );
        project
            .database
            .conn
            .execute_batch(&format!(
                "DROP TABLE {table}; CREATE TABLE {table}(document_id VARCHAR,{})",
                MATCH_COLUMNS.replace(
                    "quote_token_count BIGINT",
                    "quote_token_count BIGINT CHECK(quote_token_count>=0)"
                )
            ))
            .unwrap();
        let quote = Quote {
            speaker: None,
            quote: ("same".into(), 0, 4),
            verb: None,
            kind: "fixture".into(),
            tokens: -1,
            floating: false,
            index: 0,
        };
        assert!(
            project
                .database
                .commit_quotation_batch(
                    tab,
                    id,
                    &mut work,
                    vec![(Uuid::new_v4().to_string(), "same".into(), vec![quote])]
                )
                .is_err()
        );
        assert_eq!(
            partial(&project.database.conn, id)
                .unwrap()
                .unwrap()
                .checked_texts,
            0
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row(
                    &format!(
                        "SELECT count(*) FROM wordflow.{}",
                        artifact_table(work.checkpoint.manifest.documents)
                    ),
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            0
        );
        let changed = QuotationRequest {
            input: DocumentInput {
                source: "docs".into(),
                column: "category".into(),
            },
        };
        assert!(project.database.quotation_resume(tab, &changed).is_err());
    }
    #[test]
    fn live_details_require_the_clicked_exact_text_after_source_reordering() {
        let mut project = Project::untitled().unwrap();
        let (tab, id, request) = setup(&mut project);
        project
            .database
            .conn
            .execute_batch("INSERT INTO data.docs VALUES ('other','other')")
            .unwrap();
        let mut work = project
            .database
            .start_quotation(tab, id, &request, false)
            .unwrap();
        let rows = ["same", "other"]
            .into_iter()
            .map(|text| {
                (
                    Uuid::new_v4().to_string(),
                    text.into(),
                    vec![Quote {
                        speaker: None,
                        quote: (text.into(), 0, text.len() as i64),
                        verb: None,
                        kind: "fixture".into(),
                        tokens: 1,
                        floating: false,
                        index: 0,
                    }],
                )
            })
            .collect();
        project
            .database
            .commit_quotation_batch(tab, id, &mut work, rows)
            .unwrap();
        let query = QuotationQuery {
            projection: Projection::Documents,
            page: 1,
            page_size: 1,
            sort: None,
            document_id: Some("1".into()),
            expected_text: Some("same".into()),
        };
        assert_eq!(
            project
                .database
                .quotation_page(id, query.clone())
                .unwrap()
                .document_count,
            1
        );
        project
            .database
            .conn
            .execute_batch("DELETE FROM data.docs WHERE text IS DISTINCT FROM 'other'")
            .unwrap();
        let mut reader = project
            .database
            .connection(CancellationToken::new())
            .unwrap();
        assert_eq!(
            reader.quotation_page(id, query).err().unwrap().code,
            "result_stale"
        );
    }
}
