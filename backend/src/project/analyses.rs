//! Tabs own submitted analyses; analyses own optional completed output and artifacts.
use super::*;
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Tab {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub position: i64,
    pub settings: Value,
    #[schema(required = true)]
    pub analysis: Option<AnalysisSummary>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct AnalysisSummary {
    pub id: Uuid,
    pub created_at: String,
    pub request: Value,
    pub has_result: bool,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateTab {
    pub kind: String,
    pub name: Option<String>,
}
impl Default for CreateTab {
    fn default() -> Self {
        Self {
            kind: "frequency".into(),
            name: None,
        }
    }
}
#[derive(Default, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct UpdateTab {
    pub name: Option<String>,
    pub settings: Option<Value>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Analysis {
    pub id: Uuid,
    pub tab_id: Uuid,
    pub kind: String,
    pub request: Value,
    pub created_at: String,
    #[schema(required = true)]
    pub result: Option<AnalysisOutput>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct AnalysisOutput {
    pub version: i32,
    pub payload: Value,
    pub finished_at: String,
}
impl Analysis {
    pub(super) fn output(&self, kind: &str) -> Result<&Value> {
        let result = self.result.as_ref().ok_or_else(|| {
            Error::new(
                "result_unavailable",
                "This analysis has no saved output. Run the analysis to calculate results.",
            )
        })?;
        if self.kind != kind || result.version != 1 {
            return Err(Error::new(
                "analysis_version_unsupported",
                "This analysis result version is not supported",
            ));
        }
        Ok(&result.payload)
    }
}
impl Database {
    pub(super) fn analysis_tab(&self, id: Uuid) -> Result<Tab> {
        read_tab(&self.conn, id)
    }
    pub(super) fn tabs(&self, kind: Option<&str>) -> Result<Vec<Tab>> {
        read_tabs(&self.conn, kind)
    }
    pub(super) fn create_analysis_tab(&mut self, request: CreateTab) -> Result<Tab> {
        let tx = self.conn.transaction()?;
        let label = match request.kind.as_str() {
            "annotation" => "Annotation",
            "frequency" => "Frequency",
            "concordance" => "Concordance",
            "quotation" => "Quotation",
            "topic-modeling" => "Topic Modelling",
            "trends" => "Trends",
            "compare" => "Compare",
            "scatter" => "Scatter",
            "heatmap" => "Heatmap",
            "sankey" => "Sankey",
            _ => return Err(Error::invalid("Unsupported analysis kind")),
        };
        let name = match request.name {
            Some(name) => tab_name(name)?,
            None => {
                let names = tx
                    .prepare("SELECT name FROM wordflow.tabs WHERE kind=?")?
                    .query_map([&request.kind], |row| row.get::<_, String>(0))?
                    .collect::<duckdb::Result<HashSet<_>>>()?;
                let mut number = 1;
                while names.contains(&format!("{label} {number}")) {
                    number += 1;
                }
                format!("{label} {number}")
            }
        };
        let id = Uuid::new_v4();
        tx.execute("INSERT INTO wordflow.tabs(id,kind,name,position) SELECT ?,?,?,coalesce(max(position)+1,0) FROM wordflow.tabs WHERE kind=?", params![id.to_string(), request.kind, name, request.kind])?;
        let tab = read_tab(&tx, id)?;
        PendingChange::new(
            &tx,
            ChangeScope::resource(Resource::Tabs),
            &self.cancellation,
        )
        .commit(tx, &self.changes, &self.cancellation)?;
        Ok(tab)
    }
    pub(super) fn update_analysis_tab(&mut self, id: Uuid, request: UpdateTab) -> Result<Tab> {
        let tx = self.conn.transaction()?;
        read_tab(&tx, id)?;
        if let Some(name) = request.name {
            tx.execute(
                "UPDATE wordflow.tabs SET name=? WHERE id=?",
                params![tab_name(name)?, id.to_string()],
            )?;
        }
        if let Some(mut settings) = request.settings {
            let Some(object) = settings.as_object_mut() else {
                return Err(Error::invalid("Tab settings must be an object"));
            };
            if let Some(manual) = read_tab(&tx, id)?.settings.get("manual") {
                object.insert("manual".into(), manual.clone());
            } else {
                object.remove("manual");
            }
            tx.execute(
                "UPDATE wordflow.tabs SET settings=? WHERE id=?",
                params![settings.to_string(), id.to_string()],
            )?;
        }
        let tab = read_tab(&tx, id)?;
        PendingChange::new(
            &tx,
            ChangeScope::resource(Resource::Tabs),
            &self.cancellation,
        )
        .commit(tx, &self.changes, &self.cancellation)?;
        Ok(tab)
    }
    pub(super) fn reorder_tabs(&mut self, kind: &str, ids: Vec<Uuid>) -> Result<Vec<Tab>> {
        let tx = self.conn.transaction()?;
        let existing = read_tabs(&tx, Some(kind))?;
        let selected = ids.iter().copied().collect::<HashSet<_>>();
        if selected.len() != ids.len()
            || selected != existing.iter().map(|tab| tab.id).collect::<HashSet<_>>()
        {
            return Err(Error::invalid(
                "Ordering must contain every analysis tab exactly once",
            ));
        }
        for (index, id) in ids.into_iter().enumerate() {
            tx.execute(
                "UPDATE wordflow.tabs SET position=? WHERE id=?",
                params![index as i64, id.to_string()],
            )?;
        }
        let tabs = read_tabs(&tx, Some(kind))?;
        PendingChange::new(
            &tx,
            ChangeScope::resource(Resource::Tabs),
            &self.cancellation,
        )
        .commit(tx, &self.changes, &self.cancellation)?;
        Ok(tabs)
    }
    pub(super) fn delete_analysis_tab(&mut self, id: Uuid) -> Result<()> {
        self.clear_or_delete(id, true)
    }
    pub(super) fn clear_analysis_tab(&mut self, id: Uuid) -> Result<()> {
        self.clear_or_delete(id, false)
    }
    pub(super) fn begin_analysis_run(
        &mut self,
        tab_id: Uuid,
        kind: &str,
        request: Value,
    ) -> Result<Uuid> {
        let tx = self.conn.transaction()?;
        claim_tab(&tx, tab_id, kind)?;
        let previous = read_tab(&tx, tab_id)?.analysis;
        if let Some(previous) = &previous {
            delete_analysis(&tx, previous.id)?;
        }
        let id = Uuid::new_v4();
        tx.execute(
            "INSERT INTO wordflow.analyses(id,tab_id,request) VALUES (?,?,?)",
            params![id.to_string(), tab_id.to_string(), request.to_string()],
        )?;
        let mut scope = ChangeScope::analysis(id);
        if let Some(previous) = previous {
            scope.analysis_ids.push(previous.id);
        }
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(id)
    }
    fn clear_or_delete(&mut self, tab_id: Uuid, delete: bool) -> Result<()> {
        let tx = self.conn.transaction()?;
        let tab = read_tab(&tx, tab_id)?;
        claim_tab(&tx, tab_id, &tab.kind)?;
        let mut scope = ChangeScope::resource(Resource::Tabs);
        if let Some(analysis) = tab.analysis {
            scope.analysis_ids.push(analysis.id);
            if delete {
                delete_analysis(&tx, analysis.id)?;
            } else {
                delete_artifacts(&tx, analysis.id)?;
                tx.execute("UPDATE wordflow.analyses SET result=NULL,result_version=NULL,finished_at=NULL WHERE id=?", [analysis.id.to_string()])?;
            }
        }
        if delete {
            tx.execute("DELETE FROM wordflow.tabs WHERE id=?", [tab_id.to_string()])?;
        }
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )
    }
    pub(super) fn analysis(&self, id: Uuid) -> Result<Analysis> {
        read_analysis(&self.conn, id)
    }
    pub(super) fn publish_analysis(
        &mut self,
        accepted: AcceptedAnalysis,
        write: impl FnOnce(&Connection) -> Result<Value>,
    ) -> Result<Analysis> {
        self.publish_analysis_with_scope(accepted, None, write)
    }
    pub(super) fn publish_analysis_with_scope(
        &mut self,
        accepted: AcceptedAnalysis,
        source: Option<Relation>,
        write: impl FnOnce(&Connection) -> Result<Value>,
    ) -> Result<Analysis> {
        let tx = self.conn.transaction()?;
        claim_tab(&tx, accepted.tab_id, accepted.kind)?;
        let claimed = tx.execute("UPDATE wordflow.analyses SET request=request WHERE id=? AND tab_id=? AND result IS NULL", params![accepted.id.to_string(),accepted.tab_id.to_string()])?;
        if claimed != 1 {
            return Err(Error::new(
                "analysis_unavailable",
                "The submitted analysis was removed, replaced or already completed",
            ));
        }
        let payload = write(&tx)?;
        tx.execute("UPDATE wordflow.analyses SET result=?,result_version=1,finished_at=current_timestamp WHERE id=?", params![payload.to_string(),accepted.id.to_string()])?;
        let analysis = read_analysis(&tx, accepted.id)?;
        let mut scope = ChangeScope::analysis(accepted.id);
        if let Some(source) = source {
            scope.objects.push(source);
        }
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(analysis)
    }
}
pub(super) struct AcceptedAnalysis {
    pub id: Uuid,
    pub tab_id: Uuid,
    pub kind: &'static str,
}
pub(super) fn claim_tab(conn: &Connection, id: Uuid, kind: &str) -> Result<()> {
    // DuckDB can elide unchanged updates. Two reversible writes claim the row
    // without persisting a lock field or changing the tab's final position.
    if conn.execute(
        "UPDATE wordflow.tabs SET position = ~position WHERE id=? AND kind=?",
        params![id.to_string(), kind],
    )? != 1
    {
        return Err(Error::new(
            "analysis_tab_not_found",
            "Analysis tab is unavailable or has a different kind",
        ));
    }
    conn.execute(
        "UPDATE wordflow.tabs SET position = ~position WHERE id=?",
        [id.to_string()],
    )?;
    Ok(())
}
fn tab_name(name: String) -> Result<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 200 {
        return Err(Error::invalid(
            "Analysis name must contain between 1 and 200 characters",
        ));
    }
    Ok(name.into())
}
pub(super) fn decode_uuid(value: &str) -> Result<Uuid> {
    Uuid::parse_str(value).map_err(|_| Error::new("analysis_corrupt", "Invalid analysis identity"))
}
fn read_tabs(conn: &Connection, kind: Option<&str>) -> Result<Vec<Tab>> {
    let mut statement = conn.prepare("SELECT t.id::VARCHAR,t.kind,t.name,t.position,t.settings::VARCHAR,a.id::VARCHAR,a.request::VARCHAR,a.result IS NOT NULL,a.created_at::VARCHAR FROM wordflow.tabs t LEFT JOIN wordflow.analyses a ON a.tab_id=t.id WHERE (? IS NULL OR t.kind=?) ORDER BY t.position,t.id")?;
    let mut rows = statement.query(params![kind, kind])?;
    let mut tabs = Vec::new();
    while let Some(row) = rows.next()? {
        tabs.push(Tab {
            id: decode_uuid(&row.get::<_, String>(0)?)?,
            kind: row.get(1)?,
            name: row.get(2)?,
            position: row.get(3)?,
            settings: serde_json::from_str(&row.get::<_, String>(4)?)?,
            analysis: row
                .get::<_, Option<String>>(5)?
                .map(|id| {
                    Ok::<_, Error>(AnalysisSummary {
                        id: decode_uuid(&id)?,
                        request: serde_json::from_str(&row.get::<_, String>(6)?)?,
                        has_result: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                })
                .transpose()?,
        });
    }
    Ok(tabs)
}
pub(super) fn read_tab(conn: &Connection, id: Uuid) -> Result<Tab> {
    read_tabs(conn, None)?
        .into_iter()
        .find(|tab| tab.id == id)
        .ok_or_else(|| {
            Error::new(
                "analysis_tab_not_found",
                "Analysis tab is no longer available",
            )
        })
}
pub(super) fn read_analysis(conn: &Connection, id: Uuid) -> Result<Analysis> {
    let mut statement = conn.prepare("SELECT a.id::VARCHAR,a.tab_id::VARCHAR,t.kind,a.request::VARCHAR,a.created_at::VARCHAR,a.result::VARCHAR,a.result_version,a.finished_at::VARCHAR FROM wordflow.analyses a JOIN wordflow.tabs t ON t.id=a.tab_id WHERE a.id=?")?;
    let mut rows = statement.query([id.to_string()])?;
    let row = rows
        .next()?
        .ok_or_else(|| Error::new("analysis_not_found", "Analysis is no longer available"))?;
    Ok(Analysis {
        id: decode_uuid(&row.get::<_, String>(0)?)?,
        tab_id: decode_uuid(&row.get::<_, String>(1)?)?,
        kind: row.get(2)?,
        request: serde_json::from_str(&row.get::<_, String>(3)?)?,
        created_at: row.get(4)?,
        result: row
            .get::<_, Option<String>>(5)?
            .map(|payload| {
                Ok::<_, Error>(AnalysisOutput {
                    payload: serde_json::from_str(&payload)?,
                    version: row.get(6)?,
                    finished_at: row.get(7)?,
                })
            })
            .transpose()?,
    })
}
pub(super) fn artifact_table(id: Uuid) -> String {
    format!("result_{}", id.simple())
}
pub(super) fn artifact_relation(
    conn: &Connection,
    analysis: Uuid,
    artifact: Uuid,
) -> Result<Relation> {
    let name: Option<String> = conn.query_row("SELECT relation_name FROM wordflow.artifacts WHERE id=? AND analysis_id=? AND storage_kind='relation'",params![artifact.to_string(),analysis.to_string()],|row|row.get(0)).optional()?;
    let name = name
        .filter(|name| *name == artifact_table(artifact))
        .ok_or_else(|| Error::new("analysis_corrupt", "Analysis relation is unavailable"))?;
    Ok(Relation {
        schema: "wordflow".into(),
        name,
    })
}
pub(super) fn register_table(
    conn: &Connection,
    analysis_id: Uuid,
    artifact_id: Uuid,
    name: &str,
) -> Result<()> {
    conn.execute("INSERT INTO wordflow.artifacts(id,analysis_id,name,storage_kind,relation_name) VALUES (?,?,?,'relation',?)",params![artifact_id.to_string(),analysis_id.to_string(),name,artifact_table(artifact_id)])?;
    Ok(())
}
pub(super) fn register_blob(
    conn: &Connection,
    analysis: Uuid,
    artifact: Uuid,
    name: &str,
    media_type: &str,
    content: &[u8],
) -> Result<()> {
    conn.execute("INSERT INTO wordflow.artifacts(id,analysis_id,name,storage_kind,media_type,content) VALUES (?,?,?,'blob',?,?)", params![artifact.to_string(),analysis.to_string(),name,media_type,content])?;
    Ok(())
}
pub(super) fn artifact_blob(conn: &Connection, analysis: Uuid, artifact: Uuid) -> Result<Vec<u8>> {
    conn.query_row("SELECT content FROM wordflow.artifacts WHERE id=? AND analysis_id=? AND storage_kind='blob'", params![artifact.to_string(), analysis.to_string()], |r| r.get(0))
        .optional()?.ok_or_else(|| Error::new("analysis_corrupt", "Analysis content is unavailable"))
}
fn delete_analysis(conn: &Connection, id: Uuid) -> Result<()> {
    delete_artifacts(conn, id)?;
    conn.execute("DELETE FROM wordflow.analyses WHERE id=?", [id.to_string()])?;
    Ok(())
}
fn delete_artifacts(conn: &Connection, id: Uuid) -> Result<()> {
    // Catalogue reads do not evaluate broken Views. Owned Views precede their Tables.
    let artifacts = conn.prepare("SELECT a.id::VARCHAR,a.relation_name,t.table_type FROM wordflow.artifacts a LEFT JOIN information_schema.tables t ON t.table_catalog=current_database() AND t.table_schema='wordflow' AND t.table_name=a.relation_name WHERE a.analysis_id=? ORDER BY CASE WHEN t.table_type='VIEW' THEN 0 ELSE 1 END")?
        .query_map([id.to_string()],|row| Ok((row.get::<_,String>(0)?,row.get::<_,Option<String>>(1)?,row.get::<_,Option<String>>(2)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
    for (artifact_id, relation, kind) in artifacts {
        if let Some(relation) = relation {
            if relation != artifact_table(decode_uuid(&artifact_id)?) {
                return Err(Error::new(
                    "analysis_corrupt",
                    "Analysis artifact relation identity is invalid",
                ));
            }
            arrow_metadata::delete_relation(
                conn,
                &Relation {
                    schema: "wordflow".into(),
                    name: relation.clone(),
                },
            )?;
            let kind = match kind.as_deref() {
                Some("VIEW") => "VIEW",
                Some("BASE TABLE") => "TABLE",
                None => continue,
                _ => {
                    return Err(Error::new(
                        "analysis_corrupt",
                        "Analysis relation is unavailable",
                    ));
                }
            };
            conn.execute_batch(&format!("DROP {kind} wordflow.{}", query::quote(&relation)))?;
        }
    }
    conn.execute(
        "DELETE FROM wordflow.artifacts WHERE analysis_id=?",
        [id.to_string()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn setup() -> (Project, Uuid) {
        let mut p = Project::untitled().unwrap();
        let tab = p
            .database
            .create_analysis_tab(CreateTab::default())
            .unwrap()
            .id;
        (p, tab)
    }
    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM wordflow.{table}"), [], |r| {
            r.get(0)
        })
        .unwrap()
    }
    fn outputs(conn: &Connection, id: Uuid) -> Result<Value> {
        let table = Uuid::new_v4();
        let view = Uuid::new_v4();
        conn.execute_batch(&format!("CREATE TABLE wordflow.{}(value UBIGINT); INSERT INTO wordflow.{} VALUES (18446744073709551615); CREATE VIEW wordflow.{} AS SELECT * FROM wordflow.{}",artifact_table(table),artifact_table(table),artifact_table(view),artifact_table(table)))?;
        register_table(conn, id, table, "data")?;
        register_table(conn, id, view, "projection")?;
        conn.execute("INSERT INTO wordflow.artifacts(id,analysis_id,name,storage_kind,media_type,content) VALUES (?,?,'model','blob','application/octet-stream',?)",params![Uuid::new_v4().to_string(),id.to_string(),vec![0u8,255,42]])?;
        arrow_metadata::Annotations(vec![arrow_metadata::Annotation {
            path: vec!["value".into()],
            extension: "custom.number".into(),
            payload: Some("opaque".into()),
        }])
        .store(
            conn,
            &Relation {
                schema: "wordflow".into(),
                name: artifact_table(table),
            },
        )?;
        Ok(json!({"artifact":table,"projection":view}))
    }
    fn publish(db: &mut Database, tab: Uuid, id: Uuid) -> Result<Analysis> {
        db.publish_analysis(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: "frequency",
            },
            |conn| outputs(conn, id),
        )
    }
    #[test]
    fn request_and_output_have_one_owner_and_clear_retains_request() {
        let (mut p, tab) = setup();
        let db = &mut p.database;
        assert!(db.analysis_tab(tab).unwrap().analysis.is_none());
        let request = json!({"inputs":[],"future":{"unknown":true}});
        let id = db
            .begin_analysis_run(tab, "frequency", request.clone())
            .unwrap();
        let pending = db.analysis(id).unwrap();
        assert_eq!(pending.request, request);
        assert!(pending.result.is_none());
        assert_eq!(
            pending.output("frequency").unwrap_err().code,
            "result_unavailable"
        );
        let finished = publish(db, tab, id).unwrap();
        assert_eq!(finished.id, id);
        assert_eq!(finished.result.unwrap().version, 1);
        assert_eq!(count(&db.conn, "artifacts"), 3);
        assert_eq!(count(&db.conn, "arrow_metadata"), 1);
        db.clear_analysis_tab(tab).unwrap();
        db.clear_analysis_tab(tab).unwrap();
        let cleared = db.analysis(id).unwrap();
        assert_eq!(cleared.request, request);
        assert!(cleared.result.is_none());
        assert_eq!(count(&db.conn, "analyses"), 1);
        assert_eq!(count(&db.conn, "artifacts"), 0);
        assert_eq!(count(&db.conn, "arrow_metadata"), 0);
        let summary = db.analysis_tab(tab).unwrap().analysis.unwrap();
        assert_eq!(summary.id, id);
        assert!(!summary.has_result);
    }
    #[test]
    fn replacement_and_deletion_reject_late_publication() {
        let (mut p, tab) = setup();
        let db = &mut p.database;
        let first = db
            .begin_analysis_run(tab, "frequency", json!({"first":1}))
            .unwrap();
        publish(db, tab, first).unwrap();
        assert!(publish(db, tab, first).is_err());
        let second = db
            .begin_analysis_run(tab, "frequency", json!({"second":2}))
            .unwrap();
        assert_ne!(first, second);
        assert_eq!(count(&db.conn, "analyses"), 1);
        assert_eq!(count(&db.conn, "artifacts"), 0);
        assert!(db.analysis(first).is_err());
        assert!(publish(db, tab, first).is_err());
        db.delete_analysis_tab(tab).unwrap();
        assert!(publish(db, tab, second).is_err());
        assert_eq!(count(&db.conn, "tabs"), 0);
        assert_eq!(count(&db.conn, "analyses"), 0);
        assert_eq!(count(&db.conn, "artifacts"), 0);
    }
    #[test]
    fn publication_error_cancellation_and_panic_roll_back_all_output() {
        for failure in ["error", "cancel", "panic"] {
            let (mut p, tab) = setup();
            let db = &mut p.database;
            let id = db
                .begin_analysis_run(tab, "frequency", json!({"request":"retained"}))
                .unwrap();
            let cancellation = db.cancellation.clone();
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                db.publish_analysis(
                    AcceptedAnalysis {
                        id,
                        tab_id: tab,
                        kind: "frequency",
                    },
                    |conn| {
                        let payload = outputs(conn, id)?;
                        match failure {
                            "error" => return Err(Error::invalid("injected failure")),
                            "cancel" => cancellation.cancel(),
                            _ => panic!("injected panic"),
                        };
                        Ok(payload)
                    },
                )
            }));
            assert!(outcome.is_err() || outcome.unwrap().is_err());
            assert_eq!(count(&db.conn, "artifacts"), 0);
            assert_eq!(count(&db.conn, "arrow_metadata"), 0);
            assert!(db.analysis(id).unwrap().result.is_none());
            assert_eq!(db.conn.query_row("SELECT count(*) FROM information_schema.tables WHERE table_schema='wordflow' AND starts_with(table_name,'result_')",[],|r|r.get::<_,i64>(0)).unwrap(),0);
        }
    }
    #[test]
    fn failed_initial_replacement_preserves_previous_analysis_and_artifacts() {
        let (mut p, tab) = setup();
        let db = &mut p.database;
        let id = db
            .begin_analysis_run(tab, "frequency", json!({"old":true}))
            .unwrap();
        publish(db, tab, id).unwrap();
        // Abort insertion after cleanup has started, exercising rollback of owned DDL too.
        db.conn.execute_batch("ALTER TABLE wordflow.analyses ADD COLUMN required_value INTEGER DEFAULT 1; ALTER TABLE wordflow.analyses ALTER COLUMN required_value SET NOT NULL; ALTER TABLE wordflow.analyses ALTER COLUMN required_value DROP DEFAULT").unwrap();
        assert!(
            db.begin_analysis_run(tab, "frequency", json!({"new":true}))
                .is_err()
        );
        assert!(db.analysis(id).unwrap().result.is_some());
        assert_eq!(count(&db.conn, "artifacts"), 3);
        assert_eq!(count(&db.conn, "arrow_metadata"), 1);
    }
    #[test]
    fn broken_outputs_are_clearable_without_reading_payload_or_views() {
        let (mut p, tab) = setup();
        let db = &mut p.database;
        let id = db.begin_analysis_run(tab, "frequency", json!({})).unwrap();
        let saved = publish(db, tab, id).unwrap();
        let table = decode_uuid(
            saved.output("frequency").unwrap()["artifact"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        db.conn.execute_batch(&format!("DROP TABLE wordflow.{}; UPDATE wordflow.analyses SET result='{{\"future\":true}}',result_version=999",artifact_table(table))).unwrap();
        assert!(db.analysis_tab(tab).unwrap().analysis.unwrap().has_result);
        db.clear_analysis_tab(tab).unwrap();
        assert_eq!(count(&db.conn, "artifacts"), 0);
        assert_eq!(count(&db.conn, "arrow_metadata"), 0);
    }
    #[test]
    fn settings_cannot_overwrite_request_and_zero_matches_are_completed() {
        let (mut p, tab) = setup();
        let db = &mut p.database;
        let id = db
            .begin_analysis_run(tab, "frequency", json!({"inputs":[]}))
            .unwrap();
        db.update_analysis_tab(
            tab,
            UpdateTab {
                settings: Some(json!({"request":{"unrelated":true}})),
                name: None,
            },
        )
        .unwrap();
        assert_eq!(db.analysis(id).unwrap().request, json!({"inputs":[]}));
        db.publish_analysis(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: "frequency",
            },
            |_| Ok(json!({"corpora":[]})),
        )
        .unwrap();
        assert!(db.analysis_tab(tab).unwrap().analysis.unwrap().has_result);
        assert!(
            db.conn
                .execute(
                    "INSERT INTO wordflow.analyses(id,tab_id,request) VALUES (?,?, '{}')",
                    params![Uuid::new_v4().to_string(), tab.to_string()]
                )
                .unwrap_err()
                .to_string()
                .contains("Duplicate")
        );
    }
}
