//! Typed projections over owned Concordance relations. Filters never touch current sources.
use super::*;
#[derive(Clone, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ConcordanceFilter {
    #[schema(required = false)]
    pub document_id: Option<String>,
    pub excluded_terms: Vec<String>,
    pub uncased: bool,
    pub bins: Vec<u32>,
    pub bin_count: u32,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConcordanceQuery {
    pub source_index: usize,
    #[serde(default)]
    pub projection: Projection,
    #[serde(default)]
    pub filter: ConcordanceFilter,
    pub page: u64,
    pub page_size: u64,
    pub sort: Option<SavedSort>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConcordanceDensity {
    pub source_index: usize,
    pub bin_count: u32,
    #[serde(default)]
    pub uncased: bool,
}
fn corpus(conn: &Connection, id: Uuid, index: usize) -> Result<ConcordanceCorpus> {
    let analysis = read_analysis(conn, id)?;
    let result: ConcordanceResultV1 =
        serde_json::from_value(analysis.output("concordance")?.clone())?;
    let corpus = result
        .corpora
        .into_iter()
        .nth(index)
        .ok_or_else(|| Error::invalid("Unknown Concordance source"))?;
    for artifact in [corpus.documents, corpus.matches, corpus.projection] {
        artifact_relation(conn, id, artifact)?;
    }
    Ok(corpus)
}
fn bin_expression(source: &ConcordanceCorpus, count: u32) -> Result<String> {
    if !(1..=1000).contains(&count) {
        return Err(Error::invalid("Bin count must be between 1 and 1000"));
    }
    Ok(format!(
        "least({last},floor(start_idx::DOUBLE * {count} / greatest(length(CAST(source.{column} AS VARCHAR)),1)))::INTEGER",
        last = count - 1,
        column = query::quote(&source.input.column)
    ))
}
fn filtered(
    source: &ConcordanceCorpus,
    filter: &ConcordanceFilter,
) -> Result<(String, Vec<SqlValue>)> {
    let mut clauses = Vec::new();
    let mut parameters = Vec::new();
    if let Some(id) = &filter.document_id {
        let id = id
            .parse::<u64>()
            .map_err(|_| Error::invalid("Invalid document ID"))?;
        clauses.push("document_id=?".into());
        parameters.push(SqlValue::UBigInt(id));
    }
    if filter.excluded_terms.len() > 100_000 {
        return Err(Error::invalid("Too many excluded terms"));
    }
    let term = if filter.uncased {
        "lower(matched_text)"
    } else {
        "matched_text"
    };
    if !filter.excluded_terms.is_empty() {
        clauses.push(format!(
            "{term} NOT IN (SELECT {} FROM unnest(from_json(?, '[\"VARCHAR\"]')) t(word))",
            if filter.uncased {
                "lower(word)"
            } else {
                "word"
            }
        ));
        parameters.push(SqlValue::Text(serde_json::to_string(
            &filter.excluded_terms,
        )?));
    }
    if !filter.bins.is_empty() {
        let expression = bin_expression(source, filter.bin_count)?;
        if filter.bins.iter().any(|bin| *bin >= filter.bin_count) {
            return Err(Error::invalid("Selected bin is out of range"));
        }
        clauses.push(format!(
            "{expression} IN ({})",
            filter
                .bins
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(",")
        ));
    }
    Ok((
        format!(
            "SELECT * FROM wordflow.{}{}",
            artifact_table(source.projection),
            if clauses.is_empty() {
                String::new()
            } else {
                format!(" WHERE {}", clauses.join(" AND "))
            }
        ),
        parameters,
    ))
}
fn sort_expression(
    source: &ConcordanceCorpus,
    sort: &SavedSort,
    projection: Projection,
) -> Result<String> {
    let field = if sort.metadata {
        let column = source
            .columns
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(&sort.field))
            .ok_or_else(|| Error::invalid("Unknown metadata column"))?;
        format!("source.{}", query::quote(&column.0))
    } else {
        if projection == Projection::Documents
            || ![
                "matched_text",
                "l1",
                "r1",
                "l1_frequency",
                "r1_frequency",
                "start_idx",
                "end_idx",
            ]
            .contains(&sort.field.as_str())
        {
            return Err(Error::invalid("Unsupported sort field"));
        }
        query::quote(&sort.field)
    };
    Ok(format!(
        "{field} {} NULLS LAST,",
        if sort.descending { "DESC" } else { "ASC" }
    ))
}

