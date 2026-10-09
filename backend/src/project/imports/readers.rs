use super::*;
use duckdb::arrow::{
    array::{
        ArrayRef, BooleanArray, Date32Array, Float64Array, Int64Array, StringArray,
        TimestampMicrosecondArray,
    },
    datatypes::{DataType, Date32Type, Field, Schema, SchemaRef, TimeUnit},
    record_batch::{RecordBatch, RecordBatchReader},
};
use parquet::{
    arrow::{ArrowWriter, arrow_reader::ParquetRecordBatchReaderBuilder},
    file::properties::WriterProperties,
};
use std::io::BufReader;

pub(super) fn parquet_source(
    name: String,
    path: &Path,
    arrow_schema: Option<SchemaRef>,
) -> PreparedSource {
    PreparedSource {
        name,
        statement: SqlStatement {
            sql: "SELECT * FROM read_parquet(?)".into(),
            parameters: vec![serde_json::json!(path)],
        },
        arrow_schema,
    }
}
fn writer(path: &Path, schema: SchemaRef) -> Result<ArrowWriter<File>> {
    ArrowWriter::try_new(
        File::create(path)?,
        schema,
        Some(
            WriterProperties::builder()
                .set_max_row_group_row_count(Some(4096))
                .build(),
        ),
    )
    .map_err(import_error)
}
fn batches(
    path: &Path,
    reader: impl RecordBatchReader,
    cancellation: &CancellationToken,
) -> Result<SchemaRef> {
    let schema = reader.schema();
    let mut output = writer(path, schema.clone())?;
    for batch in reader {
        check_cancellation(cancellation)?;
        output
            .write(&batch.map_err(arrow_error)?)
            .map_err(import_error)?;
    }
    output.close().map_err(import_error)?;
    Ok(schema)
}
pub(super) fn table(
    file: &InputFile,
    temporary: &Path,
    index: usize,
    cancellation: &CancellationToken,
) -> Result<PreparedSource> {
    let prepare = || -> Result<PreparedSource> {
        let name = stem(&file.relative);
        let output = temporary.join(format!("table-{index}.parquet"));
        match file.format.as_str() {
            "arrow" | "ipc" | "feather" => {
                let input = File::open(&file.path)?;
                let schema = match arrow_ipc::reader::FileReader::try_new(input, None) {
                    Ok(reader) => batches(&output, reader, cancellation)?,
                    Err(_) => batches(
                        &output,
                        arrow_ipc::reader::StreamReader::try_new(File::open(&file.path)?, None)
                            .map_err(arrow_error)?,
                        cancellation,
                    )?,
                };
                Ok(parquet_source(name, &output, Some(schema)))
            }
            "avro" => {
                let reader = arrow_avro::reader::ReaderBuilder::new()
                    .with_batch_size(4096)
                    .build(BufReader::new(File::open(&file.path)?))
                    .map_err(import_error)?;
                let schema = batches(&output, reader, cancellation)?;
                Ok(parquet_source(name, &output, Some(schema)))
            }
            "parquet" => {
                let schema = ParquetRecordBatchReaderBuilder::try_new(File::open(&file.path)?)
                    .map_err(import_error)?
                    .schema()
                    .clone();
                Ok(parquet_source(name, &file.path, Some(schema)))
            }
            _ => Ok(PreparedSource {
                name,
                statement: SqlStatement {
                    sql: match file.format.as_str() {
                        "csv" => "SELECT * FROM read_csv(?)",
                        "tsv" => "SELECT * FROM read_csv(?, delim='\t')",
                        "jsonl" | "ndjson" => {
                            "SELECT * FROM read_json(?, format='newline_delimited')"
                        }
                        _ => "SELECT * FROM read_json(?)",
                    }
                    .into(),
                    parameters: vec![serde_json::json!(file.path)],
                },
                arrow_schema: None,
            }),
        }
    };
    prepare().map_err(|e| Error {
        message: format!("{}: {}", file.relative, e.message),
        ..e
    })
}
pub(super) fn texts(
    files: &[&InputFile],
    path: &Path,
    skipped: &mut Vec<SkippedImportFile>,
    cancellation: &CancellationToken,
) -> Result<usize> {
    let schema = Arc::new(Schema::new(
        ["file_path", "base_name", "extension", "document"]
            .map(|name| Field::new(name, DataType::Utf8, false))
            .to_vec(),
    ));
    let mut output = writer(path, schema.clone())?;
    let mut count = 0;
    for chunk in files.chunks(256) {
        let mut columns: [Vec<String>; 4] = Default::default();
        for file in chunk {
            check_cancellation(cancellation)?;
            let document = match std::fs::read_to_string(&file.path) {
                Ok(document) => document,
                Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
                    skipped.push(SkippedImportFile {
                        path: file.relative.clone(),
                        reason: "Invalid UTF-8 text".into(),
                    });
                    continue;
                }
                Err(e) => return Err(import_error(format!("{}: {e}", file.relative))),
            };
            columns[0].push(file.relative.clone());
            columns[1].push(stem(&file.relative));
            columns[2].push(file.format.clone());
            columns[3].push(document);
            count += 1;
        }
        let arrays = columns
            .into_iter()
            .map(|values| Arc::new(StringArray::from(values)) as ArrayRef)
            .collect();
        output
            .write(&RecordBatch::try_new(schema.clone(), arrays).map_err(arrow_error)?)
            .map_err(import_error)?;
    }
    output.close().map_err(import_error)?;
    Ok(count)
}
fn datetime(value: &calamine::Data) -> Option<i64> {
    use calamine::DataType;
    if matches!(value, calamine::Data::DateTime(v) if v.is_duration()) {
        return None;
    }
    value.as_datetime().map(|v| v.and_utc().timestamp_micros())
}
fn cell_text(value: &calamine::Data) -> String {
    use calamine::DataType;
    if matches!(value, calamine::Data::DateTime(v) if v.is_datetime())
        && let Some(value) = value.as_datetime()
    {
        return value.format("%Y-%m-%d %H:%M:%S%.f").to_string();
    }
    value.to_string()
}
fn kind(value: &calamine::Data) -> Option<DataType> {
    use calamine::Data;
    match value {
        Data::Empty => None,
        Data::Int(_) => Some(DataType::Int64),
        Data::Float(_) => Some(DataType::Float64),
        Data::Bool(_) => Some(DataType::Boolean),
        Data::DateTimeIso(_)
            if {
                use calamine::DataType;
                datetime(value).is_none() && value.as_date().is_some()
            } =>
        {
            Some(DataType::Date32)
        }
        Data::DateTime(_) | Data::DateTimeIso(_) if datetime(value).is_some() => {
            Some(DataType::Timestamp(TimeUnit::Microsecond, None))
        }
        _ => Some(DataType::Utf8),
    }
}
pub(super) fn spreadsheet(
    range: calamine::Range<calamine::Data>,
    path: &Path,
    cancellation: &CancellationToken,
) -> Result<()> {
    use calamine::Data;
    let width = range.width();
    if width == 0 {
        return Err(Error::invalid("The worksheet has no columns"));
    }
    let mut rows = range.rows();
    let header = rows
        .next()
        .ok_or_else(|| Error::invalid("The worksheet has no header"))?;
    let mut names = BTreeSet::new();
    let mut fields = Vec::new();
    for (column, cell) in header.iter().enumerate() {
        check_cancellation(cancellation)?;
        let original = cell_text(cell);
        let original = if original.is_empty() {
            format!("column_{}", column + 1)
        } else {
            original
        };
        let mut name = original.clone();
        let mut suffix = 2;
        while !names.insert(name.to_ascii_lowercase()) {
            name = format!("{original}_{suffix}");
            suffix += 1;
        }
        let inferred = rows
            .clone()
            .filter_map(|row| kind(&row[column]))
            .reduce(|left, right| {
                if left == right {
                    left
                } else if matches!(
                    (&left, &right),
                    (DataType::Int64, DataType::Float64) | (DataType::Float64, DataType::Int64)
                ) {
                    DataType::Float64
                } else {
                    DataType::Utf8
                }
            })
            .unwrap_or(DataType::Utf8);
        fields.push(Field::new(name, inferred, true));
    }
    let schema = Arc::new(Schema::new(fields));
    let mut output = writer(path, schema.clone())?;
    let data = rows.collect::<Vec<_>>();
    for chunk in data.chunks(4096) {
        check_cancellation(cancellation)?;
        let columns = schema
            .fields()
            .iter()
            .enumerate()
            .map(|(column, field)| -> ArrayRef {
                let cells = || chunk.iter().map(|row| &row[column]);
                match field.data_type() {
                    DataType::Date32 => {
                        use calamine::DataType;
                        Arc::new(Date32Array::from_iter(
                            cells().map(|v| v.as_date().map(Date32Type::from_naive_date)),
                        ))
                    }
                    DataType::Int64 => Arc::new(Int64Array::from_iter(
                        cells().map(|v| if let Data::Int(v) = v { Some(*v) } else { None }),
                    )),
                    DataType::Float64 => {
                        Arc::new(Float64Array::from_iter(cells().map(|v| match v {
                            Data::Float(v) => Some(*v),
                            Data::Int(v) => Some(*v as f64),
                            _ => None,
                        })))
                    }
                    DataType::Boolean => Arc::new(BooleanArray::from_iter(cells().map(|v| {
                        if let Data::Bool(v) = v {
                            Some(*v)
                        } else {
                            None
                        }
                    }))),
                    DataType::Timestamp(TimeUnit::Microsecond, _) => {
                        Arc::new(TimestampMicrosecondArray::from_iter(cells().map(datetime)))
                    }
                    _ => Arc::new(StringArray::from_iter(cells().map(|v| {
                        if matches!(v, Data::Empty) {
                            None
                        } else {
                            Some(cell_text(v))
                        }
                    }))),
                }
            })
            .collect();
        output
            .write(&RecordBatch::try_new(schema.clone(), columns).map_err(arrow_error)?)
            .map_err(import_error)?;
    }
    output.close().map_err(import_error)?;
    Ok(())
}
