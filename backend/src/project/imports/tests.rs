use super::*;
use duckdb::arrow::{
    array::{Int64Array, StringArray, StructArray, TimestampNanosecondArray},
    datatypes::{DataType, Field, Schema, TimeUnit},
    record_batch::RecordBatch,
};
use std::io::Write;
fn directory() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let path = std::fs::canonicalize(temp.path()).unwrap();
    (temp, path)
}
fn request(paths: Vec<PathBuf>) -> FileImportRequest {
    FileImportRequest {
        paths,
        root: None,
        selected: None,
    }
}
fn import(project: &mut Project, input: &FileImportRequest) -> Result<FileImportResult> {
    let mut plan = Plan::collect(input, &std::env::temp_dir(), &project.database.cancellation)?;
    let sources = plan.prepare(input.selected.as_deref(), &project.database.cancellation)?;
    Ok(FileImportResult {
        table_names: project.database.import_sources(sources)?,
        skipped: plan.inspection.skipped,
    })
}
fn zip(path: &Path, entries: &[(&str, &[u8])]) {
    let mut output = zip::ZipWriter::new(File::create(path).unwrap());
    for (name, bytes) in entries {
        output
            .start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        output.write_all(bytes).unwrap();
    }
    output.finish().unwrap();
}
#[test]
fn native_temporary_paths_work_without_following_selected_links() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("table.csv");
    std::fs::write(&file, "id\n1\n").unwrap();
    let mut project = Project::untitled().unwrap();
    assert_eq!(
        import(&mut project, &request(vec![file.clone()]))
            .unwrap()
            .table_names,
        ["table"]
    );
    #[cfg(unix)]
    {
        let link = temp.path().join("link.csv");
        std::os::unix::fs::symlink(file, &link).unwrap();
        assert!(
            import(&mut project, &request(vec![link]))
                .unwrap_err()
                .message
                .contains("Links")
        );
    }
}
#[test]
fn mixed_folders_are_deduplicated_ordered_and_report_skipped_files() {
    let (_temp, root) = directory();
    std::fs::create_dir(root.join("nested")).unwrap();
    std::fs::create_dir(root.join(".hidden")).unwrap();
    for (name, bytes) in [
        ("z.txt", b"whole\nfile".as_slice()),
        ("nested/a.MD", "猫😀".as_bytes()),
        ("bad.log", &[0xff]),
        (".hidden/secret.txt", b"hidden"),
        ("table.csv", b"id,text\n1,one\n2,two"),
        ("readme.pdf", b"unsupported"),
        ("nested.zip", b"not opened"),
    ] {
        std::fs::write(root.join(name), bytes).unwrap();
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(root.join("z.txt"), root.join("link.txt")).unwrap();
    }
    let mut project = Project::untitled().unwrap();
    let result = import(
        &mut project,
        &request(vec![root.clone(), root.join("nested"), root.join("z.txt")]),
    )
    .unwrap();
    assert_eq!(result.table_names.len(), 2);
    assert_eq!(result.skipped.len(), 3);
    assert!(
        result
            .skipped
            .iter()
            .any(|s| s.path == "bad.log" && s.reason.contains("UTF-8"))
    );
    let name = root.file_name().unwrap().to_str().unwrap();
    let rows = project
        .database
        .conn
        .prepare(&format!(
            "SELECT file_path,base_name,extension,document FROM data.{}",
            query::quote(name)
        ))
        .unwrap()
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .unwrap()
        .collect::<duckdb::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(
        rows,
        vec![
            ("nested/a.MD".into(), "a".into(), "md".into(), "猫😀".into()),
            (
                "z.txt".into(),
                "z".into(),
                "txt".into(),
                "whole\nfile".into()
            )
        ]
    );
}
#[test]
fn zip_import_has_the_same_mixed_rules_and_rejects_escaping_paths() {
    let (_temp, root) = directory();
    zip(
        &root.join("corpus.zip"),
        &[
            ("b.txt", b"b"),
            ("a/x.txt", b"a"),
            ("__MACOSX/x.txt", b"skip"),
            (".hidden/x.txt", b"skip"),
            ("nested.zip", b"skip"),
            ("data.tsv", b"id\tword\n1\tcat"),
        ],
    );
    let mut project = Project::untitled().unwrap();
    let result = import(&mut project, &request(vec![root.join("corpus.zip")])).unwrap();
    assert_eq!(result.table_names, ["data", "corpus"]);
    assert_eq!(result.skipped.len(), 1);
    let paths: String = project
        .database
        .conn
        .query_row("SELECT string_agg(file_path,',') FROM corpus", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(paths, "a/x.txt,b.txt");
    zip(&root.join("escape.zip"), &[("../escape.txt", b"bad")]);
    assert!(
        import(&mut project, &request(vec![root.join("escape.zip")]))
            .unwrap_err()
            .message
            .contains("outside")
    );
}
#[test]
fn every_table_reader_imports_and_a_bad_later_table_rolls_everything_back() {
    let (_temp, root) = directory();
    let mut project = Project::untitled().unwrap();
    for extension in ["csv", "tsv", "json", "jsonl", "ndjson"] {
        let bytes = match extension {
            "csv" => "id,text\n1,cat\n2,dog",
            "tsv" => "id\ttext\n1\tcat\n2\tdog",
            "json" => r#"[{"id":1,"text":"cat"},{"id":2,"text":"dog"}]"#,
            _ => "{\"id\":1,\"text\":\"cat\"}\n{\"id\":2,\"text\":\"dog\"}",
        };
        let path = root.join(format!("input_{extension}.{extension}"));
        std::fs::write(&path, bytes).unwrap();
        let result = import(&mut project, &request(vec![path])).unwrap();
        let count: u64 = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT count(*) FROM {}",
                    query::quote(&result.table_names[0])
                ),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2, "{extension}");
    }
    let avro_schema = apache_avro::Schema::parse_str(r#"{"type":"record","name":"record","fields":[{"name":"id","type":"long"},{"name":"text","type":"string"}]}"#).unwrap();
    let mut avro = apache_avro::Writer::new(
        &avro_schema,
        File::create(root.join("records.avro")).unwrap(),
    );
    for (id, text) in [(1_i64, "cat"), (2, "dog")] {
        avro.append(apache_avro::types::Value::Record(vec![
            ("id".into(), apache_avro::types::Value::Long(id)),
            (
                "text".into(),
                apache_avro::types::Value::String(text.into()),
            ),
        ]))
        .unwrap();
    }
    avro.flush().unwrap();
    drop(avro);
    let result = import(&mut project, &request(vec![root.join("records.avro")])).unwrap();
    assert_eq!(result.table_names, ["records"]);
    let count: u64 = project
        .database
        .conn
        .query_row("SELECT count(*) FROM records", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 2);
    std::fs::write(root.join("a.csv"), "id\n1").unwrap();
    std::fs::write(root.join("z.json"), "not json").unwrap();
    let before: u64 = project
        .database
        .conn
        .query_row("SELECT count(*) FROM wordflow.nodes", [], |r| r.get(0))
        .unwrap();
    assert!(
        import(
            &mut project,
            &request(vec![root.join("a.csv"), root.join("z.json")])
        )
        .is_err()
    );
    let after: u64 = project
        .database
        .conn
        .query_row("SELECT count(*) FROM wordflow.nodes", [], |r| r.get(0))
        .unwrap();
    assert_eq!(before, after);
    assert!(project.database.conn.prepare("SELECT * FROM a").is_err());
}
#[test]
fn ipc_file_stream_feather_and_parquet_preserve_precision_and_nested_metadata() {
    let (_temp, root) = directory();
    let nested = Arc::new(Field::new("word", DataType::Utf8, false).with_metadata(
        std::collections::HashMap::from([
            ("ARROW:extension:name".into(), "wordflow.text".into()),
            ("ARROW:extension:metadata".into(), "payload".into()),
        ]),
    ));
    let schema = Arc::new(Schema::new(vec![
        Field::new("exact", DataType::Int64, false),
        Field::new(
            "stamp",
            DataType::Timestamp(TimeUnit::Nanosecond, None),
            false,
        ),
        Field::new(
            "nested",
            DataType::Struct(vec![nested.clone()].into()),
            false,
        ),
    ]));
    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![
            Arc::new(Int64Array::from(vec![9_007_199_254_740_993_i64])),
            Arc::new(TimestampNanosecondArray::from(vec![
                1_700_000_000_123_456_789,
            ])),
            Arc::new(StructArray::new(
                vec![nested].into(),
                vec![Arc::new(StringArray::from(vec!["猫"]))],
                None,
            )),
        ],
    )
    .unwrap();
    let mut project = Project::untitled().unwrap();
    for extension in ["arrow", "ipc", "feather", "parquet"] {
        let path = root.join(format!("typed_{extension}.{extension}"));
        if extension == "parquet" {
            let mut w = parquet::arrow::ArrowWriter::try_new(
                File::create(&path).unwrap(),
                schema.clone(),
                None,
            )
            .unwrap();
            w.write(&batch).unwrap();
            w.close().unwrap();
        } else if extension == "ipc" {
            let mut w =
                arrow_ipc::writer::StreamWriter::try_new(File::create(&path).unwrap(), &schema)
                    .unwrap();
            w.write(&batch).unwrap();
            w.finish().unwrap();
        } else {
            let mut w =
                arrow_ipc::writer::FileWriter::try_new(File::create(&path).unwrap(), &schema)
                    .unwrap();
            w.write(&batch).unwrap();
            w.finish().unwrap();
        }
        let result = import(&mut project, &request(vec![path])).unwrap();
        let name = &result.table_names[0];
        let (exact, stamp, word): (String, String, String) = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT exact::VARCHAR,stamp::VARCHAR,nested.word FROM {}",
                    query::quote(name)
                ),
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(exact, "9007199254740993");
        assert_eq!(stamp, "2023-11-14 22:13:20.123456789");
        assert_eq!(word, "猫");
        let annotations = arrow_metadata::Annotations::load(
            &project.database.conn,
            &Relation {
                schema: "data".into(),
                name: name.clone(),
            },
        )
        .unwrap();
        assert_eq!(annotations.0.len(), 1);
        assert_eq!(annotations.0[0].path, ["nested", "word"]);
        assert_eq!(annotations.0[0].payload.as_deref(), Some("payload"));
    }
}
#[test]
fn workbook_defaults_to_all_sheets_and_selection_is_atomic() {
    let (_temp, root) = directory();
    let mut book = rust_xlsxwriter::Workbook::new();
    for name in ["First", "第二"] {
        let sheet = book.add_worksheet();
        sheet.set_name(name).unwrap();
        sheet.write_string(0, 0, "id").unwrap();
        sheet.write_string(0, 1, "text").unwrap();
        sheet.write_number(1, 0, 1).unwrap();
        sheet.write_string(1, 1, "cat").unwrap();
    }
    let path = root.join("book.xlsx");
    book.save(&path).unwrap();
    let input = request(vec![path.clone()]);
    let plan = Plan::collect(&input, &root, &CancellationToken::new()).unwrap();
    assert_eq!(plan.inspection.files[0].sheets, ["First", "第二"]);
    let mut project = Project::untitled().unwrap();
    assert_eq!(
        import(&mut project, &input).unwrap().table_names,
        ["book_First", "book_第二"]
    );
    let input = FileImportRequest {
        selected: Some(vec![FileImportSelection {
            path: "book.xlsx".into(),
            sheet: Some("第二".into()),
        }]),
        ..input
    };
    assert_eq!(
        import(&mut project, &input).unwrap().table_names,
        ["book_第二_2"]
    );
    let invalid = FileImportRequest {
        selected: Some(vec![FileImportSelection {
            path: "book.xlsx".into(),
            sheet: Some("missing".into()),
        }]),
        ..input
    };
    assert!(import(&mut project, &invalid).is_err());
    // XLSM uses the same OpenXML reader, including workbooks without a VBA project.
    std::fs::copy(path, root.join("macro.xlsm")).unwrap();
    assert_eq!(
        import(&mut project, &request(vec![root.join("macro.xlsm")]))
            .unwrap()
            .table_names,
        ["macro_First", "macro_第二"]
    );
}
#[test]
fn unsupported_and_invalid_utf8_only_selections_fail_and_cancel_leaves_no_outputs() {
    let (_temp, root) = directory();
    std::fs::write(root.join("bad.txt"), [0xff]).unwrap();
    let mut project = Project::untitled().unwrap();
    assert!(import(&mut project, &request(vec![root.clone()])).is_err());
    std::fs::write(root.join("valid.csv"), "id\n1").unwrap();
    project.database.cancellation.cancel();
    assert!(import(&mut project, &request(vec![root])).is_err());
    assert_eq!(
        project
            .database
            .conn
            .query_row("SELECT count(*) FROM wordflow.nodes", [], |r| r
                .get::<_, u64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn zip_traversal_is_bounded_without_a_byte_cap() {
    let (_temp, root) = directory();
    let path = root.join("many.zip");
    let mut zip = zip::ZipWriter::new(File::create(&path).unwrap());
    for i in 0..=MAX_FILES {
        zip.start_file(
            format!("{i}.unsupported"),
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
    }
    zip.finish().unwrap();
    let error = Plan::collect(&request(vec![path]), &root, &CancellationToken::new())
        .err()
        .unwrap();
    assert!(error.message.contains("100,000"));
}

#[test]
fn legacy_excel_binary_excel_and_open_document_import_native_date_values() {
    let mut project = Project::untitled().unwrap();
    for extension in ["xls", "xlsb", "ods"] {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/spreadsheets")
            .join(format!("date.{extension}"));
        let result = import(&mut project, &request(vec![path])).unwrap();
        assert!(!result.table_names.is_empty(), "{extension}");
        let count: u64 = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT count(*) FROM {}",
                    query::quote(&result.table_names[0])
                ),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, if extension == "ods" { 3 } else { 2 }, "{extension}");
        let columns = mutations::columns(
            &project.database.conn,
            &Relation {
                schema: "data".into(),
                name: result.table_names[0].clone(),
            },
        )
        .unwrap();
        let first: String = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT {}::VARCHAR FROM {} LIMIT 1",
                    query::quote(&columns[0].0),
                    query::quote(&result.table_names[0])
                ),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            first,
            if extension == "ods" {
                "2021-01-01T10:10:10"
            } else {
                "2021-01-02 00:00:00"
            }
        );
    }
}

