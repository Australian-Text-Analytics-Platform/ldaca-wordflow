//! Bounded format discovery for the datetime shortcut; stored conversions stay strict.
use super::*;

pub(super) fn expression(
    conn: &Connection,
    relation: &Relation,
    column: &str,
    format: Option<&str>,
) -> Result<String> {
    let sample = query::quote(&format!("datetime_sample_{}", Uuid::new_v4().simple()));
    conn.execute_batch(&format!(
        "CREATE TEMP TABLE {sample} AS SELECT {column} AS value FROM {} LIMIT 200",
        relation.sql()
    ))?;
    // The caller owns the transaction: errors roll back the temporary relation too.
    let selected = select_format(conn, &sample, format)?;
    conn.execute_batch(&format!("DROP TABLE {sample}"))?;
    Ok(match selected {
        Some(format) => format!(
            "strptime(CAST({column} AS VARCHAR), {})",
            query::literal(&format)
        ),
        None => format!("CAST({column} AS TIMESTAMP)"),
    })
}

fn select_format(
    conn: &Connection,
    sample: &str,
    explicit: Option<&str>,
) -> Result<Option<String>> {
    if let Some(format) = explicit {
        // Strict evaluation produces DuckDB's useful parse error for manual retries.
        conn.query_row(
            &format!("SELECT count(strptime(CAST(value AS VARCHAR), ?)) FROM {sample}"),
            [format],
            |r| r.get::<_, u64>(0),
        )?;
        return Ok(Some(format.into()));
    }
    let failures: u64 = conn.query_row(
        &format!("SELECT count(*) FROM {sample} WHERE value IS NOT NULL AND TRY_CAST(value AS TIMESTAMP) IS NULL"),
        [], |r| r.get(0),
    )?;
    if failures == 0 {
        return Ok(None);
    }
    let first: Option<String> = conn.query_row(
        &format!(
            "SELECT first(CAST(value AS VARCHAR)) FILTER (WHERE value IS NOT NULL) FROM {sample}"
        ),
        [],
        |r| r.get(0),
    )?;
    let mut matching = Vec::new();
    for candidate in candidates(first.as_deref().unwrap_or_default()) {
        let failures: u64 = conn.query_row(
            &format!("SELECT count(*) FROM {sample} WHERE value IS NOT NULL AND try_strptime(CAST(value AS VARCHAR), ?) IS NULL"),
            [&candidate], |r| r.get(0),
        )?;
        if failures == 0 {
            matching.push(candidate);
        }
    }
    if matching.len() == 1 {
        return Ok(matching.pop());
    }
    Err(Error::new(
        "datetime_format_required",
        "Could not determine an unambiguous datetime format from the first 200 rows. Enter a format to convert this column.",
    ))
}

