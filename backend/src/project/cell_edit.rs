//! A frozen reader and one final write transaction; no persistent row identities or editing copy.
use super::*;
use duckdb::arrow::{datatypes::Schema, record_batch::RecordBatch};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
#[schema(as = CellEditColumn)]
pub(crate) struct Column {
    pub name: String,
    pub data_type: String,
    pub editable: bool,
    pub identifier: bool,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct SessionInfo {
    pub session_id: String,
    pub table_name: String,
    pub schema: String,
    pub row_count: u64,
    pub mutation_stamp: changes::MutationStamp,
    pub columns: Vec<Column>,
}
pub(super) struct Session {
    pub conn: Connection,
    info: SessionInfo,
    row_type: String,
    annotation: Option<annotation::EditRequest>,
    notifications: tokio::sync::broadcast::Receiver<ChangeScope>,
    lost_notifications: bool,
    _protection: protection::Lease,
}
impl Drop for Session {
    fn drop(&mut self) {
        // Disconnect also rolls back. Explicit rollback releases the snapshot before disconnect.
        if let Err(error) = self.conn.execute_batch("ROLLBACK") {
            tracing::warn!(%error, "Unable to explicitly release editing snapshot");
        }
    }
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = CellEditPage)]
#[serde(deny_unknown_fields)]
pub(crate) struct Page {
    pub page: u64,
    pub page_size: u64,
    #[serde(default)]
    pub sorting: Vec<Sort>,
    pub review: Option<annotation::Review>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = CellEditSort)]
#[serde(deny_unknown_fields)]
pub(crate) struct Sort {
    pub column: String,
    pub descending: bool,
}
#[derive(Clone, Deserialize, utoipa::ToSchema)]
#[schema(as = CellEditPatch)]
#[serde(deny_unknown_fields)]
pub(crate) struct Patch {
    pub row_ref: String,
    pub column: String,
    #[serde(deserialize_with = "Option::deserialize")]
    #[schema(required = true)]
    pub value: Option<String>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = CellEditInsertion)]
#[serde(deny_unknown_fields)]
pub(crate) struct Insertion {
    pub values: BTreeMap<String, Option<String>>,
}
#[derive(Default, Deserialize, utoipa::ToSchema)]
#[schema(as = CellEditSave)]
#[serde(deny_unknown_fields)]
pub(crate) struct Save {
    pub changes: Vec<Patch>,
    #[serde(default)]
    pub deletions: Vec<String>,
    #[serde(default)]
    pub insertions: Vec<Insertion>,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, utoipa::ToSchema)]
#[schema(as = CellEditCompletion)]
pub(crate) struct Completion {
    pub saved: bool,
}

