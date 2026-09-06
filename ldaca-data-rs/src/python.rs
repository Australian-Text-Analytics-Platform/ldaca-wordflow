//! Thin Python adapters; all protocol and conversion behavior remains native.
use crate::{
    client::{build_search_body, BrowseOptions},
    metadata::jsonld_value,
    profiles,
    tabulate::Config,
    Client, ClientOptions, Error, Result, RoCrate, Table, TableSet,
};
use arrow_array::{ArrayRef, StructArray};
use arrow_schema::{DataType, Field};
use futures_util::TryStreamExt;
use pyo3::{
    exceptions::PyException,
    prelude::*,
    types::{PyBytes, PyCapsule, PyModule},
};
use pyo3_arrow::ffi::{to_schema_pycapsule, to_stream_pycapsule, ArrayIterator};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc, time::Duration};

pyo3::create_exception!(ldaca_data_rs, DataError, PyException);
pyo3::create_exception!(ldaca_data_rs, InvalidInputError, DataError);
pyo3::create_exception!(ldaca_data_rs, InvalidResponseError, DataError);
pyo3::create_exception!(ldaca_data_rs, HttpError, DataError);
pyo3::create_exception!(ldaca_data_rs, TimeoutError, DataError);
pyo3::create_exception!(ldaca_data_rs, SizeLimitError, DataError);
pyo3::create_exception!(ldaca_data_rs, ConversionError, DataError);
pyo3::create_exception!(ldaca_data_rs, IoError, DataError);
pyo3::create_exception!(ldaca_data_rs, CancelledError, DataError);
impl From<Error> for PyErr {
    fn from(error: Error) -> Self {
        let message = error.to_string();
        match error {
            Error::InvalidInput(_) => InvalidInputError::new_err(message),
            Error::InvalidResponse(_) => InvalidResponseError::new_err(message),
            Error::Http(_) | Error::Transport => HttpError::new_err(message),
            Error::Timeout => TimeoutError::new_err(message),
            Error::Limit(_) => SizeLimitError::new_err(message),
            Error::Cancelled => CancelledError::new_err(message),
            Error::Io(_) => IoError::new_err(message),
            _ => ConversionError::new_err(message),
        }
    }
}
#[pyclass(name = "Table", frozen, skip_from_py_object)]
#[derive(Clone)]
struct PyTable {
    inner: Table,
}
#[pymethods]
impl PyTable {
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }
    #[getter]
    fn num_rows(&self) -> usize {
        self.inner.num_rows()
    }
    fn schema_json(&self) -> String {
        self.inner.schema_json().to_string()
    }
    fn write(&self, py: Python<'_>, path: PathBuf, format: &str) -> PyResult<()> {
        py.detach(|| self.inner.write(&path, format))
            .map_err(Into::into)
    }
    fn write_parquet(&self, py: Python<'_>, path: PathBuf) -> PyResult<()> {
        self.write(py, path, "parquet")
    }
    fn write_csv(&self, py: Python<'_>, path: PathBuf) -> PyResult<()> {
        self.write(py, path, "csv")
    }
    fn write_ipc(&self, py: Python<'_>, path: PathBuf) -> PyResult<()> {
        self.write(py, path, "ipc")
    }
    fn __arrow_c_schema__<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyCapsule>> {
        let field = Arc::new(
            Field::new(
                "",
                DataType::Struct(self.inner.schema.fields().clone()),
                false,
            )
            .with_metadata(self.inner.schema.metadata().clone()),
        );
        Ok(to_schema_pycapsule(py, &field)?)
    }
    #[pyo3(signature=(requested_schema=None))]
    fn __arrow_c_stream__<'py>(
        &self,
        py: Python<'py>,
        requested_schema: Option<Bound<'py, PyCapsule>>,
    ) -> PyResult<Bound<'py, PyCapsule>> {
        let field = Arc::new(
            Field::new(
                "",
                DataType::Struct(self.inner.schema.fields().clone()),
                false,
            )
            .with_metadata(self.inner.schema.metadata().clone()),
        );
        let arrays = self
            .inner
            .batches
            .clone()
            .into_iter()
            .map(|batch| Ok(Arc::new(StructArray::from(batch)) as ArrayRef));
        Ok(to_stream_pycapsule(
            py,
            Box::new(ArrayIterator::new(arrays, field)),
            requested_schema,
        )?)
    }
}
#[pyclass(name = "TableSet", frozen)]
struct PyTableSet {
    inner: TableSet,
}
#[pymethods]
impl PyTableSet {
    fn keys(&self) -> Vec<String> {
        self.inner.tables.keys().cloned().collect()
    }
    fn __len__(&self) -> usize {
        self.inner.tables.len()
    }
    fn __getitem__(&self, name: &str) -> PyResult<PyTable> {
        self.inner
            .tables
            .get(name)
            .cloned()
            .map(|inner| PyTable { inner })
            .ok_or_else(|| pyo3::exceptions::PyKeyError::new_err(name.to_owned()))
    }
    #[pyo3(signature=(path,format="parquet"))]
    fn write_dir(&self, py: Python<'_>, path: PathBuf, format: &str) -> PyResult<()> {
        py.detach(|| self.inner.write_dir(&path, format))
            .map_err(Into::into)
    }
}
#[pyclass(name = "_RoCrate", frozen, skip_from_py_object)]
#[derive(Clone)]
struct PyRoCrate {
    inner: RoCrate,
}
#[pymethods]
impl PyRoCrate {
    #[new]
    fn new(py: Python<'_>, source: &[u8]) -> PyResult<Self> {
        Ok(Self {
            inner: py.detach(|| RoCrate::from_json(source))?,
        })
    }
    #[staticmethod]
    fn from_path(py: Python<'_>, path: PathBuf) -> PyResult<Self> {
        Ok(Self {
            inner: py.detach(|| RoCrate::from_path(&path))?,
        })
    }
    fn metadata_json(&self) -> String {
        self.inner.metadata().to_string()
    }
    fn types(&self) -> Vec<String> {
        self.inner.types()
    }
    fn entity_json(&self, id: &str) -> Option<String> {
        self.inner
            .entity(id)
            .map(|e| Value::Object(e.clone()).to_string())
    }
    fn name(&self, fallback: &str) -> String {
        self.inner.name(fallback)
    }
    fn infer_config_json(&self) -> String {
        self.inner.infer_config().to_string()
    }
    #[pyo3(signature=(types=None,config=None))]
    fn to_tables(
        &self,
        py: Python<'_>,
        types: Option<Vec<String>>,
        config: Option<String>,
    ) -> PyResult<PyTableSet> {
        let inner = py.detach(|| match (types, config) {
            (Some(types), None) => self.inner.select_tables(&types),
            (None, Some(config)) => self
                .inner
                .to_tables(&Config::from_value(serde_json::from_str(&config)?)?),
            _ => Err(Error::InvalidInput("supply either types or config".into())),
        })?;
        Ok(PyTableSet { inner })
    }
    #[pyo3(signature=(identifier,config=None))]
    fn wordflow_table(
        &self,
        py: Python<'_>,
        identifier: &str,
        config: Option<String>,
    ) -> PyResult<PyTable> {
        let config = config
            .map(|s| Config::from_value(serde_json::from_str(&s)?))
            .transpose()?;
        Ok(PyTable {
            inner: py.detach(|| profiles::wordflow_metadata(&self.inner, identifier, config))?,
        })
    }
    fn documents_json(&self) -> PyResult<String> {
        Ok(serde_json::to_string(&profiles::select_documents(&self.inner)).map_err(Error::from)?)
    }
}
#[pyclass(name = "_ByteStream")]
struct PyByteStream {
    inner: Arc<tokio::sync::Mutex<Option<crate::client::ByteStream>>>,
}
#[pymethods]
impl PyByteStream {
    fn next_chunk<'py>(&self, py: Python<'py>) -> PyResult<Option<Bound<'py, PyBytes>>> {
        let inner = self.inner.clone();
        let bytes =
            py.detach(|| pyo3_async_runtimes::tokio::get_runtime().block_on(next_chunk(inner)))?;
        Ok(bytes.map(|bytes| PyBytes::new(py, &bytes)))
    }
    fn next_chunk_async<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyAny>> {
        let inner = self.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let bytes = next_chunk(inner).await?;
            Python::attach(|py| Ok(bytes.map(|bytes| PyBytes::new(py, &bytes).unbind())))
        })
    }
    fn close(&self, py: Python<'_>) {
        let inner = self.inner.clone();
        py.detach(|| {
            pyo3_async_runtimes::tokio::get_runtime().block_on(async move {
                inner.lock().await.take();
            })
        });
    }
}
async fn next_chunk(
    inner: Arc<tokio::sync::Mutex<Option<crate::client::ByteStream>>>,
) -> Result<Option<Vec<u8>>> {
    let mut lock = inner.lock().await;
    let Some(stream) = lock.as_mut() else {
        return Ok(None);
    };
    match stream.try_next().await {
        Ok(Some(bytes)) => Ok(Some(bytes)),
        result => {
            lock.take();
            result
        }
    }
}
#[pyclass(name = "_Client")]
struct PyClient {
    inner: Option<Client>,
}
impl PyClient {
    fn client(&self) -> PyResult<Client> {
        self.inner
            .clone()
            .ok_or_else(|| InvalidInputError::new_err("client is closed"))
    }
}
#[pymethods]
impl PyClient {
    #[new]
    #[pyo3(signature=(api_key=None,base_url="https://data.ldaca.edu.au/api",timeout=30.0,max_json_bytes=8388608,max_document_bytes=16777216,concurrency=8,max_documents=10000))]
    #[allow(clippy::too_many_arguments)]
    fn new(
        api_key: Option<&str>,
        base_url: &str,
        timeout: f64,
        max_json_bytes: u64,
        max_document_bytes: u64,
        concurrency: usize,
        max_documents: usize,
    ) -> PyResult<Self> {
        let timeout = Duration::try_from_secs_f64(timeout)
            .map_err(|_| InvalidInputError::new_err("invalid timeout"))?;
        Ok(Self {
            inner: Some(Client::new(
                api_key,
                ClientOptions {
                    base_url: base_url.into(),
                    timeout,
                    max_json_bytes,
                    max_document_bytes,
                    concurrency,
                    max_documents,
                },
            )?),
        })
    }
    fn with_api_key(&self, key: Option<&str>) -> PyResult<Self> {
        Ok(Self {
            inner: Some(self.client()?.with_api_key(key)?),
        })
    }
    fn close(&mut self) {
        if let Some(client) = self.inner.take() {
            client.close();
        }
    }
    fn __repr__(&self) -> &str {
        "<ldaca_data_rs.Client>"
    }
    fn call(&self, py: Python<'_>, operation: &str, args: &str) -> PyResult<String> {
        let client = self.client()?;
        let args: Value = serde_json::from_str(args).map_err(Error::from)?;
        let result = py.detach(|| {
            pyo3_async_runtimes::tokio::get_runtime().block_on(dispatch(
                client,
                operation.to_owned(),
                args,
            ))
        })?;
        Ok(result.to_string())
    }
    fn call_async<'py>(
        &self,
        py: Python<'py>,
        operation: String,
        args: &str,
    ) -> PyResult<Bound<'py, PyAny>> {
        let client = self.client()?;
        let args: Value = serde_json::from_str(args).map_err(Error::from)?;
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            Ok(dispatch(client, operation, args).await?.to_string())
        })
    }
    fn open_stream(
        &self,
        py: Python<'_>,
        identifier: &str,
        path: &str,
        max_bytes: u64,
    ) -> PyResult<PyByteStream> {
        let client = self.client()?;
        let stream = py.detach(|| {
            pyo3_async_runtimes::tokio::get_runtime()
                .block_on(client.stream_file(identifier, path, max_bytes))
        })?;
        Ok(PyByteStream {
            inner: Arc::new(tokio::sync::Mutex::new(Some(stream))),
        })
    }
    fn open_stream_async<'py>(
        &self,
        py: Python<'py>,
        identifier: String,
        path: String,
        max_bytes: u64,
    ) -> PyResult<Bound<'py, PyAny>> {
        let client = self.client()?;
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            let stream = client.stream_file(&identifier, &path, max_bytes).await?;
            Ok(PyByteStream {
                inner: Arc::new(tokio::sync::Mutex::new(Some(stream))),
            })
        })
    }
    fn document_table(
        &self,
        py: Python<'_>,
        identifier: &str,
        paths: Vec<String>,
        max_total_bytes: u64,
    ) -> PyResult<PyTable> {
        let client = self.client()?;
        Ok(PyTable {
            inner: py.detach(|| {
                pyo3_async_runtimes::tokio::get_runtime().block_on(client.document_table(
                    identifier,
                    &paths,
                    max_total_bytes,
                ))
            })?,
        })
    }
    fn document_table_async<'py>(
        &self,
        py: Python<'py>,
        identifier: String,
        paths: Vec<String>,
        max_total_bytes: u64,
    ) -> PyResult<Bound<'py, PyAny>> {
        let client = self.client()?;
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            Ok(PyTable {
                inner: client
                    .document_table(&identifier, &paths, max_total_bytes)
                    .await?,
            })
        })
    }
    fn wordflow_table(
        &self,
        py: Python<'_>,
        identifier: &str,
        krate: PyRef<'_, PyRoCrate>,
        max_total_bytes: u64,
    ) -> PyResult<PyTable> {
        let client = self.client()?;
        let krate = krate.inner.clone();
        Ok(PyTable {
            inner: py.detach(|| {
                pyo3_async_runtimes::tokio::get_runtime().block_on(client.wordflow_table(
                    identifier,
                    &krate,
                    max_total_bytes,
                ))
            })?,
        })
    }
    fn wordflow_table_async<'py>(
        &self,
        py: Python<'py>,
        identifier: String,
        krate: PyRef<'_, PyRoCrate>,
        max_total_bytes: u64,
    ) -> PyResult<Bound<'py, PyAny>> {
        let client = self.client()?;
        let krate = krate.inner.clone();
        pyo3_async_runtimes::tokio::future_into_py(py, async move {
            Ok(PyTable {
                inner: client
                    .wordflow_table(&identifier, &krate, max_total_bytes)
                    .await?,
            })
        })
    }
}
fn str_arg<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| Error::InvalidInput(format!("missing string argument {key}")))
}
fn num_arg(args: &Value, key: &str, default: u64) -> u64 {
    args.get(key).and_then(Value::as_u64).unwrap_or(default)
}
async fn dispatch(client: Client, operation: String, args: Value) -> Result<Value> {
    match operation.as_str() {
        "configuration" => client.configuration().await,
        "version" => client.version().await,
        "authenticated" => client.authenticated().await,
        "object" => Ok(client
            .get_object(str_arg(&args, "identifier")?)
            .await?
            .unwrap_or(Value::Null)),
        "metadata" => {
            client
                .get_metadata(
                    str_arg(&args, "identifier")?,
                    args["resolved"].as_bool().unwrap_or(false),
                    args["rewrite_ids"].as_bool().unwrap_or(false),
                )
                .await
        }
        "search" => Ok(serde_json::to_value(
            client
                .search(
                    args["method"].as_str().unwrap_or("keyword"),
                    args["query"].as_str().unwrap_or(""),
                    num_arg(&args, "limit", 25),
                    num_arg(&args, "offset", 0),
                )
                .await?,
        )?),
        "search_raw" => Ok(serde_json::to_value(
            client
                .search_raw(args["index"].as_str().unwrap_or("items"), &args["body"])
                .await?,
        )?),
        "field" => {
            client
                .search_field(
                    args["index"].as_str().unwrap_or("items"),
                    str_arg(&args, "field")?,
                    str_arg(&args, "value")?,
                )
                .await
        }
        "featured" => {
            let ids: Vec<String> = serde_json::from_value(args["identifiers"].clone())?;
            Ok(Value::Array(client.featured_collections(&ids).await?))
        }
        "browse" => {
            client
                .browse(&BrowseOptions {
                    member_of: serde_json::from_value(args["member_of"].clone())?,
                    conforms_to: args["conforms_to"].as_str().map(str::to_owned),
                    limit: Some(num_arg(&args, "limit", 25)),
                    offset: num_arg(&args, "offset", 0),
                })
                .await
        }
        "download" => Ok(Value::from(
            client
                .download_file(
                    str_arg(&args, "identifier")?,
                    str_arg(&args, "path")?,
                    &PathBuf::from(str_arg(&args, "destination")?),
                    num_arg(&args, "max_bytes", 0),
                )
                .await?,
        )),
        "texts" => {
            let paths: Vec<String> = serde_json::from_value(args["paths"].clone())?;
            Ok(serde_json::to_value(
                client
                    .download_texts(
                        str_arg(&args, "identifier")?,
                        &paths,
                        num_arg(&args, "max_total_bytes", 0),
                    )
                    .await?,
            )?)
        }
        _ => Err(Error::InvalidInput("unknown operation".into())),
    }
}
#[pyfunction]
fn extract_identifier(value: &str) -> Option<String> {
    profiles::extract_identifier(value)
}
#[pyfunction]
fn normalize_jsonld(value: &str) -> PyResult<String> {
    Ok(jsonld_value(&serde_json::from_str::<Value>(value).map_err(Error::from)?).to_string())
}
#[pyfunction]
fn search_body(method: &str, query: &str, limit: u64, offset: u64) -> PyResult<String> {
    Ok(build_search_body(method, query, limit, offset)?.to_string())
}
#[pyfunction]
fn wordflow_config(identifier: &str) -> PyResult<String> {
    Ok(serde_json::to_string(&profiles::load_wordflow_config(identifier)?).map_err(Error::from)?)
}
#[pymodule]
fn _internal(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<PyClient>()?;
    module.add_class::<PyByteStream>()?;
    module.add_class::<PyRoCrate>()?;
    module.add_class::<PyTable>()?;
    module.add_class::<PyTableSet>()?;
    module.add_function(wrap_pyfunction!(extract_identifier, module)?)?;
    module.add_function(wrap_pyfunction!(normalize_jsonld, module)?)?;
    module.add_function(wrap_pyfunction!(search_body, module)?)?;
    module.add_function(wrap_pyfunction!(wordflow_config, module)?)?;
    let py = module.py();
    module.add("DataError", py.get_type::<DataError>())?;
    module.add("InvalidInputError", py.get_type::<InvalidInputError>())?;
    module.add(
        "InvalidResponseError",
        py.get_type::<InvalidResponseError>(),
    )?;
    module.add("HttpError", py.get_type::<HttpError>())?;
    module.add("TimeoutError", py.get_type::<TimeoutError>())?;
    module.add("SizeLimitError", py.get_type::<SizeLimitError>())?;
    module.add("ConversionError", py.get_type::<ConversionError>())?;
    module.add("IoError", py.get_type::<IoError>())?;
    module.add("CancelledError", py.get_type::<CancelledError>())?;
    module.add("__version__", "0.1.0")?;
    Ok(())
}
