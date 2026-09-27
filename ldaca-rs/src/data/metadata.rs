//! Ordered, offline RO-Crate metadata. This is not an RDF/context expansion engine.
use crate::data::{Error, Result};
use indexmap::IndexMap;
use serde_json::{json, Map, Value};
use std::path::Path;

#[derive(Clone, Debug)]
pub struct RoCrate {
    original: Value,
    entities: IndexMap<String, Map<String, Value>>,
}
impl RoCrate {
    pub fn from_json(bytes: &[u8]) -> Result<Self> {
        Self::from_value(serde_json::from_slice(bytes)?)
    }
    pub fn from_path(path: &Path) -> Result<Self> {
        let path = if path.is_dir() {
            path.join("ro-crate-metadata.json")
        } else {
            path.to_owned()
        };
        Self::from_json(&std::fs::read(path)?)
    }
    pub fn from_value(original: Value) -> Result<Self> {
        let graph = original
            .get("@graph")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                Error::InvalidInput("RO-Crate metadata must contain an @graph array".into())
            })?;
        let mut entities = IndexMap::new();
        for entry in graph {
            let object = entry.as_object().ok_or_else(|| {
                Error::InvalidInput("RO-Crate @graph entries must be objects".into())
            })?;
            let id = object
                .get("@id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .ok_or_else(|| {
                    Error::InvalidInput("RO-Crate entities must have a non-empty @id".into())
                })?;
            if entities.insert(id.to_owned(), object.clone()).is_some() {
                return Err(Error::InvalidInput(format!(
                    "RO-Crate contains a duplicate entity ID: {id}"
                )));
            }
        }
        Ok(Self { original, entities })
    }
    pub fn metadata(&self) -> &Value {
        &self.original
    }
    pub fn entities(&self) -> &IndexMap<String, Map<String, Value>> {
        &self.entities
    }
    pub fn entity(&self, id: &str) -> Option<&Map<String, Value>> {
        self.entities.get(id)
    }
    pub fn types(&self) -> Vec<String> {
        let mut result = Vec::new();
        for entity in self.entities.values() {
            for value in entity_types(entity) {
                if !result.contains(&value) {
                    result.push(value);
                }
            }
        }
        result
    }
    pub fn name(&self, fallback: &str) -> String {
        let described_root = self.entities.values().find_map(|entity| {
            let id = entity.get("@id")?.as_str()?;
            if !id.ends_with("ro-crate-metadata.json") {
                return None;
            }
            let reference = first_string(entity.get("about"))?;
            self.entity(&reference)
        });
        described_root
            .or_else(|| self.entity("./"))
            .or_else(|| self.entity(fallback))
            .or_else(|| self.entity(&format!("{}/", fallback.trim_end_matches('/'))))
            .and_then(|e| first_string(e.get("name")).or_else(|| first_string(e.get("title"))))
            .or_else(|| first_string(self.original.get("name")))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| fallback.to_owned())
    }
    pub fn infer_config(&self) -> Value {
        let mut tables = Map::new();
        for kind in self.types() {
            let mut props = Vec::new();
            for entity in self
                .entities
                .values()
                .filter(|e| entity_types(e).contains(&kind))
            {
                for prop in entity.keys().filter(|p| p.as_str() != "@id") {
                    if !props.contains(prop) {
                        props.push(prop.clone());
                    }
                }
            }
            tables.insert(
                kind,
                json!({"all_props":props,"ignore_props":[],"expand_props":[],"junctions":[]}),
            );
        }
        json!({"tables":{},"potential_tables":tables})
    }
}
pub fn as_list(value: &Value) -> Vec<&Value> {
    match value {
        Value::Null => vec![],
        Value::Array(items) => items.iter().collect(),
        _ => vec![value],
    }
}
pub fn jsonld_value(value: &Value) -> Value {
    match value {
        Value::Array(items) => {
            let result: Vec<_> = items.iter().map(jsonld_value).collect();
            if result.len() == 1 {
                result[0].clone()
            } else {
                Value::Array(result)
            }
        }
        Value::Object(object) => object
            .get("@value")
            .or_else(|| object.get("@id"))
            .cloned()
            .unwrap_or_else(|| value.clone()),
        _ => value.clone(),
    }
}
pub fn first_string(value: Option<&Value>) -> Option<String> {
    let value = jsonld_value(value?);
    match value {
        Value::Null => None,
        Value::Array(values) => values
            .into_iter()
            .find(|v| !v.is_null() && v != "")
            .map(|v| python_string(&v)),
        _ => Some(python_string(&value)),
    }
}
pub fn strings(value: Option<&Value>) -> Vec<String> {
    let normalized = value.map(jsonld_value).unwrap_or(Value::Null);
    as_list(&normalized)
        .iter()
        .map(|v| python_string(v))
        .collect()
}
pub fn entity_types(entity: &Map<String, Value>) -> Vec<String> {
    strings(entity.get("@type"))
}
pub fn reference(value: &Value) -> Option<&str> {
    value
        .as_object()?
        .get("@id")?
        .as_str()
        .filter(|id| !id.is_empty())
}
pub fn python_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Bool(true) => "True".into(),
        Value::Bool(false) => "False".into(),
        Value::Null => "None".into(),
        _ => canonical_json(value, true),
    }
}
pub fn canonical_json(value: &Value, spaces: bool) -> String {
    let comma = if spaces { ", " } else { "," };
    let colon = if spaces { ": " } else { ":" };
    match value {
        Value::Object(object) => {
            let mut keys: Vec<_> = object.keys().collect();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|key| format!(
                        "{}{}{}",
                        Value::String((*key).clone()),
                        colon,
                        canonical_json(&object[*key], spaces)
                    ))
                    .collect::<Vec<_>>()
                    .join(comma)
            )
        }
        Value::Array(items) => format!(
            "[{}]",
            items
                .iter()
                .map(|v| canonical_json(v, spaces))
                .collect::<Vec<_>>()
                .join(comma)
        ),
        _ => value.to_string(),
    }
}
