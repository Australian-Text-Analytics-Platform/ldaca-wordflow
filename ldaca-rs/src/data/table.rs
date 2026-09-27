//! Arrow tables and atomic, DataFrame-free file export.
use crate::data::{metadata::canonical_json, Error, Result};
use arrow_array::{
    ArrayRef, BooleanArray, Float64Array, Int64Array, NullArray, RecordBatch, StringArray,
};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use indexmap::IndexMap;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs::File, path::Path, sync::Arc};
/// Supported atomic table export formats.
#[derive(Clone, Copy, Debug)]
pub enum ExportFormat {
    Parquet,
    Ipc,
    Csv,
}
impl ExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Parquet => "parquet",
            Self::Ipc => "ipc",
            Self::Csv => "csv",
        }
    }
}
pub type Row = IndexMap<String, Value>;

#[derive(Clone, Debug)]
pub struct Table {
    pub name: String,
    pub schema: SchemaRef,
    pub batches: Vec<RecordBatch>,
}
#[derive(Clone, Debug, Default)]
pub struct TableSet {
    pub tables: IndexMap<String, Table>,
}
impl Table {
    pub fn from_rows(name: &str, rows: &[Row], metadata: HashMap<String, String>) -> Result<Self> {
        Self::from_rows_with_columns(name, rows, metadata, &["entity_id"])
    }
    pub fn from_rows_with_columns(
        name: &str,
        rows: &[Row],
        metadata: HashMap<String, String>,
        initial: &[&str],
    ) -> Result<Self> {
        let mut columns: Vec<String> = initial.iter().map(|s| (*s).into()).collect();
        for row in rows {
            for key in row.keys() {
                if !columns.contains(key) {
                    columns.push(key.clone());
                }
            }
        }
        let origins: HashMap<String, String> = metadata
            .get("ldaca.column_origins")
            .map(|s| serde_json::from_str(s))
            .transpose()?
            .unwrap_or_default();
        let mut fields = Vec::new();
        let mut arrays: Vec<ArrayRef> = Vec::new();
        for column in &columns {
            let values: Vec<_> = rows
                .iter()
                .map(|r| r.get(column).unwrap_or(&Value::Null))
                .collect();
            let nonnull: Vec<_> = values.iter().filter(|v| !v.is_null()).copied().collect();
            let array: ArrayRef = if nonnull.is_empty() {
                if column == "entity_id" || column == "source_id" {
                    Arc::new(StringArray::from(vec![None::<&str>; rows.len()]))
                } else {
                    Arc::new(NullArray::new(rows.len()))
                }
            } else if nonnull.iter().all(|v| v.is_boolean()) {
                Arc::new(BooleanArray::from(
                    values.iter().map(|v| v.as_bool()).collect::<Vec<_>>(),
                ))
            } else if nonnull.iter().all(|v| v.as_i64().is_some()) {
                Arc::new(Int64Array::from(
                    values.iter().map(|v| v.as_i64()).collect::<Vec<_>>(),
                ))
            } else if nonnull.iter().all(|v| lossless_float(v)) {
                Arc::new(Float64Array::from(
                    values.iter().map(|v| v.as_f64()).collect::<Vec<_>>(),
                ))
            } else {
                Arc::new(StringArray::from(
                    values
                        .iter()
                        .map(|v| match v {
                            Value::Null => None,
                            Value::String(s) => Some(s.clone()),
                            _ => Some(canonical_json(v, false)),
                        })
                        .collect::<Vec<_>>(),
                ))
            };
            let field =
                Field::new(column, array.data_type().clone(), true).with_metadata(HashMap::from([
                    (
                        "ldaca.source_property".into(),
                        origins.get(column).unwrap_or(column).clone(),
                    ),
                ]));
            fields.push(field);
            arrays.push(array);
        }
        let schema = Arc::new(Schema::new_with_metadata(fields, metadata));
        let batch = RecordBatch::try_new(schema.clone(), arrays)?;
        let batches = if rows.is_empty() {
            vec![batch]
        } else {
            (0..rows.len())
                .step_by(4096)
                .map(|start| batch.slice(start, (rows.len() - start).min(4096)))
                .collect()
        };
        Ok(Self {
            name: name.into(),
            schema,
            batches,
        })
    }
    pub fn num_rows(&self) -> usize {
        self.batches.iter().map(RecordBatch::num_rows).sum()
    }
    pub fn write(&self, path: &Path, format: ExportFormat) -> Result<()> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        match format {
            ExportFormat::Parquet => {
                let mut writer = parquet::arrow::ArrowWriter::try_new(
                    temporary.as_file_mut(),
                    self.schema.clone(),
                    None,
                )?;
                for batch in &self.batches {
                    writer.write(batch)?;
                }
                writer.close()?;
            }
            ExportFormat::Ipc => {
                let mut writer =
                    arrow_ipc::writer::FileWriter::try_new(temporary.as_file_mut(), &self.schema)?;
                for batch in &self.batches {
                    writer.write(batch)?;
                }
                writer.finish()?;
            }
            ExportFormat::Csv => {
                let mut writer = arrow_csv::Writer::new(temporary.as_file_mut());
                for batch in &self.batches {
                    writer.write(batch)?;
                }
            }
        }
        temporary.as_file().sync_all()?;
        temporary
            .persist_noclobber(path)
            .map_err(|e| Error::Io(e.error))?;
        Ok(())
    }
    pub fn schema_json(&self) -> Value {
        Value::Object(
            self.schema
                .fields()
                .iter()
                .map(|field| {
                    (
                        field.name().clone(),
                        Value::String(match field.data_type() {
                            DataType::Utf8 => "String".into(),
                            DataType::Int64 => "Int64".into(),
                            DataType::Float64 => "Float64".into(),
                            DataType::Boolean => "Boolean".into(),
                            DataType::Null => "Null".into(),
                            other => format!("{other:?}"),
                        }),
                    )
                })
                .collect(),
        )
    }
}
fn lossless_float(value: &Value) -> bool {
    if !value.is_number() {
        return false;
    }
    let Some(float) = value.as_f64().filter(|f| f.is_finite()) else {
        return false;
    };
    if let Some(integer) = value.as_i64() {
        return float as i128 == integer as i128;
    }
    if let Some(integer) = value.as_u64() {
        return float as i128 == integer as i128;
    }
    value.as_number().is_some_and(|n| n.is_f64())
}
impl TableSet {
    pub fn insert(&mut self, table: Table) -> Result<()> {
        if self.tables.contains_key(&table.name) {
            return Err(Error::Conversion(format!(
                "table name collision: {}",
                table.name
            )));
        }
        self.tables.insert(table.name.clone(), table);
        Ok(())
    }
    pub fn write_dir(&self, path: &Path, format: ExportFormat) -> Result<()> {
        if path.exists() {
            return Err(Error::InvalidInput(
                "export directory already exists".into(),
            ));
        }
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let temp = tempfile::tempdir_in(parent)?;
        let mut manifest = Vec::new();
        for table in self.tables.values() {
            let stem: String = table
                .name
                .chars()
                .map(|c| {
                    if c.is_ascii_alphanumeric() || c == '-' {
                        c
                    } else {
                        '_'
                    }
                })
                .take(100)
                .collect();
            let digest = format!("{:x}", Sha256::digest(table.name.as_bytes()));
            let filename = format!("table-{stem}-{}.{}", &digest[..16], format.extension());
            table.write(&temp.path().join(&filename), format)?;
            manifest.push(json!({"name":table.name,"file":filename,"metadata":table.schema.metadata(),"schema":table.schema_json()}));
        }
        serde_json::to_writer_pretty(File::create(temp.path().join("manifest.json"))?, &manifest)?;
        std::fs::rename(temp.path(), path)?;
        Ok(())
    }
}
