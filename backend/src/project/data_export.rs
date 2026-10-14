//! Public CSV/Excel projections. Representation choices never alter source types.
use super::*;
use std::io::{Seek, SeekFrom, Write};

fn columns(conn: &Connection, relation: &Relation) -> Result<Vec<(String, String)>> {
    Ok(conn
        .prepare(&format!("DESCRIBE SELECT * FROM {}", relation.sql()))?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<duckdb::Result<Vec<_>>>()?)
}

fn nested(kind: &str) -> bool {
    kind.starts_with("STRUCT(")
        || kind.starts_with("MAP(")
        || kind.starts_with("UNION(")
        || kind.ends_with(']')
}
fn text_projection(fields: &[(String, String)], utc: bool) -> String {
    fields
        .iter()
        .map(|(name, kind)| {
            let column = query::quote(name);
            let expression = if nested(kind) {
                format!("to_json({column})")
            } else if utc && kind == "TIMESTAMP WITH TIME ZONE" {
                format!("timezone('UTC',{column})")
            } else {
                column.clone()
            };
            format!("CAST({expression} AS VARCHAR) AS {column}")
        })
        .collect::<Vec<_>>()
        .join(",")
}
pub(super) fn csv(
    conn: &Connection,
    relation: &Relation,
    mut output: tempfile::NamedTempFile,
    cancellation: &CancellationToken,
) -> Result<tempfile::NamedTempFile> {
    let fields = columns(conn, relation)?;
    let raw = temporary_file(conn)?;
    conn.execute(
        &format!(
            "COPY (SELECT {} FROM {}) TO ? (FORMAT CSV, HEADER true)",
            text_projection(&fields, false),
            relation.sql()
        ),
        [raw.path().to_string_lossy().as_ref()],
    )?;
    check_cancellation(cancellation)?;
    output.write_all(b"\xef\xbb\xbf")?;
    std::io::copy(&mut std::fs::File::open(raw.path())?, output.as_file_mut())?;
    output.seek(SeekFrom::Start(0))?;
    Ok(output)
}
pub(super) fn xlsx(
    conn: &Connection,
    relation: &Relation,
    mut output: tempfile::NamedTempFile,
    cancellation: &CancellationToken,
) -> Result<tempfile::NamedTempFile> {
    use rust_xlsxwriter::{ExcelDateTime, Format, Workbook};
    let fields = columns(conn, relation)?;
    let count: u64 = conn.query_row(
        &format!("SELECT count(*) FROM {}", relation.sql()),
        [],
        |r| r.get(0),
    )?;
    if fields.len() > 16_384 || count > 1_048_575 {
        return Err(Error::invalid(
            "Excel supports at most 16,384 columns and 1,048,575 data rows plus the header",
        ));
    }
    let convert = |error: rust_xlsxwriter::XlsxError| Error::new("export_error", error.to_string());
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet_with_constant_memory();
    sheet.set_name("Data").map_err(convert)?;
    let date = Format::new().set_num_format("yyyy-mm-dd");
    let timestamp = Format::new().set_num_format("yyyy-mm-dd hh:mm:ss.000");
    for (index, (name, _)) in fields.iter().enumerate() {
        sheet.write_string(0, index as u16, name).map_err(convert)?;
    }
    let mut statement = conn.prepare(&format!(
        "SELECT {} FROM {}",
        text_projection(&fields, true),
        relation.sql()
    ))?;
    let mut rows = statement.query([])?;
    let mut row_index = 1;
    while let Some(row) = rows.next()? {
        check_cancellation(cancellation)?;
        for (index, (_, kind)) in fields.iter().enumerate() {
            let Some(value) = row.get::<_, Option<String>>(index)? else {
                continue;
            };
            let column = index as u16;
            if kind == "BOOLEAN" {
                sheet
                    .write_boolean(row_index, column, value == "true")
                    .map_err(convert)?;
            } else if kind == "DATE" || kind.starts_with("TIMESTAMP") {
                let value = ExcelDateTime::parse_from_str(&value).map_err(convert)?;
                sheet
                    .write_datetime_with_format(
                        row_index,
                        column,
                        &value,
                        if kind == "DATE" { &date } else { &timestamp },
                    )
                    .map_err(convert)?;
            } else if !nested(kind)
                && (kind.contains("INT")
                    || kind.starts_with("DECIMAL(")
                    || ["FLOAT", "DOUBLE", "REAL"].contains(&kind.as_str()))
            {
                match value.parse::<f64>() {
                    Ok(number) if number.is_finite() => {
                        sheet
                            .write_number(row_index, column, number)
                            .map_err(convert)?;
                    }
                    _ => {
                        sheet
                            .write_string(row_index, column, &value)
                            .map_err(convert)?;
                    }
                }
            } else {
                sheet
                    .write_string(row_index, column, &value)
                    .map_err(convert)?;
            }
        }
        row_index += 1;
    }
    workbook
        .save_to_writer(output.as_file_mut())
        .map_err(convert)?;
    check_cancellation(cancellation)?;
    output.seek(SeekFrom::Start(0))?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    #[test]
    fn csv_has_bom_and_json_nested_values_without_changing_source() {
        let project = Project::untitled().unwrap();
        let conn = &project.database.conn;
        conn.execute_batch("CREATE TABLE data.docs AS SELECT {'word':'你好','count':2} AS metadata, [1,2] AS ids, 18446744073709551615::UBIGINT AS exact").unwrap();
        let relation = Relation {
            schema: "data".into(),
            name: "docs".into(),
        };
        let mut file = csv(
            conn,
            &relation,
            temporary_file(conn).unwrap(),
            &CancellationToken::new(),
        )
        .unwrap();
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        assert!(bytes.starts_with(b"\xef\xbb\xbf"));
        let text = String::from_utf8(bytes[3..].to_vec()).unwrap();
        assert!(text.contains("\"\"word\"\":\"\"你好\"\""), "{text}");
        assert!(text.contains("[1,2]"));
        assert!(text.contains("18446744073709551615"));
        assert_eq!(
            conn.query_row("SELECT typeof(metadata) FROM data.docs", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "STRUCT(word VARCHAR, count INTEGER)"
        );
    }
    #[test]
    fn excel_reopens_typed_values_and_rejects_oversized_sheet() {
        use calamine::{Data, Reader};
        let project = Project::untitled().unwrap();
        let conn = &project.database.conn;
        conn.execute_batch("CREATE TABLE data.docs AS SELECT 2.5 AS value, true AS flag, '你好' AS text, [1,2] AS nested, NULL::VARCHAR AS absent; CREATE VIEW data.too_many AS SELECT i FROM range(1048576) r(i)").unwrap();
        let relation = Relation {
            schema: "data".into(),
            name: "docs".into(),
        };
        let file = xlsx(
            conn,
            &relation,
            temporary_file(conn).unwrap(),
            &CancellationToken::new(),
        )
        .unwrap();
        let mut workbook =
            calamine::Xlsx::new(std::io::BufReader::new(file.reopen().unwrap())).unwrap();
        let sheet = workbook.worksheet_range("Data").unwrap();
        assert_eq!(sheet.get((1, 0)), Some(&Data::Float(2.5)));
        assert_eq!(sheet.get((1, 1)), Some(&Data::Bool(true)));
        assert_eq!(sheet.get((1, 2)), Some(&Data::String("你好".into())));
        assert_eq!(sheet.get((1, 3)), Some(&Data::String("[1,2]".into())));
        let too_many = Relation {
            name: "too_many".into(),
            ..relation
        };
        assert!(
            xlsx(
                conn,
                &too_many,
                temporary_file(conn).unwrap(),
                &CancellationToken::new()
            )
            .unwrap_err()
            .message
            .contains("1,048,575")
        );
    }
}
