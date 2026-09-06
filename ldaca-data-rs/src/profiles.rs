//! Explicit compatibility profiles. Generic conversion never selects these implicitly.
use crate::{
    metadata::{as_list, entity_types, first_string, reference},
    table::Row,
    tabulate::{convert, Config},
    Error, Result, RoCrate, Table,
};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use url::Url;

pub fn extract_identifier(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.starts_with("arcp://") {
        return Some(value.into());
    }
    let parsed = Url::parse(value).ok()?;
    for name in ["id", "_crateId"] {
        if let Some((_, value)) = parsed
            .query_pairs()
            .find(|(key, value)| key == name && !value.trim().is_empty())
        {
            return Some(value.trim().into());
        }
    }
    None
}
pub fn load_wordflow_config(identifier: &str) -> Result<Config> {
    // Lookup uses explicit IDs rather than unsafe resource filenames.
    let id = Url::parse(identifier)
        .ok()
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .and_then(|u| {
            ["_crateId", "id"].iter().find_map(|name| {
                u.query_pairs()
                    .find(|(k, v)| k == name && !v.trim().is_empty())
                    .map(|(_, v)| v.trim().to_owned())
            })
        })
        .unwrap_or_else(|| identifier.trim().to_owned());
    let source = match id.as_str() {
        "arcp://name,hdl10.26180~23961609" => {
            include_str!("../configs/corpora/name,hdl10.26180~23961609.json")
        }
        "arcp://name,hdl10.26181~23089559" => {
            include_str!("../configs/corpora/name,hdl10.26181~23089559.json")
        }
        "arcp://name,hdl10.25949~24769173.v1" => {
            include_str!("../configs/corpora/name,hdl10.25949~24769173.v1.json")
        }
        _ => include_str!("../configs/general.json"),
    };
    Config::from_value(serde_json::from_str(source)?)
}
pub fn wordflow_metadata(
    krate: &RoCrate,
    identifier: &str,
    config: Option<Config>,
) -> Result<Table> {
    let mut config = config
        .map(Ok)
        .unwrap_or_else(|| load_wordflow_config(identifier))?;
    let selected = ["RepositoryObject", "CreativeWork", "File"]
        .into_iter()
        .find(|name| config.tables.contains_key(*name))
        .map(str::to_owned)
        .or_else(|| config.tables.first().map(|(k, _)| k.clone()))
        .ok_or_else(|| {
            Error::InvalidInput("RO-Crate tabular configuration has no tables".into())
        })?;
    config.tables.retain(|kind, _| kind == &selected);
    convert(krate, &config, true)?
        .tables
        .shift_remove(&selected)
        .ok_or_else(|| Error::Conversion("missing output table".into()))
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub file_id: String,
    pub path: String,
    pub name: String,
    pub encoding_format: String,
    pub content_size: Option<i64>,
    pub annotation_of: Option<String>,
    pub work_name: Option<String>,
    pub date_created: Option<String>,
}
pub fn content_size(value: Option<&Value>) -> Option<i64> {
    first_string(value)?.parse::<i64>().ok().filter(|s| *s >= 0)
}
fn file_path(id: &str) -> Option<String> {
    if let Ok(url) = Url::parse(id) {
        url.query_pairs()
            .find(|(k, _)| k == "path")
            .map(|(_, v)| v.into_owned())
    } else {
        Some(id.strip_prefix("./").unwrap_or(id).into())
    }
}
pub fn select_documents(krate: &RoCrate) -> Vec<Document> {
    let mut selected: IndexMap<String, Document> = IndexMap::new();
    for (id, entity) in krate.entities() {
        if !entity_types(entity).iter().any(|t| t == "File")
            || !crate::metadata::strings(entity.get("encodingFormat"))
                .iter()
                .any(|s| s.eq_ignore_ascii_case("text/plain"))
        {
            continue;
        }
        let Some(path) = file_path(id).filter(|s| !s.is_empty()) else {
            continue;
        };
        let annotation_of = first_string(
            entity
                .get("ldac:annotationOf")
                .or_else(|| entity.get("annotationOf")),
        );
        let work = annotation_of.as_ref().and_then(|id| krate.entity(id));
        let key = annotation_of.clone().unwrap_or_else(|| {
            path.strip_suffix("-plain.txt")
                .or_else(|| path.strip_suffix(".txt"))
                .unwrap_or(&path)
                .to_owned()
        });
        let candidate = Document {
            file_id: id.clone(),
            name: first_string(entity.get("name")).unwrap_or_else(|| path.clone()),
            content_size: content_size(entity.get("contentSize")),
            annotation_of,
            work_name: work.and_then(|w| first_string(w.get("name"))),
            date_created: work.and_then(|w| first_string(w.get("dateCreated"))),
            encoding_format: "text/plain".into(),
            path,
        };
        if selected.get(&key).is_none_or(|current| {
            candidate.path.contains("-plain.") && !current.path.contains("-plain.")
        }) {
            selected.insert(key, candidate);
        }
    }
    let mut documents: Vec<_> = selected.into_values().collect();
    documents.sort_by(|a, b| a.path.cmp(&b.path));
    documents
}
pub fn document_table(documents: &[Document], texts: &IndexMap<String, String>) -> Result<Table> {
    let mut rows = Vec::new();
    for document in documents {
        let text = texts.get(&document.path).ok_or_else(|| {
            Error::Conversion(format!("missing downloaded document: {}", document.path))
        })?;
        let Value::Object(object) = serde_json::to_value(document)? else {
            return Err(Error::Conversion("invalid document".into()));
        };
        let mut row: Row = object.into_iter().collect();
        row.insert("text".into(), Value::String(text.clone()));
        rows.push(row);
    }
    Table::from_rows_with_columns(
        "documents",
        &rows,
        HashMap::from([("ldaca.profile".into(), "wordflow_v1".into())]),
        &[
            "file_id",
            "path",
            "name",
            "encoding_format",
            "content_size",
            "annotation_of",
            "work_name",
            "date_created",
            "text",
        ],
    )
}
pub fn reference_ids(entity: &Map<String, Value>, property: &str) -> Vec<String> {
    as_list(entity.get(property).unwrap_or(&Value::Null))
        .into_iter()
        .filter_map(reference)
        .map(str::to_owned)
        .collect()
}