pub(super) fn editing_active() -> Error {
    Error::new(
        "editing_active",
        "Finish table editing with Save or Cancel first",
    )
}
#[derive(Default)]
pub(super) struct Editor {
    pub sessions: BTreeMap<String, Session>,
    completed: std::collections::VecDeque<(String, Completion)>,
}
impl Editor {
    pub(super) fn begin_cell_edit(
        &mut self,
        writer: &Connection,
        name: impl Into<ObjectTarget>,
        protection: protection::Lease,
        on_reader: impl FnOnce(&Connection),
        changes: &changes::Notifications,
        expected: Option<changes::MutationStamp>,
    ) -> Result<SessionInfo> {
        let object = name.into().resolve(writer)?;
        let relation = object.relation;
        let mutation_stamp = changes.stamp(&relation);
        if expected.is_some_and(|expected| expected != mutation_stamp) {
            return Err(Error::new(
                "editing_stale",
                "This Data Block has changed. Refresh Preview before editing corrections",
            ));
        }
        let table: bool = writer.query_row(
            "SELECT count(*)=1 FROM duckdb_tables() WHERE database_name=current_database() AND schema_name=? AND table_name=?",
            params![relation.schema, relation.name], |r| r.get(0),
        )?;
        if !table {
            return Err(Error::invalid(
                "Materialize this view before editing its cells",
            ));
        }
        let conn = writer.try_clone()?;
        on_reader(&conn);
        conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let mut session = Session {
            conn,
            _protection: protection,
            row_type: "BIGINT".into(),
            annotation: None,
            notifications: changes.subscribe(),
            lost_notifications: false,
            info: SessionInfo {
                session_id: Uuid::new_v4().to_string(),
                table_name: relation.name.clone(),
                schema: relation.schema.clone(),
                row_count: 0,
                mutation_stamp,
                columns: vec![],
            },
        };
        session.info.columns = session
            .conn
            .prepare(&format!("DESCRIBE SELECT * FROM {}", relation.sql()))?
            .query_map([], |r| {
                let data_type: String = r.get(1)?;
                Ok(Column {
                    name: r.get(0)?,
                    editable: editable_type(&data_type),
                    identifier: false,
                    data_type,
                })
            })?
            .collect::<duckdb::Result<Vec<_>>>()?;
        if let Some(column) = session
            .info
            .columns
            .iter_mut()
            .find(|c| c.name.eq_ignore_ascii_case("rowid"))
        {
            if !editable_type(&column.data_type) && column.data_type != "UUID" {
                return Err(Error::invalid(format!(
                    "Column {} has type {}, which is not supported as an editing identifier",
                    column.name, column.data_type
                )));
            }
            column.identifier = true;
            column.editable = false;
            session.row_type = column.data_type.clone();
            validate_identifiers(&session.conn, &relation)?;
        }
        // Count once in the fixed snapshot so shared pagination can expose its last page.
        session.info.row_count = session.conn.query_row(
            &format!("SELECT count(*) FROM {}", relation.sql()),
            [],
            |r| r.get(0),
        )?;
        let info = session.info.clone();
        self.sessions.insert(info.session_id.clone(), session);
        Ok(info)
    }
    pub(super) fn restrict_annotation(
        &mut self,
        id: &str,
        request: annotation::EditRequest,
    ) -> Result<SessionInfo> {
        let session = self
            .sessions
            .get_mut(id)
            .ok_or_else(|| Error::new("editing_closed", "This table editing session has ended"))?;
        request.validate(&session.conn)?;
        let columns = request.columns();
        for column in &mut session.info.columns {
            column.editable &= columns.contains(&column.name.as_str());
        }
        if columns.iter().any(|name| {
            !session
                .info
                .columns
                .iter()
                .any(|column| column.name == *name && column.editable)
        }) {
            return Err(Error::invalid(
                "An identifying column cannot be edited as an Annotation label or code",
            ));
        }
        session.annotation = Some(request);
        Ok(session.info.clone())
    }
    fn reconcile_references(&mut self, id: &str) -> Result<()> {
        if let Some(session) = self.sessions.get_mut(id) {
            if session.lost_notifications {
                return Err(Error::new(
                    "editing_stale",
                    "This editing session cannot reconcile missed source changes. Copy pending edits, Cancel and reopen it",
                ));
            }
            loop {
                match session.notifications.try_recv() {
                    Ok(scope) => {
                        if let Some(request) = &mut session.annotation {
                            let mut value = serde_json::to_value(&*request)?;
                            for rename in scope.renames {
                                rename.request("annotation", &mut value);
                            }
                            *request = serde_json::from_value(value)?;
                        }
                    }
                    Err(
                        tokio::sync::broadcast::error::TryRecvError::Empty
                        | tokio::sync::broadcast::error::TryRecvError::Closed,
                    ) => break,
                    Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => {
                        if session.annotation.is_none() {
                            continue;
                        }
                        session.lost_notifications = true;
                        return Err(Error::new(
                            "editing_stale",
                            "Too many source changes occurred to reconcile this editing session. Copy your pending edits, Cancel and reopen the editor",
                        ));
                    }
                }
            }
        }
        Ok(())
    }
    pub(super) fn editing(&self, id: &str) -> Result<&Session> {
        self.sessions
            .get(id)
            .ok_or_else(|| Error::new("editing_closed", "This table editing session has ended"))
    }
    pub(super) fn cell_edit_page(
        &mut self,
        id: &str,
        page: Page,
        live: Option<&Connection>,
    ) -> Result<tempfile::NamedTempFile> {
        self.reconcile_references(id)?;
        let session = self.editing(id)?;
        if page.page == 0 || !(1..=1000).contains(&page.page_size) {
            return Err(Error::invalid(
                "Page must be positive and page size must be between 1 and 1000",
            ));
        }
        let offset = (page.page - 1)
            .checked_mul(page.page_size)
            .and_then(|v| i64::try_from(v).ok())
            .ok_or_else(|| Error::invalid("Page offset is too large"))?;
        let mut order = Vec::new();
        for sort in &page.sorting {
            if !session.info.columns.iter().any(|c| c.name == sort.column) {
                return Err(Error::invalid("Unknown sort column"));
            }
            order.push(format!(
                "{} {}",
                query::quote(&sort.column),
                if sort.descending { "DESC" } else { "ASC" }
            ));
        }
        order.push("rowid ASC".into());
        let relation = Relation {
            schema: session.info.schema.clone(),
            name: session.info.table_name.clone(),
        };
        let columns = &session.info.columns;
        let helper = |index: usize| {
            let mut name = format!("__wordflow_edit_{index}");
            while columns.iter().any(|c| c.name.eq_ignore_ascii_case(&name)) {
                name.push('_');
            }
            query::quote(&name)
        };
        let mut projection = vec![
            columns
                .iter()
                .map(|c| query::quote(&c.name))
                .collect::<Vec<_>>()
                .join(","),
            format!("CAST(rowid AS VARCHAR) AS {}", helper(0)),
        ];
        let mut value_fields = BTreeMap::new();
        for column in columns.iter().filter(|c| c.editable) {
            value_fields.insert(column.name.clone(), columns.len() + projection.len() - 1);
            // Canonical text travels in Arrow alongside the original typed values. In particular,
            // do not round DECIMAL or micro/nanosecond timestamps through JS Number/Date.
            projection.push(format!(
                "CAST({} AS VARCHAR) AS {}",
                query::quote(&column.name),
                helper(projection.len() - 1)
            ));
        }
        let review = page
            .review
            .as_ref()
            .map(|review| {
                annotation::review_query(
                    &session.conn,
                    live.ok_or_else(|| Error::invalid("Live Codebook connection is unavailable"))?,
                    &relation,
                    columns,
                    session.annotation.as_ref(),
                    review,
                )
            })
            .transpose()?;
        let source = review
            .as_ref()
            .map_or_else(|| relation.sql(), |review| review.source.clone());
        let mut stmt = session.conn.prepare(&format!(
            "SELECT {} FROM {} ORDER BY {} LIMIT ? OFFSET ?",
            projection.join(","),
            source,
            order.join(",")
        ))?;
        let schema = stmt
            .query_arrow(params![page.page_size + 1, offset])?
            .get_schema();
        let schema = arrow_metadata::Annotations::load(&session.conn, &relation)?
            .enrich(&schema, columns.len())?;
        let mut metadata = schema.metadata().clone();
        if let Some(review) = review {
            metadata.insert(
                "wordflow:annotation-review".into(),
                serde_json::to_string(&review.summary)?,
            );
        }
        metadata.insert(
            "wordflow:cell-edit".into(),
            serde_json::to_string(&serde_json::json!({
                "row_ref": columns.len(), "values": value_fields, "column_count": columns.len()
            }))?,
        );
        let schema = Arc::new(Schema::new_with_metadata(schema.fields().clone(), metadata));
        let mut file = tempfile::NamedTempFile::new()?;
        let mut writer = StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
        while let Some(array) = stmt.step()? {
            let batch = RecordBatch::from(&array);
            let batch = arrow_metadata::enrich_batch(batch, schema.clone())?;
            writer.write(&batch).map_err(arrow_error)?;
        }
        writer.finish().map_err(arrow_error)?;
        Ok(file)
    }
    pub(super) fn save_cell_edit(
        &mut self,
        writer: impl FnOnce() -> Result<Connection>,
        id: &str,
        mut input: Save,
        changes: &changes::Notifications,
    ) -> Result<Completion> {
        if let Some((_, completion)) = self
            .completed
            .iter()
            .find(|(previous, completion)| previous == id && completion.saved)
        {
            return Ok(*completion);
        }
        self.reconcile_references(id)?;
        let session = self.editing(id)?;
        let mut writer = writer()?;
        let tx = writer.transaction()?;
        if let Some(rules) = &session.annotation {
            rules.validate_changes(&tx, &mut input)?;
        }
        let relation = Relation {
            schema: session.info.schema.clone(),
            name: session.info.table_name.clone(),
        };
        let mut rows: BTreeMap<String, BTreeMap<String, (String, Option<String>)>> =
            BTreeMap::new();
        let mut deletions = BTreeSet::new();
        for row_ref in input.deletions {
            if !deletions.insert(row_ref) {
                return Err(Error::invalid(
                    "A row occurs more than once in the deletions",
                ));
            }
        }
        for patch in input.changes {
            let column = session
                .info
                .columns
                .iter()
                .find(|c| c.name == patch.column && c.editable)
                .ok_or_else(|| {
                    Error::invalid(format!("Column {} is not editable", patch.column))
                })?;
            let row = patch.row_ref;
            if deletions.contains(&row) {
                return Err(Error::invalid(
                    "A deleted row cannot also have cell changes",
                ));
            }
            if rows
                .entry(row)
                .or_default()
                .insert(column.name.clone(), (column.data_type.clone(), patch.value))
                .is_some()
            {
                return Err(Error::invalid(
                    "A cell occurs more than once in the changes",
                ));
            }
        }
        let mut insertions = Vec::new();
        for insertion in input.insertions {
            if let Some(key) = session.info.columns.iter().find(|c| c.identifier)
                && insertion
                    .values
                    .get(&key.name)
                    .and_then(Option::as_ref)
                    .is_none()
            {
                return Err(Error::invalid(format!(
                    "New rows require a non-NULL {} identifier",
                    key.name
                )));
            }
            let mut cells = Vec::new();
            for (name, value) in insertion.values {
                let column = session
                    .info
                    .columns
                    .iter()
                    .find(|c| c.name == name && (c.editable || c.identifier))
                    .ok_or_else(|| Error::invalid(format!("Column {name} is not editable")))?;
                cells.push((name, column.data_type.clone(), value));
            }
            insertions.push(cells);
        }
        // Other writers to this Table are excluded by the runtime. Validate references against the snapshot
        // before any UPDATE: indexed-column updates can implement delete+insert and move rowids.
        for row in rows.keys().chain(&deletions) {
            let exists: bool = session.conn.query_row(
                &format!(
                    "SELECT EXISTS(SELECT 1 FROM {} WHERE rowid=CAST(? AS {}) AND CAST(rowid AS VARCHAR)=?)",
                    relation.sql(), session.row_type
                ),
                params![row, row],
                |r| r.get(0),
            )?;
            if !exists {
                return Err(Error::invalid("An edited row is unavailable"));
            }
        }
        if !rows.is_empty() || !deletions.is_empty() || !insertions.is_empty() {
            let scope = ChangeScope {
                objects: vec![relation.clone()],
                ..ChangeScope::default()
            };
            let change = PendingChange::new(&tx, scope, &CancellationToken::new());
            for row in deletions {
                let affected = tx.execute(
                    &format!(
                        "DELETE FROM {} WHERE rowid=CAST(? AS {})",
                        relation.sql(),
                        session.row_type
                    ),
                    [row],
                )?;
                if affected != 1 {
                    return Err(Error::invalid("A deleted row is unavailable"));
                }
            }
            for (row, cells) in rows {
                let assignments = cells
                    .iter()
                    .map(|(name, (ty, _))| format!("{}=CAST(? AS {ty})", query::quote(name)))
                    .collect::<Vec<_>>();
                let mut values = cells
                    .into_values()
                    .map(|(_, value)| value.map_or(SqlValue::Null, SqlValue::Text))
                    .collect::<Vec<_>>();
                values.push(SqlValue::Text(row));
                let affected = tx.execute(
                    &format!(
                        "UPDATE {} SET {} WHERE rowid=CAST(? AS {})",
                        relation.sql(),
                        assignments.join(","),
                        session.row_type
                    ),
                    params_from_iter(values),
                )?;
                if affected != 1 {
                    return Err(Error::invalid("An edited row is unavailable"));
                }
            }
            for cells in insertions {
                if cells.is_empty() {
                    tx.execute(
                        &format!("INSERT INTO {} DEFAULT VALUES", relation.sql()),
                        [],
                    )?;
                } else {
                    let names = cells
                        .iter()
                        .map(|(name, _, _)| query::quote(name))
                        .collect::<Vec<_>>();
                    let casts = cells
                        .iter()
                        .map(|(_, ty, _)| format!("CAST(? AS {ty})"))
                        .collect::<Vec<_>>();
                    let values = cells
                        .into_iter()
                        .map(|(_, _, value)| value.map_or(SqlValue::Null, SqlValue::Text));
                    tx.execute(
                        &format!(
                            "INSERT INTO {} ({}) VALUES ({})",
                            relation.sql(),
                            names.join(","),
                            casts.join(",")
                        ),
                        params_from_iter(values),
                    )?;
                }
            }
            if session.info.columns.iter().any(|c| c.identifier) {
                validate_identifiers(&tx, &relation)?;
            }
            if let Some(rules) = &session.annotation {
                rules.validate_saved(&tx)?;
            }
            change.commit(tx, changes, &CancellationToken::new())?;
        }
        self.sessions.remove(id);
        let completion = Completion { saved: true };
        self.completed.push_back((id.into(), completion));
        if self.completed.len() > 100 {
            self.completed.pop_front();
        }
        Ok(completion)
    }
    pub(super) fn cancel_cell_edit(&mut self, id: &str) -> Result<Completion> {
        if let Some((_, completion)) = self
            .completed
            .iter()
            .find(|(previous, completion)| previous == id && !completion.saved)
        {
            return Ok(*completion);
        }
        self.editing(id)?;
        self.sessions.remove(id);
        let completion = Completion { saved: false };
        self.completed.push_back((id.into(), completion));
        if self.completed.len() > 100 {
            self.completed.pop_front();
        }
        Ok(completion)
    }
}

