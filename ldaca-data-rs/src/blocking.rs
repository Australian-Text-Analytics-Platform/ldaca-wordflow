//! Blocking adapter for native callers. Async applications should use the root Client.
use crate::{Client as AsyncClient, ClientOptions, Result};
use std::{future::Future, sync::Arc};
#[derive(Clone)]
pub struct Client {
    pub inner: AsyncClient,
    runtime: Arc<tokio::runtime::Runtime>,
}
impl Client {
    pub fn new(api_key: Option<&str>, options: ClientOptions) -> Result<Self> {
        if tokio::runtime::Handle::try_current().is_ok() {
            return Err(crate::Error::InvalidInput(
                "use the async Client inside a Tokio runtime".into(),
            ));
        }
        Ok(Self {
            inner: AsyncClient::new(api_key, options)?,
            runtime: Arc::new(tokio::runtime::Runtime::new()?),
        })
    }
    pub fn with_api_key(&self, key: Option<&str>) -> Result<Self> {
        Ok(Self {
            inner: self.inner.with_api_key(key)?,
            runtime: self.runtime.clone(),
        })
    }
    pub fn run<T>(&self, future: impl Future<Output = Result<T>>) -> Result<T> {
        if tokio::runtime::Handle::try_current().is_ok() {
            return Err(crate::Error::InvalidInput(
                "use the async Client inside a Tokio runtime".into(),
            ));
        }
        self.runtime.block_on(future)
    }
    pub fn close(&self) {
        self.inner.close();
    }
}
impl Client {
    pub fn configuration(&self) -> Result<serde_json::Value> {
        self.run(self.inner.configuration())
    }
    pub fn version(&self) -> Result<serde_json::Value> {
        self.run(self.inner.version())
    }
    pub fn authenticated(&self) -> Result<serde_json::Value> {
        self.run(self.inner.authenticated())
    }
    pub fn get_object(&self, id: &str) -> Result<Option<serde_json::Value>> {
        self.run(self.inner.get_object(id))
    }
    pub fn browse(&self, options: &crate::client::BrowseOptions) -> Result<serde_json::Value> {
        self.run(self.inner.browse(options))
    }
    pub fn get_crate(&self, id: &str, resolved: bool, rewrite_ids: bool) -> Result<crate::RoCrate> {
        self.run(self.inner.get_crate(id, resolved, rewrite_ids))
    }
    pub fn search(
        &self,
        method: &str,
        query: &str,
        limit: u64,
        offset: u64,
    ) -> Result<crate::SearchPage> {
        self.run(self.inner.search(method, query, limit, offset))
    }
    pub fn search_raw(&self, index: &str, body: &serde_json::Value) -> Result<crate::SearchPage> {
        self.run(self.inner.search_raw(index, body))
    }
    pub fn search_field(&self, index: &str, field: &str, value: &str) -> Result<serde_json::Value> {
        self.run(self.inner.search_field(index, field, value))
    }
    pub fn download_file(
        &self,
        id: &str,
        path: &str,
        destination: &std::path::Path,
        max_bytes: u64,
    ) -> Result<u64> {
        self.run(self.inner.download_file(id, path, destination, max_bytes))
    }
    pub fn download_texts(
        &self,
        id: &str,
        paths: &[String],
        max_total_bytes: u64,
    ) -> Result<indexmap::IndexMap<String, String>> {
        self.run(self.inner.download_texts(id, paths, max_total_bytes))
    }
}
