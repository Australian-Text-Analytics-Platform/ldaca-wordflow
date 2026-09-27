//! Generic tabulation of explicitly selected document paths and downloaded text.
use crate::data::{table::Row, Result, Table};
use indexmap::IndexMap;
use serde_json::Value;
use std::collections::HashMap;

pub fn from_texts(identifier: &str, texts: &IndexMap<String, String>) -> Result<Table> {
    let rows: Vec<_> = texts
        .iter()
        .map(|(path, text)| {
            Row::from([
                ("crate_id".into(), Value::String(identifier.into())),
                ("path".into(), Value::String(path.clone())),
                ("text".into(), Value::String(text.clone())),
            ])
        })
        .collect();
    Table::from_rows_with_columns(
        "documents",
        &rows,
        HashMap::from([("ldaca.table_kind".into(), "documents".into())]),
        &["crate_id", "path", "text"],
    )
}
