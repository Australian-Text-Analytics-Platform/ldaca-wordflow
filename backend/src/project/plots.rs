//! Native plots retain one typed snapshot. All projections and publication use that snapshot.
use super::analyses::*;
use super::document_matches::{arrow_page, temporary_name};
use super::*;
mod contracts;
mod projection;
pub(crate) use contracts::*;
use projection::*;

fn saved(
    conn: &Connection,
    id: Uuid,
    mode: PlotMode,
) -> Result<(PlotRequest, PlotResultV1, Relation)> {
    let analysis = read_analysis(conn, id)?;
    let result: PlotResultV1 = serde_json::from_value(analysis.output(mode.kind())?.clone())?;
    let relation = artifact_relation(conn, id, result.rows)?;
    let mut request = analysis.request;
    for field in renames::plot_fields(mode.kind()) {
        if let Some(value) = request.get_mut(*field) {
            fn bind(value: &mut Value, bindings: &std::collections::BTreeMap<String, String>) {
                match value {
                    Value::String(name) => {
                        if let Some(captured) = bindings.get(name) {
                            *name = captured.clone();
                        }
                    }
                    Value::Array(values) => {
                        for value in values {
                            bind(value, bindings);
                        }
                    }
                    _ => {}
                }
            }
            bind(value, &result.field_bindings);
        }
    }
    Ok((PlotRequest::decode(mode, request)?, result, relation))
}
impl Database {
    pub(super) fn run_plot(
        &mut self,
        tab: Uuid,
        id: Uuid,
        mode: PlotMode,
        request: PlotRequest,
        progress: impl Fn(&str),
    ) -> Result<Analysis> {
        progress("Capturing source rows");
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let object = request.source().resolve(&self.conn)?;
        let columns = mutations::columns(&self.conn, &object.relation)?;
        validate(&request, &columns)?;
        let metadata =
            arrow_metadata::Annotations::load(&self.conn, &object.relation)?.prefixed("source");
        let temporary = temporary_name();
        self.conn.execute_batch(&format!("CREATE TEMP TABLE {temporary} AS SELECT row_number() OVER ()::UBIGINT AS row_id,s AS source FROM {} s",object.relation.sql()))?;
        progress("Calculating plot summary");
        let rows_sql = row_projection(&self.conn, &request, &columns, &temporary, false)?;
        let (count,usable,omitted,nonnegative): (u64,u64,u64,bool) = self.conn.query_row(&format!("SELECT count(*),count(*) FILTER(WHERE usable),count(*) FILTER(WHERE usable AND measurement IS NULL),coalesce(min(measurement)>=0,true) FROM ({rows_sql})"),[],|r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
        if matches!(mode, PlotMode::Compare | PlotMode::Sankey) && !nonnegative {
            return Err(Error::invalid("Weights must be nonnegative"));
        }
        if let PlotRequest::Scatter(r) = &request
            && let Some(size) = &r.size
        {
            let negative: bool = self.conn.query_row(
                &format!(
                    "SELECT coalesce(bool_or(source.{} < 0),false) FROM {temporary}",
                    query::quote(size)
                ),
                [],
                |r| r.get(0),
            )?;
            if negative {
                return Err(Error::invalid("Bubble sizes must be nonnegative"));
            }
        }
        let document_column = if object.relation.schema == "data" {
            self.conn
                .query_row(
                    "SELECT document_column FROM wordflow.nodes WHERE lower(table_name)=lower(?)",
                    [&object.relation.name],
                    |r| r.get::<_, Option<String>>(0),
                )
                .optional()?
                .flatten()
        } else {
            None
        };
        self.conn.execute_batch("COMMIT")?;
        check_cancellation(&self.cancellation)?;
        progress("Saving results");
        self.publish_analysis(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: mode.kind(),
            },
            move |conn| {
                let artifact = Uuid::new_v4();
                let relation = Relation {
                    schema: "wordflow".into(),
                    name: artifact_table(artifact),
                };
                conn.execute_batch(&format!(
                    "CREATE TABLE {} AS SELECT * FROM {temporary}",
                    relation.sql()
                ))?;
                register_table(conn, id, artifact, "rows")?;
                metadata.store(conn, &relation)?;
                Ok(serde_json::to_value(PlotResultV1 {
                    field_bindings: Default::default(),
                    rows: artifact,
                    source: ObjectTarget {
                        schema: Some(object.relation.schema),
                        name: object.relation.name,
                    },
                    columns,
                    document_column,
                    row_count: count,
                    usable_rows: usable,
                    omitted_measurements: omitted,
                    nonnegative,
                })?)
            },
        )
    }
    pub(super) fn plot_page(
        &mut self,
        id: Uuid,
        mode: PlotMode,
        request: PlotQuery,
    ) -> Result<tempfile::NamedTempFile> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let (input, result, relation) = saved(&self.conn, id, mode)?;
        let sql = chart_projection(
            &self.conn,
            &input,
            &result.columns,
            &relation.sql(),
            &request,
        )?;
        // Measured SVG budgets, shared by the five plot analyses. Probe one extra
        // row and reject the projection rather than returning a truncated chart.
        let limit = if mode == PlotMode::Sankey {
            5_000
        } else {
            100_000
        };
        let bounded = format!("SELECT * FROM ({sql}) LIMIT {}", limit + 1);
        let file = arrow_page(
            &self.conn,
            &bounded,
            &[],
            &arrow_metadata::Annotations::default(),
            &self.cancellation,
        )?;
        let reader = arrow_ipc::reader::StreamReader::try_new(file.reopen()?, None)
            .map_err(|e| Error::new("arrow_error", e.to_string()))?;
        let mut count = 0;
        let mut groups = std::collections::HashSet::new();
        for batch in reader {
            let batch = batch.map_err(|e| Error::new("arrow_error", e.to_string()))?;
            count += batch.num_rows();
            if count > limit {
                return Err(Error::new(
                    "display_capacity_exceeded",
                    format!(
                        "This projection contains more than {limit} plotted values (the display budget). Saved rows are complete. Use coarser intervals, fewer groups, or refine the input in Preprocessing before Run."
                    ),
                ));
            }
            if let Some(column) = batch.column_by_name("group_key") {
                let values = column
                    .as_any()
                    .downcast_ref::<duckdb::arrow::array::StringArray>()
                    .ok_or_else(|| {
                        Error::new("arrow_error", "Generated group keys must be VARCHAR")
                    })?;
                for value in values.iter().flatten() {
                    groups.insert(value.to_owned());
                    if groups.len() > 500 {
                        return Err(Error::new(
                            "display_capacity_exceeded",
                            "This projection contains more than 500 series (the display budget). Saved rows are complete. Increase minimum rows per group, merge case variants, or choose fewer grouping columns.",
                        ));
                    }
                }
            }
        }
        self.conn.execute_batch("COMMIT")?;
        Ok(file)
    }
    pub(super) fn publish_plot(
        &mut self,
        id: Uuid,
        mode: PlotMode,
        request: PlotPublish,
    ) -> Result<ObjectTarget> {
        let tx = self.conn.transaction()?;
        let (input, result, relation) = saved(&tx, id, mode)?;
        if request.name.trim().is_empty() || request.name.contains('\0') {
            return Err(Error::invalid("Enter an output name"));
        }
        let mut selected = Vec::new();
        for column in input
            .columns()
            .into_iter()
            .chain(request.columns.iter().map(String::as_str))
        {
            let canonical = result
                .columns
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(column))
                .ok_or_else(|| Error::invalid("Unknown output column"))?
                .0
                .clone();
            if !selected.contains(&canonical) {
                selected.push(canonical);
            }
        }
        let rows = row_projection(
            &tx,
            &input,
            &result.columns,
            &relation.sql(),
            request.query.uncased,
        )?;
        let (predicate, parameters) =
            selection_predicate(&input, &request.query, &request.selection)?;
        let fields = selected
            .iter()
            .map(|c| format!("source.{} AS {}", query::quote(c), query::quote(c)))
            .collect::<Vec<_>>()
            .join(",");
        let target = Relation {
            schema: "data".into(),
            name: request.name.trim().into(),
        };
        tx.execute(&format!("CREATE TABLE {} AS WITH rows AS ({rows}), eligible AS (SELECT group_key FROM rows WHERE usable GROUP BY group_key HAVING count(*) >= {}) SELECT {fields} FROM rows WHERE usable AND group_key IN (SELECT group_key FROM eligible) AND ({predicate}) ORDER BY row_id",target.sql(),request.query.minimum_rows),params_from_iter(parameters.iter()))?;
        let document = result.document_column.filter(|c| selected.contains(c));
        tx.execute(
            "INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?)",
            params![target.name, document],
        )?;
        arrow_metadata::Annotations::load(&tx, &relation)?
            .source_columns(&selected)
            .store(&tx, &target)?;
        if result.source.schema.as_deref() == Some("data") {
            tx.execute("INSERT INTO wordflow.edges(source_name,target_name) SELECT table_name,? FROM wordflow.nodes WHERE lower(table_name)=lower(?) AND table_name<>? ON CONFLICT DO NOTHING",params![target.name,result.source.name,target.name])?;
        }
        let mut scope = ChangeScope::resource(Resource::Graph);
        scope.objects.push(target.clone());
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(ObjectTarget {
            schema: Some(target.schema),
            name: target.name,
        })
    }
}

#[cfg(test)]
mod tests;