#[test]
fn list_element_extensions_survive_the_native_child_field_name() {
    use duckdb::arrow::{
        array::{Array, ListArray},
        buffer::{OffsetBuffer, ScalarBuffer},
    };
    let (_temp, root) = directory();
    let element = Arc::new(
        Field::new("custom_element", DataType::Utf8, false).with_metadata(
            std::collections::HashMap::from([(
                "ARROW:extension:name".into(),
                "wordflow.text".into(),
            )]),
        ),
    );
    let list = ListArray::new(
        element.clone(),
        OffsetBuffer::new(ScalarBuffer::from(vec![0_i32, 1])),
        Arc::new(StringArray::from(vec!["word"])),
        None,
    );
    let schema = Arc::new(Schema::new(vec![Field::new(
        "words",
        list.data_type().clone(),
        true,
    )]));
    let batch = RecordBatch::try_new(schema.clone(), vec![Arc::new(list)]).unwrap();
    let path = root.join("nested.arrow");
    let mut writer =
        arrow_ipc::writer::FileWriter::try_new(File::create(&path).unwrap(), &schema).unwrap();
    writer.write(&batch).unwrap();
    writer.finish().unwrap();
    drop(writer);
    let mut project = Project::untitled().unwrap();
    import(&mut project, &request(vec![path])).unwrap();
    let annotations = arrow_metadata::Annotations::load(
        &project.database.conn,
        &Relation {
            schema: "data".into(),
            name: "nested".into(),
        },
    )
    .unwrap();
    let raw = project
        .database
        .conn
        .prepare("SELECT * FROM nested LIMIT 0")
        .unwrap()
        .query_arrow([])
        .unwrap()
        .get_schema();
    let schema = annotations.enrich(&raw, 1).unwrap();
    let DataType::List(element) = schema.field(0).data_type() else {
        panic!("list")
    };
    assert_eq!(
        element
            .metadata()
            .get("ARROW:extension:name")
            .map(String::as_str),
        Some("wordflow.text"),
        "{schema:?}"
    );
}
