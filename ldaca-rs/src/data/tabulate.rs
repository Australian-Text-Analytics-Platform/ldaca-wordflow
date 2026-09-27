//! Deterministic selected-entity tabulation with explicit relationship tables.
use crate::data::{
    metadata::{as_list, canonical_json, entity_types, first_string, jsonld_value, reference},
    table::Row,
    Error, Result, RoCrate, Table, TableSet,
};
use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct TableConfig {
    #[serde(default)]
    pub all_props: Vec<String>,
    #[serde(default)]
    pub ignore_props: Vec<String>,
    #[serde(default)]
    pub expand_props: Vec<String>,
    #[serde(default)]
    pub junctions: Vec<String>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Config {
    #[serde(default)]
    pub tables: IndexMap<String, TableConfig>,
    #[serde(default)]
    pub potential_tables: IndexMap<String, TableConfig>,
}
impl Config {
    pub fn from_value(value: Value) -> Result<Self> {
        if value
            .get("export_queries")
            .is_some_and(|v| v.as_object().is_none_or(|m| !m.is_empty()))
        {
            return Err(Error::InvalidInput(
                "SQL export_queries are not supported".into(),
            ));
        }
        serde_json::from_value(value)
            .map_err(|e| Error::InvalidInput(format!("invalid table configuration: {e}")))
    }
}
impl RoCrate {
    pub fn to_tables(&self, config: &Config) -> Result<TableSet> {
        convert(self, config, false)
    }
    pub fn select_tables(&self, types: &[String]) -> Result<TableSet> {
        let mut config = Config::default();
        for kind in types {
            if config
                .tables
                .insert(kind.clone(), TableConfig::default())
                .is_some()
            {
                return Err(Error::InvalidInput("duplicate selected entity type".into()));
            }
        }
        self.to_tables(&config)
    }
}
pub(crate) fn convert(krate: &RoCrate, config: &Config, compatibility: bool) -> Result<TableSet> {
    if config.tables.is_empty() {
        return Err(Error::InvalidInput(
            "RO-Crate tabular configuration has no tables".into(),
        ));
    }
    let mut output = TableSet::default();
    for (kind, table_config) in &config.tables {
        let entities: Vec<_> = krate
            .entities()
            .values()
            .filter(|e| entity_types(e).contains(kind))
            .collect();
        if compatibility && entities.is_empty() {
            return Err(Error::Conversion(format!(
                "RO-Crate contains no {kind} metadata"
            )));
        }
        let mut builder = Builder {
            krate,
            config: table_config,
            compatibility,
            origins: HashMap::new(),
            companions: IndexMap::new(),
            wide: IndexSet::new(),
        };
        for entity in &entities {
            let mut expanded_counts: HashMap<String, (usize, usize)> = HashMap::new();
            for (name, value) in entity.iter() {
                if name == "@id" {
                    continue;
                }
                let values = as_list(value);
                if values.iter().filter(|v| reference(v).is_some()).count() > 10
                    || (!compatibility && values.len() > 11)
                {
                    builder.wide.insert(name.clone());
                }
                if !compatibility && table_config.expand_props.contains(name) {
                    // Expanded properties can be wide too: decide once for the entire table.
                    for value in values {
                        if let Some(target) = reference(value).and_then(|id| krate.entity(id)) {
                            for (prop, raw) in target {
                                let values = as_list(raw);
                                let count =
                                    expanded_counts.entry(format!("{name}_{prop}")).or_default();
                                count.0 += values.len();
                                count.1 += values.iter().filter(|v| reference(v).is_some()).count();
                            }
                        }
                    }
                }
            }
            for (property, (values, references)) in expanded_counts {
                if values > 11 || references > 10 {
                    builder.wide.insert(property);
                }
            }
        }
        let mut rows = Vec::new();
        for entity in entities {
            let mut row = Row::new();
            let id = entity
                .get("@id")
                .and_then(Value::as_str)
                .ok_or_else(|| Error::InvalidInput("missing entity ID".into()))?;
            builder.put(&mut row, "entity_id", Value::String(id.into()), "@id")?;
            for (name, value) in entity {
                if name == "@id" {
                    continue;
                }
                let junction = table_config.junctions.contains(name) || builder.wide.contains(name);
                if compatibility && junction {
                    continue;
                }
                if !compatibility && table_config.ignore_props.contains(name) {
                    continue;
                }
                if !compatibility && junction {
                    builder.append(&mut row, id, name, value, name)?;
                } else if table_config.expand_props.contains(name) {
                    for value in as_list(value) {
                        if let Some(target) =
                            reference(value).and_then(|target_id| krate.entity(target_id))
                        {
                            for (target_name, target_value) in target {
                                let expanded = format!("{name}_{target_name}");
                                if target_name == "@id"
                                    || table_config.ignore_props.contains(&expanded)
                                {
                                    continue;
                                }
                                builder.append(
                                    &mut row,
                                    id,
                                    &expanded,
                                    target_value,
                                    &format!("{name}/{target_name}"),
                                )?;
                            }
                        }
                    }
                } else if !table_config.ignore_props.contains(name) {
                    builder.append(&mut row, id, name, value, name)?;
                }
            }
            rows.push(row);
        }
        let mut metadata = HashMap::from([
            ("ldaca.table_kind".into(), "entity".into()),
            ("ldaca.entity_type".into(), kind.clone()),
        ]);
        metadata.insert(
            "ldaca.column_origins".into(),
            serde_json::to_string(&builder.origins)?,
        );
        output.insert(Table::from_rows(kind, &rows, metadata)?)?;
        for (prop, rows) in builder.companions {
            output.insert(Table::from_rows_with_columns(
                &format!("{kind}_{prop}"),
                &rows,
                HashMap::from([
                    ("ldaca.table_kind".into(), "relationship_or_value".into()),
                    ("ldaca.entity_type".into(), kind.clone()),
                    ("ldaca.property".into(), prop),
                ]),
                &["source_id", "ordinal", "target_id", "value"],
            )?)?;
        }
    }
    Ok(output)
}
struct Builder<'a> {
    krate: &'a RoCrate,
    config: &'a TableConfig,
    compatibility: bool,
    origins: HashMap<String, String>,
    companions: IndexMap<String, Vec<Row>>,
    wide: IndexSet<String>,
}
impl Builder<'_> {
    fn put(&mut self, row: &mut Row, name: &str, value: Value, origin: &str) -> Result<()> {
        if !self.compatibility
            && self
                .origins
                .get(name)
                .is_some_and(|existing| existing != origin)
        {
            return Err(Error::Conversion(format!(
                "generated column collision: {name}"
            )));
        }
        let mut column = name.to_owned();
        let mut suffix = 0;
        while row.contains_key(&column) {
            suffix += 1;
            column = format!("{name}_{suffix}");
        }
        if suffix > 10 {
            return Err(Error::Conversion(format!(
                "RO-Crate property has too many values: {name}"
            )));
        }
        if !self.compatibility {
            if self
                .origins
                .get(&column)
                .is_some_and(|existing| existing != origin)
            {
                return Err(Error::Conversion(format!(
                    "generated column collision: {column}"
                )));
            }
            self.origins.insert(column.clone(), origin.into());
        }
        row.insert(column, value);
        Ok(())
    }
    fn append(
        &mut self,
        row: &mut Row,
        id: &str,
        name: &str,
        raw: &Value,
        origin: &str,
    ) -> Result<()> {
        let junction = !self.compatibility
            && (self.wide.contains(name) || self.config.junctions.iter().any(|item| item == name));
        for value in as_list(raw) {
            let target_id = if self.compatibility || value.as_object().is_some_and(|o| o.len() == 1)
            {
                reference(value)
            } else {
                None
            };
            let target_name = target_id
                .and_then(|target| self.krate.entity(target))
                .and_then(|target| first_string(target.get("name")))
                .unwrap_or_default();
            if junction {
                let rows = self.companions.entry(name.into()).or_default();
                let offset = rows
                    .last()
                    .filter(|r| r.get("source_id").and_then(Value::as_str) == Some(id))
                    .and_then(|r| r.get("ordinal"))
                    .and_then(Value::as_u64)
                    .map_or(0, |n| n + 1);
                rows.push(Row::from([
                    ("source_id".into(), Value::String(id.into())),
                    ("ordinal".into(), Value::from(offset)),
                    (
                        "target_id".into(),
                        target_id
                            .map(|s| Value::String(s.into()))
                            .unwrap_or(Value::Null),
                    ),
                    (
                        "value".into(),
                        if target_id.is_some() {
                            Value::String(target_name)
                        } else {
                            scalar(value, self.compatibility)
                        },
                    ),
                ]));
            } else if let Some(target_id) = target_id {
                self.put(row, name, Value::String(target_name), origin)?;
                self.put(
                    row,
                    &format!("{name}_id"),
                    Value::String(target_id.into()),
                    &format!("{origin}/@id"),
                )?;
            } else {
                self.put(row, name, scalar(value, self.compatibility), origin)?;
            }
        }
        Ok(())
    }
}
pub(crate) fn scalar(value: &Value, compatibility: bool) -> Value {
    let normalized = if compatibility {
        jsonld_value(value)
    } else if let Some(object) = value
        .as_object()
        .filter(|o| o.len() == 1 && o.contains_key("@value"))
    {
        object["@value"].clone()
    } else {
        value.clone()
    };
    match normalized {
        Value::Array(_) | Value::Object(_) => {
            Value::String(canonical_json(&normalized, compatibility))
        }
        other => other,
    }
}