/// Recognize layouts, not dates: DuckDB validates ranges and calendar semantics.
fn candidates(value: &str) -> Vec<String> {
    let Some(colon) = value.find(':') else {
        return date_formats(value);
    };
    let hour_start = value[..colon]
        .rfind(|c: char| !c.is_ascii_digit())
        .map_or(0, |i| i + 1);
    let prefix = &value[..hour_start];
    let date = prefix.trim_end_matches([' ', 'T']);
    let separator = &prefix[date.len()..];
    if separator != " " && separator != "T" {
        return vec![];
    }
    let mut time = &value[hour_start..];
    let mut zone = "";
    if let Some(index) = time.find(['+', '-']) {
        let offset = &time[index + 1..];
        if offset.is_empty() || !offset.chars().all(|c| c.is_ascii_digit() || c == ':') {
            return vec![];
        }
        let preceding = &time[..index];
        zone = if preceding.ends_with(' ') {
            " %z"
        } else {
            "%z"
        };
        time = preceding.trim_end();
    }
    let ampm = time.ends_with(" AM")
        || time.ends_with(" PM")
        || time.ends_with(" am")
        || time.ends_with(" pm");
    if ampm {
        time = &time[..time.len() - 3];
    }
    let parts: Vec<_> = time.split(':').collect();
    if !(2..=3).contains(&parts.len()) || !digits(parts[0]) || !digits(parts[1]) {
        return vec![];
    }
    let mut clock = if ampm { "%I:%M" } else { "%H:%M" }.to_string();
    if let Some(seconds) = parts.get(2) {
        let (whole, fraction) = seconds
            .split_once('.')
            .map_or((*seconds, None), |(s, f)| (s, Some(f)));
        if !digits(whole) {
            return vec![];
        }
        clock.push_str(":%S");
        if let Some(fraction) = fraction {
            if !digits(fraction) || fraction.len() > 9 {
                return vec![];
            }
            clock.push_str(if fraction.len() > 6 { ".%n" } else { ".%f" });
        }
    }
    if ampm {
        clock.push_str(" %p");
    }
    date_formats(date)
        .into_iter()
        .map(|date| format!("{date}{separator}{clock}{zone}"))
        .collect()
}
fn digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit())
}
fn date_formats(value: &str) -> Vec<String> {
    let Some(separator) = value.chars().find(|c| !c.is_ascii_alphanumeric()) else {
        return vec![];
    };
    if !['-', '/', '.', ' '].contains(&separator) {
        return vec![];
    }
    let parts: Vec<_> = value.split(separator).collect();
    if parts.len() != 3 {
        return vec![];
    }
    let year = parts.iter().position(|s| s.len() == 4 && digits(s));
    let orders = match year {
        Some(0) => vec![["%Y", "%m", "%d"]],
        Some(2) => vec![["%d", "%m", "%Y"], ["%m", "%d", "%Y"]],
        _ => return vec![],
    };
    let short = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    let full = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    orders
        .into_iter()
        .filter_map(|mut order| {
            for (i, part) in parts.iter().enumerate() {
                if digits(part) {
                    if order[i] != "%Y" && part.len() > 2 {
                        return None;
                    }
                    continue;
                }
                if order[i] != "%m" {
                    return None;
                }
                let lower = part.to_ascii_lowercase();
                order[i] = if short.contains(&lower.as_str()) {
                    "%b"
                } else if full.contains(&lower.as_str()) {
                    "%B"
                } else {
                    return None;
                };
            }
            Some(order.join(&separator.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn convert(values: &[Option<&str>], manual: Option<&str>) -> Result<(String, String)> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("CREATE TABLE corpus(value VARCHAR)")?;
        for value in values {
            conn.execute("INSERT INTO corpus VALUES (?)", [value])?;
        }
        let tx = conn.unchecked_transaction()?;
        let expression = expression(
            &tx,
            &Relation {
                schema: "main".into(),
                name: "corpus".into(),
            },
            "value",
            manual,
        )?;
        let kind = tx.query_row(
            &format!("SELECT typeof(first({expression})) FROM corpus"),
            [],
            |r| r.get(0),
        )?;
        Ok((expression, kind))
    }
    #[test]
    fn direct_cast_remains_unmodified() {
        for values in [
            vec![],
            vec![None],
            vec![Some("2020-10-17 00:52:37")],
            vec![Some("2020-10-17T00:52:37+00:00")],
        ] {
            assert_eq!(
                convert(&values, None).unwrap(),
                ("CAST(value AS TIMESTAMP)".into(), "TIMESTAMP".into())
            );
        }
    }
    #[test]
    fn fallback_formats_are_strict_and_keep_timezone() {
        for text in [
            "2020-10-17 00:52:37.000 +0000",
            "2020-10-17 00:52:37.000 +0530",
            "17/10/2020 12:52:37 PM",
            "17 October 2020 00:52",
            "Oct 17 2020",
            "2020.10.17 00:52:37.123456789",
        ] {
            let (expression, kind) = convert(&[None, Some(text)], None).unwrap();
            assert!(expression.starts_with("strptime("), "{text}: {expression}");
            assert_eq!(
                kind,
                if text.contains('+') {
                    "TIMESTAMP WITH TIME ZONE"
                } else if text.ends_with("123456789") {
                    "TIMESTAMP_NS"
                } else {
                    "TIMESTAMP"
                }
            );
        }
        assert!(
            convert(&[Some("2020-10-17 00:52:37.000 +0000")], None)
                .unwrap()
                .0
                .contains("%Y-%m-%d %H:%M:%S.%f %z")
        );
    }
    #[test]
    fn unresolved_and_ambiguous_samples_request_manual_format() {
        for values in [
            vec![Some("01/02/2020")],
            vec![Some("")],
            vec![Some("17/10/20 12:30 PM")],
            vec![Some("17/10/2020"), Some("10/17/2020")],
            vec![Some("17/10/2020 12:30 PST")],
        ] {
            assert_eq!(
                convert(&values, None)
                    .expect_err(&format!("{values:?}"))
                    .code,
                "datetime_format_required"
            );
        }
        assert!(convert(&[Some("01/02/2020")], Some("%d/%m/%Y")).is_ok());
        assert_eq!(
            convert(&[Some("broken")], Some("%d/%m/%Y"))
                .unwrap_err()
                .code,
            "sql_error"
        );
    }
    #[test]
    fn only_first_two_hundred_rows_are_tested() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE corpus AS SELECT CASE WHEN i < 200 THEN '2020-10-17 00:52:37.000 +0000' ELSE 'broken' END AS value FROM range(201) r(i)").unwrap();
        let expression = expression(
            &conn,
            &Relation {
                schema: "main".into(),
                name: "corpus".into(),
            },
            "value",
            None,
        )
        .unwrap();
        conn.execute_batch(&format!(
            "CREATE VIEW converted AS SELECT {expression} AS value FROM corpus"
        ))
        .unwrap();
        assert!(
            conn.query_row("SELECT count(value) FROM converted", [], |r| r
                .get::<_, u64>(0))
                .is_err()
        );
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM duckdb_tables() WHERE temporary",
                [],
                |r| r.get::<_, u64>(0)
            )
            .unwrap(),
            0
        );
    }
}

