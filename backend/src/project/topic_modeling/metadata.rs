//! Bounded groups captured with source rows; later source edits cannot recolour a run.
use super::*;
use std::collections::BTreeMap;

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct ColourField {
    pub column: String,
    pub groups: Vec<ColourGroup>,
    assignments: Vec<usize>,
}
#[derive(Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub(crate) struct ColourGroup {
    pub label: String,
    pub count: usize,
    pub missing: bool,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct ColourFieldSummary {
    pub column: String,
    pub groups: Vec<ColourGroup>,
}
impl ColourField {
    pub fn summary(&self) -> ColourFieldSummary {
        ColourFieldSummary {
            column: self.column.clone(),
            groups: self.groups.clone(),
        }
    }
}
pub(super) fn capture(
    conn: &Connection,
    retained: &[CapturedDocuments],
) -> Result<Vec<ColourField>> {
    let [source] = retained else {
        return Ok(Vec::new());
    };
    let mut fields = Vec::new();
    for (column, kind) in &source.columns {
        if column == &source.input.column
            || (kind.contains('[')
                || ["STRUCT", "MAP", "UNION"]
                    .iter()
                    .any(|prefix| kind.starts_with(prefix)))
            || matches!(kind.as_str(), "BLOB" | "VARIANT")
        {
            continue;
        }
        let text = format!("CAST(source.{} AS VARCHAR)", query::quote(column));
        let value = format!(
            "CASE WHEN regexp_full_match({text}, '[\\s\\p{{Z}}]*') THEN NULL ELSE {text} END"
        );
        let value = if matches!(kind.as_str(), "DOUBLE" | "FLOAT" | "REAL") {
            format!(
                "CASE WHEN isnan(source.{}) THEN NULL ELSE {value} END",
                query::quote(column)
            )
        } else {
            value
        };
        let sql = format!(
            "SELECT {value} AS value,count(*)::UBIGINT FROM {} WHERE {value} IS NOT NULL GROUP BY value ORDER BY count(*) DESC,value LIMIT 9",
            source.name
        );
        let groups = conn
            .prepare(&sql)?
            .query_map([], |row| {
                Ok(ColourGroup {
                    label: row.get(0)?,
                    count: row.get::<_, u64>(1)? as usize,
                    missing: false,
                })
            })?
            .collect::<duckdb::Result<Vec<_>>>()?;
        if !(2..=8).contains(&groups.len()) {
            continue;
        }
        let mut field = ColourField {
            column: column.clone(),
            groups,
            assignments: Vec::new(),
        };
        let missing = field.groups.len();
        let indices = field
            .groups
            .iter()
            .enumerate()
            .map(|(i, group)| (group.label.as_str(), i))
            .collect::<BTreeMap<_, _>>();
        field.assignments = conn
            .prepare(&format!(
                "SELECT {value} FROM {} ORDER BY document_id",
                source.name
            ))?
            .query_map([], |row| row.get::<_, Option<String>>(0))?
            .map(|row| {
                row.map(|value| {
                    value
                        .as_deref()
                        .and_then(|value| indices.get(value))
                        .copied()
                        .unwrap_or(missing)
                })
            })
            .collect::<duckdb::Result<Vec<_>>>()?;
        let count = field
            .assignments
            .iter()
            .filter(|index| **index == missing)
            .count();
        if count > 0 {
            field.groups.push(ColourGroup {
                label: "Missing".into(),
                count,
                missing: true,
            });
        }
        fields.push(field);
    }
    Ok(fields)
}

type Counts = Vec<Vec<usize>>;

pub(super) fn counts(
    documents: &[DocumentResult],
    sizes: &[usize],
    fields: &[ColourField],
    selected: Option<&str>,
    topic_count: usize,
) -> Result<(Counts, Option<Counts>)> {
    let mut counts = vec![vec![0; sizes.len()]; topic_count];
    let field = selected
        .map(|column| {
            fields
                .iter()
                .find(|field| field.column == column)
                .ok_or_else(|| Error::invalid("Choose an eligible retained metadata field"))
        })
        .transpose()?;
    let mut colour = field.map(|field| vec![vec![0; field.groups.len()]; topic_count]);
    let mut source = 0;
    let mut end = sizes.first().copied().unwrap_or(0);
    for document in documents {
        while document.doc_index >= end && source + 1 < sizes.len() {
            source += 1;
            end += sizes[source];
        }
        if document.dominant_topic < 0 {
            continue;
        }
        let topic = document.dominant_topic as usize;
        *counts
            .get_mut(topic)
            .and_then(|counts| counts.get_mut(source))
            .ok_or_else(|| model_error("Invalid retained Topic assignment"))? += 1;
        if let (Some(field), Some(colour)) = (field, colour.as_mut()) {
            let group = *field.assignments.get(document.doc_index).ok_or_else(|| {
                model_error("Retained metadata is unavailable. Rerun this analysis.")
            })?;
            colour[topic][group] += 1;
        }
    }
    Ok((counts, colour))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retained_groups_are_bounded_access_source_order_and_own_denominators() {
        let project = Project::untitled().unwrap();
        let conn = &project.database.conn;
        conn.execute_batch("CREATE TABLE data.docs AS SELECT i AS id, 'document ' || i AS text, CASE WHEN i=0 THEN NULL WHEN i=1 THEN chr(9) || chr(10) || chr(160) WHEN i<6 THEN 'a' ELSE 'b' END AS category, 1.250::DECIMAL(12,3) + (i%2) AS amount, i%9 AS too_many FROM range(10) t(i); INSERT INTO wordflow.nodes(table_name) VALUES ('docs')").unwrap();
        let source = capture_documents(
            conn,
            &DocumentInput {
                source: "docs".into(),
                column: "text".into(),
            },
            None,
        )
        .unwrap();
        let fields = capture(conn, &[source]).unwrap();
        assert_eq!(
            fields
                .iter()
                .map(|field| field.column.as_str())
                .collect::<Vec<_>>(),
            vec!["category", "amount"]
        );
        let group = &fields[0];
        assert_eq!(
            group
                .groups
                .iter()
                .map(|g| (g.label.as_str(), g.count, g.missing))
                .collect::<Vec<_>>(),
            vec![("a", 4, false), ("b", 4, false), ("Missing", 2, true)]
        );
        conn.execute_batch("UPDATE data.docs SET category='later source edit'")
            .unwrap();
        let docs = (0..10)
            .map(|doc_index| DocumentResult {
                doc_index,
                dominant_topic: if doc_index == 9 {
                    -1
                } else {
                    (doc_index % 2) as i32
                },
                topic_coverage: vec![],
            })
            .collect::<Vec<_>>();
        let (counts, colour) = counts(&docs, &[10], &fields, Some("category"), 2).unwrap();
        assert_eq!(counts, vec![vec![5], vec![4]]);
        assert_eq!(colour.unwrap(), vec![vec![2, 2, 1], vec![2, 1, 1]]);
        assert!(capture(conn, &[]).unwrap().is_empty());
        assert!(super::counts(&docs, &[10], &fields, Some("too_many"), 2).is_err());
    }
}
