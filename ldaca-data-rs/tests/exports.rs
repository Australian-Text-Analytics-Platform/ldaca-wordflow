#![allow(clippy::unwrap_used)]
use arrow_array::RecordBatch;
use ldaca_data_rs::{RoCrate, TableSet};
use serde_json::{json, Value};
use std::{collections::HashSet, fs::File, path::Path};

fn tables() -> TableSet {
    let refs: Vec<_> = (0..12).map(|n| json!({"@id":format!("p{n}")})).collect();
    RoCrate::from_value(json!({"@graph":[
        {"@id":"w","@type":"Work/name","name":"Café, \"quote\"\nnext","authors":refs},
        {"@id":"v","@type":"Work:name","name":"東京"}
    ]}))
    .unwrap()
    .select_tables(&["Work/name".into(), "Work:name".into()])
    .unwrap()
}

fn read(path: &Path, format: &str, schema: arrow_schema::SchemaRef) -> Vec<RecordBatch> {
    let file = File::open(path).unwrap();
    match format {
        "parquet" => {
            let builder =
                parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder::try_new(file)
                    .unwrap();
            // Parquet exposes file-level metadata on the builder, while its array
            // reader constructs batches without that metadata. Check both layers.
            assert_eq!(builder.schema(), &schema);
            builder
                .build()
                .unwrap()
                .map(|batch| batch.unwrap().with_schema(schema.clone()).unwrap())
                .collect()
        }
        "ipc" => arrow_ipc::reader::FileReader::try_new(file, None)
            .unwrap()
            .map(Result::unwrap)
            .collect(),
        "csv" => arrow_csv::ReaderBuilder::new(schema)
            .with_header(true)
            .build(file)
            .unwrap()
            .map(Result::unwrap)
            .collect(),
        _ => unreachable!(),
    }
}

fn roundtrip(format: &str) {
    let tables = tables();
    let table = &tables.tables["Work/name"];
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(format!("data.{format}"));
    table.write(&path, format).unwrap();
    assert_eq!(read(&path, format, table.schema.clone()), table.batches);
    let original = std::fs::read(&path).unwrap();
    assert!(table.write(&path, format).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[test]
fn parquet_roundtrip_preserves_values_schema_and_existing_file() {
    roundtrip("parquet");
}
#[test]
fn ipc_roundtrip_preserves_values_schema_and_existing_file() {
    roundtrip("ipc");
}
#[test]
fn csv_roundtrip_preserves_quotes_unicode_and_existing_file() {
    roundtrip("csv");
}

#[test]
fn directory_manifest_resolves_colliding_type_names_and_relationships() {
    let tables = tables();
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("export");
    tables.write_dir(&destination, "parquet").unwrap();
    let manifest_bytes = std::fs::read(destination.join("manifest.json")).unwrap();
    let manifest: Vec<Value> = serde_json::from_slice(&manifest_bytes).unwrap();
    assert_eq!(manifest.len(), tables.tables.len());
    let mut files = HashSet::new();
    for entry in &manifest {
        let name = entry["name"].as_str().unwrap();
        let file = entry["file"].as_str().unwrap();
        assert_eq!(Path::new(file).components().count(), 1);
        assert!(files.insert(file));
        let expected = &tables.tables[name];
        assert_eq!(entry["metadata"], json!(expected.schema.metadata()));
        assert_eq!(entry["schema"], expected.schema_json());
        assert_eq!(
            read(&destination.join(file), "parquet", expected.schema.clone()),
            expected.batches
        );
    }
    assert!(tables.write_dir(&destination, "parquet").is_err());
    assert_eq!(
        std::fs::read(destination.join("manifest.json")).unwrap(),
        manifest_bytes
    );
}