#[cfg(test)]
mod mutation_tests {
    use super::super::mutations::{CastShortcut, CastType, ColumnChange};
    use super::*;
    #[test]
    fn table_conversion_rolls_back_beyond_sample_and_keeps_metadata() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.corpus AS SELECT CASE WHEN i<200 THEN '2020-10-17 00:52:37.000 +0000' ELSE 'broken' END AS value FROM range(201) r(i); INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('corpus','value')").unwrap();
        let error = db
            .change_column(
                ObjectTarget {
                    schema: Some("data".into()),
                    name: "corpus".into(),
                },
                ColumnChange::Cast {
                    column: "value".into(),
                    target: CastType::Shortcut(CastShortcut::Datetime),
                    format: None,
                },
            )
            .unwrap_err();
        assert_eq!(error.code, "sql_error");
        assert_eq!(
            db.conn
                .query_row("SELECT typeof(first(value)) FROM data.corpus", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "VARCHAR"
        );
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT document_column FROM wordflow.nodes WHERE table_name='corpus'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "value"
        );
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT count(*) FROM duckdb_tables() WHERE temporary",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            0
        );
    }
    #[test]
    fn manual_offset_format_preserves_the_instant() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE corpus(value VARCHAR); INSERT INTO corpus VALUES ('2020-10-17 00:52:37.000 +0530')").unwrap();
        let expression = expression(
            &conn,
            &Relation {
                schema: "main".into(),
                name: "corpus".into(),
            },
            "value",
            Some("%Y-%m-%d %H:%M:%S.%f %z"),
        )
        .unwrap();
        assert!(
            conn.query_row(
                &format!("SELECT {expression} = TIMESTAMPTZ '2020-10-16 19:22:37+00' FROM corpus"),
                [],
                |r| r.get::<_, bool>(0)
            )
            .unwrap()
        );
    }
}