pub(super) fn validate_identifiers(conn: &Connection, relation: &Relation) -> Result<()> {
    let valid: bool = conn.query_row(
        &format!(
            "SELECT count(*)=count(rowid) AND count(*)=count(DISTINCT rowid) FROM {}",
            relation.sql()
        ),
        [],
        |row| row.get(0),
    )?;
    if !valid {
        return Err(Error::invalid(
            "The explicit rowid column must contain unique, non-NULL identifiers before editing",
        ));
    }
    Ok(())
}

pub(super) fn editable_type(ty: &str) -> bool {
    matches!(
        ty,
        "VARCHAR"
            | "BOOLEAN"
            | "TINYINT"
            | "SMALLINT"
            | "INTEGER"
            | "BIGINT"
            | "HUGEINT"
            | "UTINYINT"
            | "USMALLINT"
            | "UINTEGER"
            | "UBIGINT"
            | "UHUGEINT"
            | "FLOAT"
            | "DOUBLE"
            | "DATE"
            | "TIME"
            | "TIME WITH TIME ZONE"
            | "TIMESTAMP"
            | "TIMESTAMP_S"
            | "TIMESTAMP_MS"
            | "TIMESTAMP_NS"
            | "TIMESTAMP WITH TIME ZONE"
    ) || ty.starts_with("DECIMAL(")
        || ty.starts_with("ENUM(")
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_ipc::reader::StreamReader;
    use duckdb::arrow::array::{Array, StringArray};

    pub(super) fn database() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../schema.sql")).unwrap();
        conn.execute_batch("INSERT INTO wordflow.project(schema_version) VALUES (1)")
            .unwrap();
        Database::new(conn, CancellationToken::new()).unwrap()
    }
    fn fixture() -> Database {
        let p = database();
        p.conn.execute_batch("CREATE TABLE data.t (key INTEGER PRIMARY KEY, value VARCHAR, amount DECIMAL(38,10), stamp TIMESTAMP_NS, nested INTEGER[]); INSERT INTO data.t VALUES (1,'same',12345678901234567890.1234567890,'2024-01-02 03:04:05.123456789',[1]),(2,'same',NULL,NULL,NULL),(3,NULL,0,NULL,[]); INSERT INTO wordflow.nodes(table_name) VALUES ('t')").unwrap();
        p
    }
    fn page(p: &mut Editor, id: &str, number: u64) -> RecordBatch {
        let file = p
            .cell_edit_page(
                id,
                Page {
                    page: number,
                    page_size: 2,
                    sorting: vec![Sort {
                        column: "value".into(),
                        descending: false,
                    }],
                    review: None,
                },
                None,
            )
            .unwrap();
        StreamReader::try_new(file.reopen().unwrap(), None)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
    }
    fn patch(row: &str, column: &str, value: Option<&str>) -> Patch {
        Patch {
            row_ref: row.into(),
            column: column.into(),
            value: value.map(str::to_owned),
        }
    }
    fn insertion(values: &[(&str, Option<&str>)]) -> Insertion {
        Insertion {
            values: values
                .iter()
                .map(|(name, value)| (name.to_string(), value.map(str::to_owned)))
                .collect(),
        }
    }
    #[test]
    fn stale_source_preconditions_do_not_open_an_editor() {
        let mut p = fixture();
        let relation = Relation {
            schema: "data".into(),
            name: "t".into(),
        };
        let stamp = p.changes.stamp(&relation);
        p.sql(SqlBatch {
            script: Some("UPDATE data.t SET value='changed'".into()),
            response: SqlResponse::Command,
            ..Default::default()
        })
        .unwrap();
        let mut editor = Editor::default();
        let error = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("t".into())
                    .unwrap(),
                |_| {},
                &p.changes,
                Some(stamp),
            )
            .unwrap_err();
        assert_eq!(error.code, "editing_stale");
        assert!(editor.sessions.is_empty());
    }

    #[test]
    fn explicit_text_identifiers_preserve_spelling_and_are_read_only() {
        let p = database();
        p.conn.execute_batch("CREATE TABLE data.keys(rowid VARCHAR, value VARCHAR); INSERT INTO data.keys VALUES ('01','first'),('1','second'); INSERT INTO wordflow.nodes(table_name) VALUES ('keys')").unwrap();
        let mut editor = Editor::default();
        let info = editor
            .begin_cell_edit(
                &p.conn,
                "keys",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap();
        assert!(info.columns[0].identifier);
        assert!(!info.columns[0].editable);
        let changes = changes::Notifications::default();
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.conn.try_clone()?),
                    &info.session_id,
                    Save {
                        changes: vec![patch("01", "rowid", Some("new"))],
                        ..Save::default()
                    },
                    &changes
                )
                .is_err()
        );
        for values in [vec![("value", Some("missing"))], vec![("rowid", Some("1"))]] {
            assert!(
                editor
                    .save_cell_edit(
                        || Ok(p.conn.try_clone()?),
                        &info.session_id,
                        Save {
                            changes: vec![patch("01", "value", Some("rollback"))],
                            insertions: vec![insertion(&values)],
                            ..Save::default()
                        },
                        &changes
                    )
                    .is_err()
            );
            assert_eq!(
                p.conn
                    .query_row("SELECT value FROM data.keys WHERE rowid='01'", [], |r| {
                        r.get::<_, String>(0)
                    })
                    .unwrap(),
                "first"
            );
        }
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &info.session_id,
                Save {
                    changes: vec![patch("01", "value", Some("edited"))],
                    insertions: vec![insertion(&[("rowid", Some("003")), ("value", Some("new"))])],
                    ..Save::default()
                },
                &changes,
            )
            .unwrap();
        let rows = p
            .conn
            .prepare("SELECT rowid,value FROM data.keys ORDER BY rowid")
            .unwrap()
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .unwrap()
            .collect::<duckdb::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                ("003".into(), "new".into()),
                ("01".into(), "edited".into()),
                ("1".into(), "second".into())
            ]
        );
    }

    #[test]
    fn explicit_large_identifiers_remain_exact_and_reject_aliases() {
        let p = database();
        p.conn.execute_batch("CREATE TABLE data.keys(rowid UHUGEINT, value VARCHAR); INSERT INTO data.keys VALUES (340282366920938463463374607431768211454,'first'),(340282366920938463463374607431768211455,'second'); INSERT INTO wordflow.nodes(table_name) VALUES ('keys')").unwrap();
        let mut editor = Editor::default();
        let info = editor
            .begin_cell_edit(
                &p.conn,
                "keys",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap();
        let changes = changes::Notifications::default();
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.conn.try_clone()?),
                    &info.session_id,
                    Save {
                        deletions: vec!["0340282366920938463463374607431768211454".into()],
                        ..Save::default()
                    },
                    &changes
                )
                .is_err()
        );
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &info.session_id,
                Save {
                    changes: vec![patch(
                        "340282366920938463463374607431768211455",
                        "value",
                        Some("edited"),
                    )],
                    deletions: vec!["340282366920938463463374607431768211454".into()],
                    ..Save::default()
                },
                &changes,
            )
            .unwrap();
        assert_eq!(
            p.conn
                .query_row("SELECT value FROM data.keys", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "edited"
        );
    }

    #[test]
    fn row_changes_commit_together_and_failed_inserts_preserve_the_snapshot() {
        let p = fixture();
        let mut editor = Editor::default();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        let changes = || Save {
            changes: vec![patch("0", "value", Some("changed"))],
            deletions: vec!["1".into()],
            insertions: vec![insertion(&[("key", Some("1")), ("value", Some("new"))])],
        };
        // The duplicate primary key fails after the delete and update have executed.
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.conn.try_clone()?),
                    &id,
                    changes(),
                    &changes::Notifications::default()
                )
                .is_err()
        );
        assert_eq!(
            p.conn
                .query_row("SELECT count(*) FROM t WHERE value='same'", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            page(&mut editor, &id, 1)
                .column(5)
                .as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
                .value(1),
            "1"
        );
        let mut corrected = changes();
        corrected.insertions = vec![insertion(&[
            ("key", Some("4")),
            ("value", Some("")),
            ("amount", Some("12345678901234567890.1234567890")),
            ("stamp", Some("2024-01-02 03:04:05.123456789")),
        ])];
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                corrected,
                &changes::Notifications::default(),
            )
            .unwrap();
        assert_eq!(
            p.conn
                .query_row("SELECT count(*) FROM t WHERE key=2", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            p.conn
                .query_row("SELECT value FROM t WHERE key=1", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "changed"
        );
        assert_eq!(p.conn.query_row("SELECT CAST(amount AS VARCHAR) || '|' || CAST(stamp AS VARCHAR) FROM t WHERE key=4 AND value='' AND nested IS NULL", [], |r| r.get::<_, String>(0)).unwrap(), "12345678901234567890.1234567890|2024-01-02 03:04:05.123456789");
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                changes(),
                &changes::Notifications::default(),
            )
            .unwrap();
        assert_eq!(
            p.conn
                .query_row("SELECT count(*) FROM t", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
        assert_eq!(p.conn.query_row("SELECT count(*) FROM duckdb_columns() WHERE schema_name='data' AND table_name='t'", [], |r| r.get::<_, i64>(0)).unwrap(), 5);
    }
    #[test]
    fn row_changes_reject_ambiguous_or_unavailable_targets() {
        let p = fixture();
        let mut editor = Editor::default();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        for input in [
            Save {
                deletions: vec!["9007199254740993".into()],
                ..Save::default()
            },
            Save {
                deletions: vec!["invalid".into()],
                ..Save::default()
            },
            Save {
                deletions: vec!["1".into(), "01".into()],
                ..Save::default()
            },
            Save {
                changes: vec![patch("1", "value", None)],
                deletions: vec!["1".into()],
                ..Save::default()
            },
            Save {
                insertions: vec![insertion(&[("nested", Some("[3]"))])],
                ..Save::default()
            },
            Save {
                insertions: vec![insertion(&[("missing", None)])],
                ..Save::default()
            },
            Save {
                insertions: vec![insertion(&[("key", Some("not an integer"))])],
                ..Save::default()
            },
        ] {
            assert!(
                editor
                    .save_cell_edit(
                        || Ok(p.conn.try_clone()?),
                        &id,
                        input,
                        &changes::Notifications::default()
                    )
                    .is_err()
            );
            assert!(!editor.sessions.is_empty());
        }
        editor.cancel_cell_edit(&id).unwrap();
        assert_eq!(
            p.conn
                .query_row("SELECT count(*) FROM t", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
    }
    #[test]
    fn inserts_and_deletes_support_empty_tables_nulls_and_quoted_columns() {
        let p = database();
        let mut editor = Editor::default();
        p.conn.execute_batch("CREATE TYPE label AS ENUM ('allowed','unused'); CREATE TABLE data.\"quoted table\" (\"a\"\"b\" VARCHAR, category label, nested INTEGER[] DEFAULT [8]); INSERT INTO wordflow.nodes(table_name) VALUES ('quoted table')").unwrap();
        let info = editor
            .begin_cell_edit(
                &p.conn,
                "quoted table",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap();
        assert_eq!(info.row_count, 0);
        let id = info.session_id;
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                Save {
                    insertions: vec![
                        insertion(&[("a\"b", Some("same")), ("category", Some("unused"))]),
                        insertion(&[("a\"b", Some("same")), ("category", Some("unused"))]),
                        insertion(&[("a\"b", None), ("category", None)]),
                    ],
                    ..Save::default()
                },
                &changes::Notifications::default(),
            )
            .unwrap();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "quoted table",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                Save {
                    deletions: vec!["1".into()],
                    ..Save::default()
                },
                &changes::Notifications::default(),
            )
            .unwrap();
        assert_eq!(p.conn.query_row("SELECT count(*) FROM \"quoted table\" WHERE \"a\"\"b\"='same' AND category='unused' AND nested=[8]", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
        assert_eq!(p.conn.query_row("SELECT count(*) FROM \"quoted table\" WHERE \"a\"\"b\" IS NULL AND category IS NULL", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "quoted table",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                Save {
                    deletions: vec!["0".into(), "2".into()],
                    ..Save::default()
                },
                &changes::Notifications::default(),
            )
            .unwrap();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "quoted table",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                Save {
                    insertions: vec![insertion(&[])],
                    ..Save::default()
                },
                &changes::Notifications::default(),
            )
            .unwrap();
        assert_eq!(
            p.conn
                .query_row(
                    "SELECT count(*) FROM \"quoted table\" WHERE nested=[8]",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
    }
    #[test]
    fn pages_are_frozen_and_failed_save_can_be_corrected_without_helper_columns() {
        let p = fixture();
        let mut editor = Editor::default();
        let info = editor
            .begin_cell_edit(
                &p.conn,
                "T",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap();
        assert_eq!(info.table_name, "t");
        assert_eq!(info.row_count, 3);
        assert!(!info.columns[4].editable);
        let first = page(&mut editor, &info.session_id, 1);
        let strings = |index| {
            first
                .column(index)
                .as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
        };
        assert_eq!(strings(5).value(0), "0");
        assert_eq!(strings(8).value(0), "12345678901234567890.1234567890");
        assert_eq!(strings(9).value(0), "2024-01-02 03:04:05.123456789");
        assert!(strings(8).is_null(1));
        assert_eq!(
            page(&mut editor, &info.session_id, 2)
                .column(5)
                .as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
                .value(0),
            "2"
        );
        let failure = editor.save_cell_edit(
            || Ok(p.conn.try_clone()?),
            &info.session_id,
            Save {
                changes: vec![
                    patch("0", "value", Some("changed")),
                    patch("2", "key", Some("2")),
                ],
                ..Save::default()
            },
            &changes::Notifications::default(),
        );
        assert!(failure.is_err());
        assert_eq!(
            p.conn
                .query_row("SELECT value FROM t WHERE key=1", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "same"
        );
        assert_eq!(
            page(&mut editor, &info.session_id, 1)
                .column(6)
                .as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
                .value(0),
            "1"
        );
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &info.session_id,
                Save {
                    changes: vec![
                        patch("0", "key", Some("10")),
                        patch("0", "value", Some("edited")),
                        patch("2", "value", Some("")),
                    ],
                    ..Save::default()
                },
                &changes::Notifications::default(),
            )
            .unwrap();
        assert!(editor.sessions.is_empty());
        assert_eq!(
            p.conn
                .query_row("SELECT value FROM t WHERE key=10", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "edited"
        );
        assert_eq!(p.conn.query_row("SELECT count(*) FROM duckdb_columns() WHERE schema_name='data' AND table_name='t'", [], |r| r.get::<_, i64>(0)).unwrap(), 5);
        // Successful retries never replay old physical row references.
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.conn.try_clone()?),
                    &info.session_id,
                    Save::default(),
                    &changes::Notifications::default()
                )
                .unwrap()
                .saved
        );
        let next = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap();
        assert!(!editor.cancel_cell_edit(&next.session_id).unwrap().saved);
        assert!(!editor.cancel_cell_edit(&next.session_id).unwrap().saved);
    }
    #[test]
    fn invalid_targets_and_unsupported_columns_leave_the_session_usable() {
        let p = fixture();
        let mut editor = Editor::default();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        for changes in [
            vec![patch("9007199254740993", "value", Some("x"))],
            vec![patch("0", "nested", Some("[]"))],
            vec![patch("0", "value", None), patch("0", "value", Some("x"))],
        ] {
            assert!(
                editor
                    .save_cell_edit(
                        || Ok(p.conn.try_clone()?),
                        &id,
                        Save {
                            changes,
                            ..Save::default()
                        },
                        &changes::Notifications::default()
                    )
                    .is_err()
            );
            assert!(!editor.sessions.is_empty());
        }
        editor.cancel_cell_edit(&id).unwrap();
        p.conn.execute_batch("CREATE TABLE data.shadow (rowid INTEGER); INSERT INTO data.shadow VALUES (NULL); INSERT INTO wordflow.nodes(table_name) VALUES ('shadow'); CREATE VIEW data.v AS SELECT * FROM t; INSERT INTO wordflow.nodes(table_name) VALUES ('v')").unwrap();
        assert!(
            editor
                .begin_cell_edit(
                    &p.conn,
                    "shadow",
                    Arc::new(protection::Protection::default())
                        .editing("test".into())
                        .unwrap(),
                    |_| {},
                    &changes::Notifications::default(),
                    None
                )
                .unwrap_err()
                .message
                .contains("rowid")
        );
        assert!(
            editor
                .begin_cell_edit(
                    &p.conn,
                    "v",
                    Arc::new(protection::Protection::default())
                        .editing("test".into())
                        .unwrap(),
                    |_| {},
                    &changes::Notifications::default(),
                    None
                )
                .unwrap_err()
                .message
                .contains("Materialize")
        );
        assert!(editor.sessions.is_empty());
    }
    #[test]
    fn empty_save_and_cancel_release_the_snapshot() {
        let p = fixture();
        let mut editor = Editor::default();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &id,
                Save::default(),
                &changes::Notifications::default(),
            )
            .unwrap();
        let id = editor
            .begin_cell_edit(
                &p.conn,
                "t",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap()
            .session_id;
        editor.cancel_cell_edit(&id).unwrap();
    }
}

#[cfg(test)]
mod value_tests {
    use super::tests::database;
    use super::*;
    use arrow_ipc::reader::StreamReader;
    use duckdb::arrow::array::{Array, StringArray};
    #[test]
    fn typed_values_and_enum_dictionary_round_trip_without_numeric_or_temporal_loss() {
        let p = database();
        let mut editor = Editor::default();
        p.conn.execute_batch("CREATE TYPE mood AS ENUM ('allowed','unused'); CREATE TABLE data.\"odd table\" (\"big\" UBIGINT, small HUGEINT, amount DECIMAL(38,10), stamp TIMESTAMP_NS, zoned TIMESTAMPTZ, day DATE, clock TIME, flag BOOLEAN, real DOUBLE, category mood, nullable VARCHAR, __wordflow_edit_0 VARCHAR); INSERT INTO data.\"odd table\" VALUES (18446744073709551615,-170141183460469231731687303715884105728,12345678901234567890.1234567890,'2024-01-02 03:04:05.123456789','2024-01-02 03:04:05.123456+05:30','2024-01-02','03:04:05.123456',true,1.2345678901234567,'allowed',NULL,'keep me'); INSERT INTO wordflow.nodes(table_name) VALUES ('odd table'); INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','odd table',json_array('nullable'),'custom.test','{}')").unwrap();
        let info = editor
            .begin_cell_edit(
                &p.conn,
                "odd table",
                Arc::new(protection::Protection::default())
                    .editing("test".into())
                    .unwrap(),
                |_| {},
                &changes::Notifications::default(),
                None,
            )
            .unwrap();
        let file = editor
            .cell_edit_page(
                &info.session_id,
                Page {
                    page: 1,
                    page_size: 20,
                    sorting: vec![],
                    review: None,
                },
                None,
            )
            .unwrap();
        let mut reader = StreamReader::try_new(file.reopen().unwrap(), None).unwrap();
        let schema = reader.schema();
        assert_eq!(
            schema.field(10).metadata()["ARROW:extension:name"],
            "custom.test"
        );
        assert!(matches!(
            schema.field(9).data_type(),
            duckdb::arrow::datatypes::DataType::Dictionary(_, _)
        ));
        let metadata: Value =
            serde_json::from_str(&schema.metadata()["wordflow:cell-edit"]).unwrap();
        let batch = reader.next().unwrap().unwrap();
        let changes = info
            .columns
            .iter()
            .map(|column| {
                let index = metadata["values"][&column.name].as_u64().unwrap() as usize;
                let values = batch
                    .column(index)
                    .as_any()
                    .downcast_ref::<StringArray>()
                    .unwrap();
                Patch {
                    row_ref: "0".into(),
                    column: column.name.clone(),
                    value: (!values.is_null(0)).then(|| values.value(0).into()),
                }
            })
            .collect::<Vec<_>>();
        let originals = changes
            .iter()
            .map(|patch| patch.value.clone())
            .collect::<Vec<_>>();
        editor
            .save_cell_edit(
                || Ok(p.conn.try_clone()?),
                &info.session_id,
                Save {
                    changes,
                    ..Save::default()
                },
                &changes::Notifications::default(),
            )
            .unwrap();
        let expressions = info
            .columns
            .iter()
            .map(|c| format!("CAST({} AS VARCHAR)", query::quote(&c.name)))
            .collect::<Vec<_>>()
            .join(",");
        let after = p
            .conn
            .query_row(
                &format!("SELECT {expressions} FROM data.\"odd table\""),
                [],
                |r| {
                    (0..info.columns.len())
                        .map(|i| r.get::<_, Option<String>>(i))
                        .collect::<duckdb::Result<Vec<_>>>()
                },
            )
            .unwrap();
        assert_eq!(originals, after);
        assert_eq!(after[0].as_deref(), Some("18446744073709551615"));
        assert_eq!(after[3].as_deref(), Some("2024-01-02 03:04:05.123456789"));
    }
}