impl Database {
    pub(in crate::project) fn concordance_page(
        &mut self,
        id: Uuid,
        request: ConcordanceQuery,
    ) -> Result<DocumentPage> {
        let offset = page_offset(request.page, request.page_size)?;
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let source = corpus(&self.conn, id, request.source_index)?;
        let (sql, parameters) = filtered(&source, &request.filter)?;
        let (matches, documents): (u64, u64) = self.conn.query_row(
            &format!("SELECT count(*),count(DISTINCT document_id) FROM ({sql})"),
            params_from_iter(parameters.iter()),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let order = request
            .sort
            .as_ref()
            .map(|sort| sort_expression(&source, sort, request.projection))
            .transpose()?
            .unwrap_or_default();
        let projection = if request.projection == Projection::Documents {
            format!(
                "SELECT * FROM ({}) ORDER BY {order} document_id",
                document_page_sql(&sql)
            )
        } else {
            format!("SELECT * FROM ({sql}) ORDER BY {order} document_id,match_order")
        };
        let file = arrow_page(
            &self.conn,
            &format!("{projection} LIMIT {} OFFSET {offset}", request.page_size),
            &parameters,
            &arrow_metadata::Annotations::load(
                &self.conn,
                &Relation {
                    schema: "wordflow".into(),
                    name: artifact_table(source.projection),
                },
            )?,
            &self.cancellation,
        )?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        let total = if request.projection == Projection::Documents {
            documents
        } else {
            matches
        };
        Ok(DocumentPage {
            file,
            total_rows: total,
            has_next: offset.saturating_add(request.page_size) < total,
            document_count: documents,
            match_count: matches,
        })
    }
    pub(in crate::project) fn concordance_density(
        &mut self,
        id: Uuid,
        request: ConcordanceDensity,
    ) -> Result<tempfile::NamedTempFile> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let source = corpus(&self.conn, id, request.source_index)?;
        let bin = bin_expression(&source, request.bin_count)?;
        let term = if request.uncased {
            "lower(matched_text)"
        } else {
            "matched_text"
        };
        let file = arrow_page(
            &self.conn,
            &format!(
                "SELECT {term} AS term,{bin} AS bin,count(*)::UBIGINT AS count FROM wordflow.{} GROUP BY term,bin ORDER BY term,bin",
                artifact_table(source.projection)
            ),
            &[],
            &arrow_metadata::Annotations::default(),
            &self.cancellation,
        )?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(file)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct PublishSource {
    pub source_index: usize,
    pub name: String,
    pub metadata: Vec<String>,
    pub fields: Vec<String>,
    #[serde(default)]
    pub filter: ConcordanceFilter,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConcordancePublish {
    pub projection: Projection,
    pub sources: Vec<PublishSource>,
}
impl Database {
    pub(in crate::project) fn publish_concordance(
        &mut self,
        id: Uuid,
        request: ConcordancePublish,
    ) -> Result<Vec<ObjectTarget>> {
        if request.sources.is_empty() || request.sources.len() > 2 {
            return Err(Error::invalid("Select one or two outputs"));
        }
        let tx = self.conn.transaction()?;
        let mut targets = Vec::new();
        for selected in &request.sources {
            check_cancellation(&self.cancellation)?;
            let source = corpus(&tx, id, selected.source_index)?;
            if selected.name.trim().is_empty() || selected.name.contains('\0') {
                return Err(Error::invalid("Enter an output name"));
            }
            let target = Relation {
                schema: "data".into(),
                name: selected.name.trim().into(),
            };
            let (sql, parameters) = filtered(&source, &selected.filter)?;
            let mut names = std::collections::HashSet::new();
            let mut fields = Vec::new();
            for column in std::iter::once(&source.input.column).chain(selected.metadata.iter()) {
                let name = source
                    .columns
                    .iter()
                    .find(|(name, _)| name.eq_ignore_ascii_case(column))
                    .ok_or_else(|| Error::invalid("Unknown metadata field"))?
                    .0
                    .clone();
                if names.insert(name.to_ascii_lowercase()) {
                    fields.push(format!(
                        "source.{} AS {}",
                        query::quote(&name),
                        query::quote(&name)
                    ));
                }
            }
            if request.projection == Projection::Documents {
                if !names.insert("conc_extraction".into()) {
                    return Err(Error::invalid(
                        "The source column conflicts with CONC_extraction",
                    ));
                }
                fields.push("CONC_extraction".into());
            } else {
                for field in &selected.fields {
                    let output = match field.as_str() {
                        "left_context" => "CONC_left_context",
                        "matched_text" => "CONC_matched_text",
                        "right_context" => "CONC_right_context",
                        "start_idx" => "CONC_start_idx",
                        "end_idx" => "CONC_end_idx",
                        "l1" => "CONC_l1",
                        "r1" => "CONC_r1",
                        "l1_frequency" => "CONC_l1_freq",
                        "r1_frequency" => "CONC_r1_freq",
                        "extraction" => "CONC_extraction",
                        _ => return Err(Error::invalid("Unknown match field")),
                    };
                    if !names.insert(output.to_ascii_lowercase()) {
                        return Err(Error::invalid(format!("Duplicate output column: {output}")));
                    }
                    fields.push(format!(
                        "{} AS {}",
                        query::quote(field),
                        query::quote(output)
                    ));
                }
            }
            let rows = if request.projection == Projection::Documents {
                format!(
                    "SELECT document_id,first(source) AS source,string_agg(trim(regexp_replace(extraction,'\\s+',' ','g')),chr(10) ORDER BY match_order) AS CONC_extraction FROM ({sql}) GROUP BY document_id"
                )
            } else {
                sql
            };
            tx.execute(
                &format!(
                    "CREATE TABLE {} AS SELECT {} FROM ({rows}) ORDER BY document_id{}",
                    target.sql(),
                    fields.join(","),
                    if request.projection == Projection::Matches {
                        ",match_order"
                    } else {
                        ""
                    }
                ),
                params_from_iter(parameters.iter()),
            )?;
            tx.execute(
                "INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?)",
                params![target.name, source.input.column],
            )?;
            let selected_columns = source
                .columns
                .iter()
                .map(|(name, _)| name)
                .filter(|name| names.contains(&name.to_ascii_lowercase()))
                .cloned()
                .collect::<Vec<_>>();
            arrow_metadata::Annotations::load(
                &tx,
                &Relation {
                    schema: "wordflow".into(),
                    name: artifact_table(source.projection),
                },
            )?
            .source_columns(&selected_columns)
            .store(&tx, &target)?;
            let parent = &source.input.source;
            if parent
                .schema
                .as_deref()
                .unwrap_or("data")
                .eq_ignore_ascii_case("data")
            {
                tx.execute("INSERT INTO wordflow.edges(source_name,target_name) SELECT table_name,? FROM wordflow.nodes WHERE lower(table_name)=lower(?) AND table_name<>? ON CONFLICT DO NOTHING",params![target.name,parent.name,target.name])?;
            }
            targets.push(ObjectTarget {
                schema: Some(target.schema),
                name: target.name,
            });
        }
        let mut scope = ChangeScope::resource(Resource::Graph);
        scope.objects = targets
            .iter()
            .map(|target| Relation {
                schema: "data".into(),
                name: target.name.clone(),
            })
            .collect();
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(targets)
    }
}
