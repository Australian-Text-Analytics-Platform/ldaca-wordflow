//! Live Annotation editing uses the ordinary Table editor and its atomic Save boundary.
use super::*;
pub(crate) mod execution;
pub(crate) mod review;
use std::collections::BTreeSet;

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct Codebook {
    pub source: ObjectTarget,
    pub code: String,
    pub description: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManualSetup {
    pub source: ObjectTarget,
    pub document: String,
    pub annotation: String,
    pub correction: Option<String>,
    pub codebook: Option<Codebook>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum EditRequest {
    Manual {
        setup: ManualSetup,
    },
    Corrections {
        setup: ManualSetup,
        expected: changes::MutationStamp,
    },
    Codebook {
        codebook: Codebook,
    },
}
impl EditRequest {
    pub fn target(&self) -> &ObjectTarget {
        match self {
            Self::Manual { setup } | Self::Corrections { setup, .. } => &setup.source,
            Self::Codebook { codebook } => &codebook.source,
        }
    }
    pub fn expected(&self) -> Option<changes::MutationStamp> {
        match self {
            Self::Corrections { expected, .. } => Some(*expected),
            _ => None,
        }
    }
    pub(super) fn columns(&self) -> Vec<&str> {
        match self {
            Self::Manual { setup } => std::iter::once(setup.annotation.as_str())
                .chain(setup.correction.as_deref())
                .collect(),
            Self::Corrections { setup, .. } => setup.correction.as_deref().into_iter().collect(),
            Self::Codebook { codebook } => vec![&codebook.code, &codebook.description],
        }
    }
    pub(super) fn validate(&self, conn: &Connection) -> Result<()> {
        let relation = self.target().resolve(conn)?.relation;
        let fields = mutations::columns(conn, &relation)?;
        let mut roles = BTreeSet::new();
        let columns = self.columns();
        if columns.is_empty() {
            return Err(Error::invalid(
                "Choose a correction column before editing corrections",
            ));
        }
        for name in &columns {
            if !roles.insert(name.to_ascii_lowercase()) {
                return Err(Error::invalid(
                    "Annotation roles must use different columns",
                ));
            }
            if !fields
                .iter()
                .any(|(column, ty)| column == name && ty == "VARCHAR")
            {
                return Err(Error::invalid(format!(
                    "Column {name} must be a string column"
                )));
            }
        }
        if let Self::Manual { setup } | Self::Corrections { setup, .. } = self {
            if setup.correction.as_ref().is_some_and(|name| {
                name.eq_ignore_ascii_case(&setup.annotation)
                    || name.eq_ignore_ascii_case(&setup.document)
            }) {
                return Err(Error::invalid(
                    "Annotation roles must use different columns",
                ));
            }
            if !fields
                .iter()
                .any(|(name, ty)| name == &setup.document && ty == "VARCHAR")
            {
                return Err(Error::invalid("Choose a string document column"));
            }
            if columns
                .iter()
                .any(|name| name.eq_ignore_ascii_case(&setup.document))
            {
                return Err(Error::invalid(
                    "The document column cannot also contain labels",
                ));
            }
            if let Some(codebook) = &setup.codebook {
                read_codebook(conn, codebook)?;
            }
        }
        Ok(())
    }
    pub(super) fn validate_changes(
        &self,
        conn: &Connection,
        input: &mut cell_edit::Save,
    ) -> Result<()> {
        if !matches!(self, Self::Codebook { .. })
            && (!input.deletions.is_empty() || !input.insertions.is_empty())
        {
            return Err(Error::invalid(
                "Annotation editing cannot add or delete documents",
            ));
        }
        match self {
            Self::Manual { setup } | Self::Corrections { setup, .. } => {
                let codes = setup
                    .codebook
                    .as_ref()
                    .map(|codebook| read_codebook(conn, codebook))
                    .transpose()?;
                for patch in &mut input.changes {
                    if let Some(value) = &mut patch.value {
                        let trimmed = value.trim();
                        if trimmed.is_empty()
                            || codes
                                .as_ref()
                                .is_some_and(|codes| !codes.iter().any(|code| code.code == trimmed))
                        {
                            return Err(Error::invalid(format!(
                                "Label {value:?} is not in the current Codebook. Choose a valid code or None"
                            )));
                        }
                        *value = trimmed.into();
                    }
                }
            }
            Self::Codebook { codebook } => {
                for patch in &mut input.changes {
                    if patch.column == codebook.code {
                        patch.value = patch.value.as_ref().map(|value| value.trim().into());
                    }
                }
                for insertion in &mut input.insertions {
                    if let Some(Some(value)) = insertion.values.get_mut(&codebook.code) {
                        *value = value.trim().into();
                    }
                }
            }
        }
        Ok(())
    }
    pub(super) fn validate_saved(&self, conn: &Connection) -> Result<()> {
        if let Self::Codebook { codebook } = self {
            read_codebook(conn, codebook)?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Code {
    pub code: String,
    pub description: String,
}
pub(super) fn read_codebook(conn: &Connection, input: &Codebook) -> Result<Vec<Code>> {
    let relation = input.source.resolve(conn)?.relation;
    let fields = mutations::columns(conn, &relation)?;
    if input.code.eq_ignore_ascii_case(&input.description)
        || [&input.code, &input.description].iter().any(|name| {
            !fields
                .iter()
                .any(|(column, ty)| column == *name && ty == "VARCHAR")
        })
    {
        return Err(Error::invalid(
            "Choose different string columns for codes and descriptions",
        ));
    }
    let rows = conn
        .prepare(&format!(
            "SELECT {}, {} FROM {} LIMIT 201",
            query::quote(&input.code),
            query::quote(&input.description),
            relation.sql()
        ))?
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })?
        .collect::<duckdb::Result<Vec<_>>>()?;
    if rows.len() > 200 {
        return Err(Error::invalid("A Codebook can contain at most 200 codes"));
    }
    let mut used = BTreeSet::new();
    rows.into_iter().map(|(code, description)| {
        let code = code.unwrap_or_default();
        let description = description.unwrap_or_default();
        let trimmed = code.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 200 || description.chars().count() > 2000 {
            return Err(Error::invalid("Codes must be nonblank and at most 200 characters; descriptions at most 2000 characters"));
        }
        if !used.insert(caseless::default_case_fold_str(trimmed)) {
            return Err(Error::invalid(format!("Code {trimmed:?} is duplicated ignoring case")));
        }
        Ok(Code { code: trimmed.into(), description })
    }).collect()
}

impl Database {
    pub(super) fn create_codebook(&mut self, name: String) -> Result<Codebook> {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::invalid("Choose a name for the Codebook"));
        }
        let tx = self.conn.transaction()?;
        let relation = Relation {
            schema: "data".into(),
            name: name.into(),
        };
        let pending = PendingChange::new(
            &tx,
            ChangeScope::object(relation.clone()),
            &self.cancellation,
        );
        tx.execute_batch(&format!(
            "CREATE TABLE {} (code VARCHAR, description VARCHAR)",
            relation.sql()
        ))?;
        tx.execute("INSERT INTO wordflow.nodes(table_name) VALUES (?)", [name])?;
        pending.commit(tx, &self.changes, &self.cancellation)?;
        Ok(Codebook {
            source: ObjectTarget {
                schema: Some("data".into()),
                name: name.into(),
            },
            code: "code".into(),
            description: "description".into(),
        })
    }
    pub(super) fn save_manual_setup(&mut self, tab: Uuid, setup: &ManualSetup) -> Result<()> {
        let tx = self.conn.transaction()?;
        analyses::claim_tab(&tx, tab, "annotation")?;
        let mut settings = analyses::read_tab(&tx, tab)?.settings;
        settings["manual"] = serde_json::json!({"setup": setup});
        // SQL timestamps share the analysis creation clock, allowing one shared-source restoration rule.
        let time: String = tx.query_row("SELECT current_timestamp::VARCHAR", [], |r| r.get(0))?;
        settings["manual"]["started_at"] = Value::String(time);
        tx.execute(
            "UPDATE wordflow.tabs SET settings=? WHERE id=?",
            params![settings.to_string(), tab.to_string()],
        )?;
        PendingChange::new(
            &tx,
            ChangeScope::resource(Resource::Tabs),
            &self.cancellation,
        )
        .commit(tx, &self.changes, &self.cancellation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Project, cell_edit::Editor) {
        let p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TABLE data.docs(rowid VARCHAR PRIMARY KEY, text VARCHAR, label VARCHAR, correction VARCHAR, extra INTEGER DEFAULT 42); INSERT INTO data.docs VALUES ('01','one','invalid',NULL,7),('1','two','A',NULL,8); CREATE TABLE data.codes(code VARCHAR, description VARCHAR, extra INTEGER DEFAULT 9); INSERT INTO data.codes VALUES ('A','first',1),('B','second',2); INSERT INTO wordflow.nodes(table_name) VALUES ('docs'),('codes')").unwrap();
        (p, cell_edit::Editor::default())
    }
    #[test]
    fn codebook_uniqueness_uses_unicode_case_folding() {
        let (p, _) = fixture();
        p.database.conn.execute_batch("DELETE FROM data.codes; INSERT INTO data.codes(code,description) VALUES ('Straße','a'),('STRASSE','b')").unwrap();
        assert!(
            read_codebook(&p.database.conn, &codebook())
                .unwrap_err()
                .message
                .contains("duplicated")
        );
    }
    fn codebook() -> Codebook {
        Codebook {
            source: "codes".into(),
            code: "code".into(),
            description: "description".into(),
        }
    }
    fn setup() -> ManualSetup {
        ManualSetup {
            source: "docs".into(),
            document: "text".into(),
            annotation: "label".into(),
            correction: Some("correction".into()),
            codebook: Some(codebook()),
        }
    }
    fn begin(p: &Project, editor: &mut cell_edit::Editor, request: EditRequest) -> String {
        let info = editor
            .begin_cell_edit(
                &p.database.conn,
                request.target(),
                Arc::new(protection::Protection::default())
                    .editing(request.target().clone())
                    .unwrap(),
                |_| {},
                &p.database.changes,
                None,
            )
            .unwrap();
        editor
            .restrict_annotation(&info.session_id, request)
            .unwrap();
        info.session_id
    }
    fn patch(row: &str, column: &str, value: Option<&str>) -> cell_edit::Save {
        cell_edit::Save {
            changes: vec![cell_edit::Patch {
                row_ref: row.into(),
                column: column.into(),
                value: value.map(str::to_owned),
            }],
            ..Default::default()
        }
    }
    #[test]
    fn manual_save_uses_live_codebook_and_preserves_invalid_unchanged_labels() {
        let (p, mut editor) = fixture();
        let id = begin(&p, &mut editor, EditRequest::Manual { setup: setup() });
        // The editor snapshot must not freeze the separately edited Codebook.
        p.database
            .conn
            .execute_batch("UPDATE data.codes SET code='C' WHERE code='B'")
            .unwrap();
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.database.conn.try_clone()?),
                    &id,
                    patch("1", "correction", Some("B")),
                    &p.database.changes
                )
                .unwrap_err()
                .message
                .contains("current Codebook")
        );
        assert!(editor.editing(&id).is_ok());
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.database.conn.try_clone()?),
                    &id,
                    patch("01", "text", Some("C")),
                    &p.database.changes
                )
                .is_err()
        );
        editor
            .save_cell_edit(
                || Ok(p.database.conn.try_clone()?),
                &id,
                patch("1", "correction", Some("C")),
                &p.database.changes,
            )
            .unwrap();
        let values: (String, String, i32) = p
            .database
            .conn
            .query_row(
                "SELECT label,correction,extra FROM data.docs WHERE rowid='1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(values, ("A".into(), "C".into(), 8));
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT label FROM data.docs WHERE rowid='01'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "invalid"
        );
    }
    #[test]
    fn codebook_save_preserves_extra_columns_and_rolls_back_duplicate_codes() {
        let (p, mut editor) = fixture();
        let id = begin(
            &p,
            &mut editor,
            EditRequest::Codebook {
                codebook: codebook(),
            },
        );
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.database.conn.try_clone()?),
                    &id,
                    patch("1", "code", Some(" a ")),
                    &p.database.changes
                )
                .unwrap_err()
                .message
                .contains("duplicated")
        );
        assert_eq!(
            read_codebook(&p.database.conn, &codebook()).unwrap()[1].code,
            "B"
        );
        editor
            .save_cell_edit(
                || Ok(p.database.conn.try_clone()?),
                &id,
                patch("1", "code", Some(" C ")),
                &p.database.changes,
            )
            .unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT extra FROM data.codes WHERE code='C'", [], |r| r
                    .get::<_, i32>(0))
                .unwrap(),
            2
        );
    }
    #[test]
    fn labels_cannot_delete_documents_and_none_writes_null() {
        let (p, mut editor) = fixture();
        let id = begin(&p, &mut editor, EditRequest::Manual { setup: setup() });
        assert!(
            editor
                .save_cell_edit(
                    || Ok(p.database.conn.try_clone()?),
                    &id,
                    cell_edit::Save {
                        deletions: vec!["1".into()],
                        ..Default::default()
                    },
                    &p.database.changes
                )
                .is_err()
        );
        editor
            .save_cell_edit(
                || Ok(p.database.conn.try_clone()?),
                &id,
                patch("1", "label", None),
                &p.database.changes,
            )
            .unwrap();
        assert!(
            p.database
                .conn
                .query_row(
                    "SELECT label IS NULL FROM data.docs WHERE rowid='1'",
                    [],
                    |r| r.get::<_, bool>(0)
                )
                .unwrap()
        );
    }
    #[test]
    fn limits_and_case_insensitive_uniqueness_use_characters() {
        let (p, _) = fixture();
        p.database
            .conn
            .execute(
                "UPDATE data.codes SET code=? WHERE code='A'",
                ["界".repeat(200)],
            )
            .unwrap();
        assert!(read_codebook(&p.database.conn, &codebook()).is_ok());
        p.database
            .conn
            .execute("UPDATE data.codes SET description=?", ["界".repeat(2001)])
            .unwrap();
        assert!(read_codebook(&p.database.conn, &codebook()).is_err());
    }
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct Review {
    pub compare: Vec<String>,
    #[serde(default)]
    pub changes: Vec<cell_edit::Patch>,
    pub filter: Option<RowFilter>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct RowFilter {
    pub column: String,
    pub differs: bool,
    pub existence: Existence,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Existence {
    Off,
    Present,
    Empty,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct ReviewSummary {
    total_rows: u64,
    filtered_rows: u64,
    includes_unsaved_changes: bool,
    comparisons: Vec<Comparison>,
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Comparison {
    column: String,
    included: u64,
    excluded: u64,
    #[schema(required = true)]
    agreement: Option<f64>,
    #[schema(required = true)]
    kappa: Option<f64>,
    #[schema(required = true)]
    alpha: Option<f64>,
    matrix: Vec<Confusion>,
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Confusion {
    annotation: String,
    comparison: String,
    count: u64,
}
pub(super) struct ReviewQuery {
    pub source: String,
    pub summary: ReviewSummary,
}

// Match Rust's trim semantics, including tabs, line breaks and Unicode whitespace.
pub(super) fn trimmed(expression: &str) -> String {
    format!(
        "trim({expression}, {})",
        query::literal(
            "\t\n\u{000b}\u{000c}\r \u{0085}\u{00a0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}"
        )
    )
}

pub(super) fn review_query(
    snapshot: &Connection,
    live: &Connection,
    relation: &Relation,
    columns: &[cell_edit::Column],
    rules: Option<&EditRequest>,
    request: &Review,
) -> Result<ReviewQuery> {
    let setup = match rules {
        Some(EditRequest::Manual { setup } | EditRequest::Corrections { setup, .. }) => setup,
        _ => {
            return Err(Error::invalid(
                "This editor does not support Annotation review",
            ));
        }
    };
    let codes = setup
        .codebook
        .as_ref()
        .map(|book| read_codebook(live, book))
        .transpose()?;
    let mut seen = BTreeSet::new();
    for name in &request.compare {
        if !seen.insert(name)
            || name == &setup.document
            || name == &setup.annotation
            || setup.correction.as_ref() == Some(name)
            || !columns
                .iter()
                .any(|c| c.name == *name && c.data_type == "VARCHAR")
        {
            return Err(Error::invalid(
                "Compare To requires distinct string columns outside the document, annotation and correction roles",
            ));
        }
    }
    let mut patches = std::collections::BTreeMap::<&str, Vec<&cell_edit::Patch>>::new();
    let mut cells = BTreeSet::new();
    for patch in &request.changes {
        if !columns.iter().any(|c| c.editable && c.name == patch.column)
            || !cells.insert((&patch.row_ref, &patch.column))
        {
            return Err(Error::invalid(
                "Review patches must identify distinct editable cells",
            ));
        }
        patches.entry(&patch.column).or_default().push(patch);
    }
    // Draft changes are overlaid in the query, before filters, counts and pagination.
    // Literal quoting preserves text identifiers such as 01 without numeric coercion.
    let projection = columns
        .iter()
        .map(|column| {
            let name = query::quote(&column.name);
            match patches.get(column.name.as_str()) {
                None => name,
                Some(changes) => {
                    let when = changes
                        .iter()
                        .map(|patch| {
                            format!(
                                "WHEN {} THEN {}",
                                query::literal(&patch.row_ref),
                                patch
                                    .value
                                    .as_ref()
                                    .map_or_else(|| "NULL".into(), |value| query::literal(value))
                            )
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    format!("CASE CAST(rowid AS VARCHAR) {when} ELSE {name} END AS {name}")
                }
            }
        })
        .collect::<Vec<_>>()
        .join(",");
    let rowid = if columns.iter().any(|c| c.identifier) {
        ""
    } else {
        "rowid,"
    };
    let source = format!("(SELECT {rowid}{projection} FROM {})", relation.sql());
    let label = |name: &str| {
        let value = format!("nullif({}, '')", trimmed(&query::quote(name)));
        match &codes {
            None => value,
            Some(codes) if codes.is_empty() => "NULL::VARCHAR".into(),
            Some(codes) => format!(
                "CASE WHEN {value} IN ({}) THEN {value} END",
                codes
                    .iter()
                    .map(|code| query::literal(&code.code))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
        }
    };
    let total: u64 =
        snapshot.query_row(&format!("SELECT count(*) FROM {source}"), [], |r| r.get(0))?;
    let mut comparisons = Vec::new();
    for name in &request.compare {
        let pairs = snapshot
            .prepare(&format!(
                "SELECT {},{},count(*) FROM {source} GROUP BY 1,2",
                label(&setup.annotation),
                label(name)
            ))?
            .query_map([], |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, u64>(2)?,
                ))
            })?
            .collect::<duckdb::Result<Vec<_>>>()?;
        comparisons.push(comparison(name, pairs));
    }
    let mut conditions = Vec::new();
    if let Some(filter) = &request.filter {
        if filter.column != setup.annotation && !request.compare.contains(&filter.column) {
            return Err(Error::invalid(
                "Filter must use the annotation column or a selected Compare To column",
            ));
        }
        let value = label(&filter.column);
        if filter.differs {
            let others = if filter.column == setup.annotation {
                request.compare.clone()
            } else {
                vec![setup.annotation.clone()]
            };
            if !others.is_empty() {
                let differences = others
                    .iter()
                    .map(|name| format!("({value} <> {})", label(name)))
                    .collect::<Vec<_>>()
                    .join(" OR ");
                conditions.push(format!("({differences})"));
            }
        }
        match filter.existence {
            Existence::Off => {}
            Existence::Present => conditions.push(format!("{value} IS NOT NULL")),
            Existence::Empty => conditions.push(format!("{value} IS NULL")),
        }
    }
    let source = if conditions.is_empty() {
        source
    } else {
        format!(
            "(SELECT * FROM {source} WHERE {})",
            conditions.join(" AND ")
        )
    };
    let filtered_rows =
        snapshot.query_row(&format!("SELECT count(*) FROM {source}"), [], |r| r.get(0))?;
    // Return original cell values to the shared editor. Its draft remains the sole editable
    // overlay; feeding patched values back as originals would erase change indicators.
    let source = format!(
        "(SELECT *{} FROM {} WHERE rowid IN (SELECT rowid FROM {source}))",
        if columns.iter().any(|c| c.identifier) {
            ""
        } else {
            ",rowid"
        },
        relation.sql()
    );
    Ok(ReviewQuery {
        source,
        summary: ReviewSummary {
            total_rows: total,
            filtered_rows,
            includes_unsaved_changes: !request.changes.is_empty(),
            comparisons,
        },
    })
}
fn comparison(name: &str, pairs: Vec<(Option<String>, Option<String>, u64)>) -> Comparison {
    let mut result = Comparison {
        column: name.into(),
        included: 0,
        excluded: 0,
        agreement: None,
        kappa: None,
        alpha: None,
        matrix: vec![],
    };
    let mut margins = std::collections::BTreeMap::<String, (u64, u64)>::new();
    let mut agreement = 0;
    for (a, b, count) in pairs {
        match (a, b) {
            (Some(a), Some(b)) => {
                result.included += count;
                if a == b {
                    agreement += count;
                }
                margins.entry(a.clone()).or_default().0 += count;
                margins.entry(b.clone()).or_default().1 += count;
                result.matrix.push(Confusion {
                    annotation: a,
                    comparison: b,
                    count,
                });
            }
            _ => result.excluded += count,
        }
    }
    result
        .matrix
        .sort_by(|a, b| (&a.annotation, &a.comparison).cmp(&(&b.annotation, &b.comparison)));
    if result.included > 0 {
        let n = result.included as f64;
        let observed = agreement as f64 / n;
        result.agreement = Some(observed);
        let expected = margins
            .values()
            .map(|(a, b)| (*a as f64 / n) * (*b as f64 / n))
            .sum::<f64>();
        if expected < 1.0 {
            result.kappa = Some((observed - expected) / (1.0 - expected));
        }
        let ratings = 2.0 * n;
        let same = margins
            .values()
            .map(|(a, b)| {
                let count = (*a + *b) as f64;
                count * (count - 1.0)
            })
            .sum::<f64>();
        let expected_disagreement = 1.0 - same / (ratings * (ratings - 1.0));
        if expected_disagreement > 0.0 {
            result.alpha = Some(1.0 - (1.0 - observed) / expected_disagreement);
        }
    }
    result
}

#[cfg(test)]
mod review_tests {
    use super::*;
    #[test]
    fn agreement_uses_paired_valid_labels_and_nominal_finite_sample_alpha() {
        let metric = comparison(
            "other",
            vec![
                (Some("A".into()), Some("A".into()), 3),
                (Some("B".into()), Some("A".into()), 1),
                (Some("B".into()), Some("B".into()), 2),
                (None, Some("A".into()), 4),
            ],
        );
        assert_eq!((metric.included, metric.excluded), (6, 4));
        assert!((metric.agreement.unwrap() - 5.0 / 6.0).abs() < 1e-12);
        assert!((metric.kappa.unwrap() - 2.0 / 3.0).abs() < 1e-12);
        assert!((metric.alpha.unwrap() - 24.0 / 35.0).abs() < 1e-12);
        let constant = comparison("same", vec![(Some("A".into()), Some("A".into()), 20)]);
        assert_eq!(constant.agreement, Some(1.0));
        assert_eq!(constant.kappa, None);
        assert_eq!(constant.alpha, None);
    }
    #[test]
    fn draft_filters_precede_paging_without_replacing_original_cells() {
        let p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TABLE data.docs(rowid VARCHAR, text VARCHAR,label VARCHAR,other VARCHAR); INSERT INTO data.docs VALUES ('01','one','A','A'),('1','two','A','B'),('2','three','invalid','B'); CREATE TABLE data.codes(code VARCHAR,description VARCHAR); INSERT INTO data.codes VALUES ('A',''),('B',''); INSERT INTO wordflow.nodes(table_name) VALUES ('docs'),('codes')").unwrap();
        let relation = Relation {
            schema: "data".into(),
            name: "docs".into(),
        };
        let columns = vec![
            cell_edit::Column {
                name: "rowid".into(),
                data_type: "VARCHAR".into(),
                editable: false,
                identifier: true,
            },
            cell_edit::Column {
                name: "text".into(),
                data_type: "VARCHAR".into(),
                editable: false,
                identifier: false,
            },
            cell_edit::Column {
                name: "label".into(),
                data_type: "VARCHAR".into(),
                editable: true,
                identifier: false,
            },
            cell_edit::Column {
                name: "other".into(),
                data_type: "VARCHAR".into(),
                editable: false,
                identifier: false,
            },
        ];
        let rules = EditRequest::Manual {
            setup: ManualSetup {
                source: "docs".into(),
                document: "text".into(),
                annotation: "label".into(),
                correction: None,
                codebook: Some(Codebook {
                    source: "codes".into(),
                    code: "code".into(),
                    description: "description".into(),
                }),
            },
        };
        let request = Review {
            compare: vec!["other".into()],
            changes: vec![
                cell_edit::Patch {
                    row_ref: "01".into(),
                    column: "label".into(),
                    value: Some("B".into()),
                },
                cell_edit::Patch {
                    row_ref: "1".into(),
                    column: "label".into(),
                    value: Some("B".into()),
                },
            ],
            filter: Some(RowFilter {
                column: "label".into(),
                differs: true,
                existence: Existence::Off,
            }),
        };
        let query = review_query(
            &p.database.conn,
            &p.database.conn,
            &relation,
            &columns,
            Some(&rules),
            &request,
        )
        .unwrap();
        assert_eq!(
            (query.summary.total_rows, query.summary.filtered_rows),
            (3, 1)
        );
        assert_eq!(
            (
                query.summary.comparisons[0].included,
                query.summary.comparisons[0].excluded
            ),
            (2, 1)
        );
        assert_eq!(query.summary.comparisons[0].agreement, Some(0.5));
        let values = p
            .database
            .conn
            .query_row(
                &format!("SELECT rowid,label FROM {}", query.source),
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .unwrap();
        assert_eq!(values, ("01".into(), "A".into()));
        p.database
            .conn
            .execute_batch("DELETE FROM data.codes WHERE code='B'")
            .unwrap();
        let next = review_query(
            &p.database.conn,
            &p.database.conn,
            &relation,
            &columns,
            Some(&rules),
            &request,
        )
        .unwrap();
        assert_eq!(next.summary.filtered_rows, 0);
        assert_eq!(next.summary.comparisons[0].included, 0);
    }
}
