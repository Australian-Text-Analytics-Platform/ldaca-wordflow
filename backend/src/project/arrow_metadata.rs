//! Qualified Arrow extension annotations, independently owned by each relation.
use super::*;
use duckdb::arrow::{
    array::{ArrayData, make_array},
    datatypes::{DataType, Field, Schema, SchemaRef},
    record_batch::RecordBatch,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Annotation {
    pub path: Vec<String>,
    pub extension: String,
    pub payload: Option<String>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct Annotations(pub Vec<Annotation>);

pub(super) fn field_path(path: &[String]) -> Result<String> {
    if path.is_empty() {
        return Err(Error::invalid(
            "Arrow field paths must be non-empty arrays of strings",
        ));
    }
    Ok(serde_json::to_string(path)?)
}
impl Annotations {
    pub(super) fn load(conn: &Connection, relation: &Relation) -> Result<Self> {
        let rows = conn.prepare("SELECT field_path,extension_name,extension_metadata FROM wordflow.arrow_metadata WHERE schema_name=? AND relation_name=? ORDER BY field_path")?
            .query_map(params![relation.schema,relation.name],|r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
        let mut annotations = Vec::new();
        for (path, extension, payload) in rows {
            let path: Vec<String> = serde_json::from_str(&path)?;
            field_path(&path)?;
            annotations.push(Annotation {
                path,
                extension,
                payload,
            });
        }
        Ok(Self(annotations))
    }
    pub(super) fn store(&self, conn: &Connection, relation: &Relation) -> Result<()> {
        for annotation in &self.0 {
            conn.execute("INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES (?,?,?,?,?)",params![relation.schema,relation.name,field_path(&annotation.path)?,annotation.extension,annotation.payload])?;
        }
        Ok(())
    }
    pub(super) fn prefixed(&self, prefix: &str) -> Self {
        Self(
            self.0
                .iter()
                .cloned()
                .map(|mut a| {
                    a.path.insert(0, prefix.into());
                    a
                })
                .collect(),
        )
    }
    pub(super) fn source_columns(&self, columns: &[String]) -> Self {
        Self(
            self.0
                .iter()
                .filter_map(|a| {
                    if a.path.len() < 2 || a.path[0] != "source" || !columns.contains(&a.path[1]) {
                        return None;
                    }
                    let mut a = a.clone();
                    a.path.remove(0);
                    Some(a)
                })
                .collect(),
        )
    }
    pub(super) fn enrich(&self, schema: &Schema, column_count: usize) -> Result<Schema> {
        let fields = schema
            .fields()
            .iter()
            .enumerate()
            .map(|(i, f)| {
                if i < column_count {
                    self.enrich_field(f, &[])
                } else {
                    f.as_ref().clone()
                }
            })
            .collect::<Vec<_>>();
        Ok(Schema::new_with_metadata(fields, schema.metadata().clone()))
    }
    fn enrich_field(&self, field: &Field, parent: &[String]) -> Field {
        let mut path = parent.to_vec();
        path.push(field.name().clone());
        let child = |f: &Field| Arc::new(self.enrich_field(f, &path));
        let kind = match field.data_type() {
            DataType::Struct(fields) => DataType::Struct(fields.iter().map(|f| child(f)).collect()),
            DataType::List(f) => DataType::List(child(f)),
            DataType::LargeList(f) => DataType::LargeList(child(f)),
            DataType::FixedSizeList(f, n) => DataType::FixedSizeList(child(f), *n),
            DataType::Map(f, sorted) => DataType::Map(child(f), *sorted),
            other => other.clone(),
        };
        let mut field = field.clone().with_data_type(kind);
        if let Some(a) = self.0.iter().find(|a| a.path == path) {
            let mut metadata = field.metadata().clone();
            metadata.insert("ARROW:extension:name".into(), a.extension.clone());
            metadata.remove("ARROW:extension:metadata");
            if let Some(payload) = &a.payload {
                metadata.insert("ARROW:extension:metadata".into(), payload.clone());
            }
            field = field.with_metadata(metadata);
        }
        field
    }
}
pub(super) fn delete_relation(conn: &Connection, relation: &Relation) -> Result<()> {
    conn.execute(
        "DELETE FROM wordflow.arrow_metadata WHERE schema_name=? AND relation_name=?",
        params![relation.schema, relation.name],
    )?;
    Ok(())
}
pub(super) fn rename_relation(conn: &Connection, before: &Relation, after: &str) -> Result<()> {
    conn.execute("UPDATE wordflow.arrow_metadata SET relation_name=? WHERE schema_name=? AND relation_name=?",params![after,before.schema,before.name])?;
    Ok(())
}
pub(super) fn rename_column(
    conn: &Connection,
    relation: &Relation,
    before: &str,
    after: Option<&str>,
) -> Result<()> {
    let annotations = Annotations::load(conn, relation)?;
    for mut a in annotations.0.into_iter().filter(|a| a.path[0] == before) {
        conn.execute("DELETE FROM wordflow.arrow_metadata WHERE schema_name=? AND relation_name=? AND field_path=?",params![relation.schema,relation.name,field_path(&a.path)?])?;
        if let Some(after) = after {
            a.path[0] = after.into();
            Annotations(vec![a]).store(conn, relation)?;
        }
    }
    Ok(())
}
/// Nested Arrow field metadata is part of the array type as well as the batch schema.
/// Rebuild the type descriptors only; buffers remain shared.
pub(super) fn enrich_batch(batch: RecordBatch, schema: SchemaRef) -> Result<RecordBatch> {
    fn retype(data: ArrayData, kind: &DataType) -> Result<ArrayData> {
        let children: Vec<_> = match kind {
            DataType::Struct(fields) => fields.iter().map(|f| f.data_type()).collect(),
            DataType::List(f)
            | DataType::LargeList(f)
            | DataType::FixedSizeList(f, _)
            | DataType::Map(f, _) => vec![f.data_type()],
            _ => Vec::new(),
        };
        let child_data = if children.is_empty() {
            data.child_data().to_vec()
        } else {
            data.child_data()
                .iter()
                .zip(children)
                .map(|(data, kind)| retype(data.clone(), kind))
                .collect::<Result<Vec<_>>>()?
        };
        data.into_builder()
            .data_type(kind.clone())
            .child_data(child_data)
            .build()
            .map_err(arrow_error)
    }
    let columns = batch
        .columns()
        .iter()
        .zip(schema.fields())
        .map(|(a, f)| Ok(make_array(retype(a.to_data(), f.data_type())?)))
        .collect::<Result<Vec<_>>>()?;
    RecordBatch::try_new(schema, columns).map_err(arrow_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use duckdb::arrow::{
        array::{Array, StringArray, StructArray},
        datatypes::Fields,
    };
    #[test]
    fn recursive_annotations_preserve_paths_payloads_and_shared_buffers() {
        let (extension, payload) = ("custom.text", Some("not JSON, \"quoted\"".to_string()));
        let annotations = Annotations(vec![
            Annotation {
                path: vec!["source".into(), "text".into()],
                extension: extension.into(),
                payload: payload.clone(),
            },
            Annotation {
                path: vec!["source.text".into()],
                extension: "custom.literal".into(),
                payload: Some(String::new()),
            },
        ]);
        let fields = Fields::from(vec![Field::new("text", DataType::Utf8, true)]);
        let values = Arc::new(StringArray::from(vec![Some("😀cat"), None]));
        let source = Arc::new(StructArray::new(fields.clone(), vec![values.clone()], None));
        let schema = Schema::new(vec![
            Field::new("source", DataType::Struct(fields), false),
            Field::new("source.text", DataType::Utf8, true),
        ]);
        let batch = RecordBatch::try_new(Arc::new(schema.clone()), vec![source, values]).unwrap();
        let enriched = Arc::new(annotations.enrich(&schema, 2).unwrap());
        let batch = enrich_batch(batch, enriched.clone()).unwrap();
        let DataType::Struct(fields) = enriched.field(0).data_type() else {
            panic!("struct")
        };
        assert_eq!(fields[0].metadata()["ARROW:extension:name"], extension);
        assert_eq!(
            fields[0].metadata()["ARROW:extension:metadata"],
            payload.unwrap()
        );
        assert_eq!(enriched.field(1).metadata()["ARROW:extension:metadata"], "");
        let source = batch
            .column(0)
            .as_any()
            .downcast_ref::<StructArray>()
            .unwrap();
        assert_eq!(
            source
                .column(0)
                .as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
                .value(0),
            "😀cat"
        );
        assert!(source.column(0).is_null(1));
        assert!(field_path(&[]).is_err());
        assert_ne!(
            field_path(&["source".into(), "text".into()]).unwrap(),
            field_path(&["source.text".into()]).unwrap()
        );
    }
    #[test]
    fn qualified_copies_are_independent_and_nested_renames_do_not_touch_literal_dots() {
        let project = Project::untitled().unwrap();
        let conn = &project.database.conn;
        let relation = Relation {
            schema: "strange schema".into(),
            name: "A \"name\"".into(),
        };
        let snapshot = Relation {
            schema: "wordflow".into(),
            name: "private".into(),
        };
        let annotations = Annotations(vec![
            Annotation {
                path: vec!["source".into(), "text".into()],
                extension: "custom.nested".into(),
                payload: None,
            },
            Annotation {
                path: vec!["source.text".into()],
                extension: "custom.literal".into(),
                payload: Some("".into()),
            },
        ]);
        annotations.store(conn, &relation).unwrap();
        Annotations::load(conn, &relation)
            .unwrap()
            .store(conn, &snapshot)
            .unwrap();
        rename_column(conn, &relation, "source", Some("renamed")).unwrap();
        let renamed = Annotations::load(conn, &relation).unwrap();
        assert!(renamed.0.iter().any(|a| a.path == ["renamed", "text"]));
        assert!(renamed.0.iter().any(|a| a.path == ["source.text"]));
        delete_relation(conn, &relation).unwrap();
        assert_eq!(Annotations::load(conn, &snapshot).unwrap().0.len(), 2);
        assert!(Annotations::load(conn, &relation).unwrap().0.is_empty());
        conn.execute("INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name) VALUES ('bad','bad','[1]','bad')",[]).unwrap();
        assert!(
            Annotations::load(
                conn,
                &Relation {
                    schema: "bad".into(),
                    name: "bad".into()
                }
            )
            .is_err()
        );
    }
}
