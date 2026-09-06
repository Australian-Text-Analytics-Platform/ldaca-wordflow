//! Credential-bound, bounded ONI data access over a reusable connection pool.
use crate::{
    metadata::{first_string, strings},
    profiles::{document_table, extract_identifier, select_documents, wordflow_metadata},
    Error, Result, RoCrate, Table,
};
use futures_util::{stream, Stream, StreamExt, TryStreamExt};
use indexmap::IndexMap;
use reqwest::{
    header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE, LOCATION},
    Method, Response,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::Path,
    pin::Pin,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio_util::sync::CancellationToken;
use url::Url;

#[derive(Clone, Debug)]
pub struct ClientOptions {
    pub base_url: String,
    pub timeout: Duration,
    pub max_json_bytes: u64,
    pub max_document_bytes: u64,
    pub concurrency: usize,
    pub max_documents: usize,
}
impl Default for ClientOptions {
    fn default() -> Self {
        Self {
            base_url: "https://data.ldaca.edu.au/api".into(),
            timeout: Duration::from_secs(30),
            max_json_bytes: 8 * 1024 * 1024,
            max_document_bytes: 16 * 1024 * 1024,
            concurrency: 8,
            max_documents: 10_000,
        }
    }
}
#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    base: Url,
    auth: Option<HeaderValue>,
    pub options: ClientOptions,
    cancellation: CancellationToken,
}
impl std::fmt::Debug for Client {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Client")
            .field("authenticated", &self.auth.is_some())
            .finish_non_exhaustive()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchPage {
    pub items: Vec<Value>,
    pub total: u64,
    pub offset: u64,
    pub limit: u64,
    pub raw: Value,
}
#[derive(Clone, Debug, Default)]
pub struct BrowseOptions {
    pub member_of: Vec<String>,
    pub conforms_to: Option<String>,
    pub offset: u64,
    pub limit: Option<u64>,
}
pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>>> + Send>>;
impl Client {
    pub fn new(api_key: Option<&str>, options: ClientOptions) -> Result<Self> {
        let mut base = Url::parse(&options.base_url)
            .map_err(|_| Error::InvalidInput("invalid ONI base URL".into()))?;
        if !matches!(base.scheme(), "http" | "https")
            || base.host_str().is_none()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
        {
            return Err(Error::InvalidInput(
                "base URL must be HTTP(S) without credentials, query or fragment".into(),
            ));
        }
        base.set_path(&format!("{}/", base.path().trim_end_matches('/')));
        if options.timeout.is_zero()
            || options.concurrency == 0
            || options.max_documents == 0
            || options.max_json_bytes == 0
            || options.max_document_bytes == 0
        {
            return Err(Error::InvalidInput("client limits must be positive".into()));
        }
        let http = reqwest::Client::builder()
            .timeout(options.timeout)
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .build()?;
        let client = Self {
            http,
            base,
            auth: None,
            options,
            cancellation: CancellationToken::new(),
        };
        client.with_api_key(api_key)
    }
    pub fn with_api_key(&self, api_key: Option<&str>) -> Result<Self> {
        let auth = api_key
            .map(|key| {
                if key.is_empty() {
                    return Err(Error::InvalidInput("API key must not be empty".into()));
                }
                let mut value = HeaderValue::from_str(&format!("Bearer {key}"))
                    .map_err(|_| Error::InvalidInput("invalid API key".into()))?;
                value.set_sensitive(true);
                Ok(value)
            })
            .transpose()?;
        Ok(Self {
            http: self.http.clone(),
            base: self.base.clone(),
            options: self.options.clone(),
            auth,
            cancellation: CancellationToken::new(),
        })
    }
    pub fn close(&self) {
        self.cancellation.cancel();
    }
    fn url(&self, segments: &[&str], query: &[(String, String)]) -> Result<Url> {
        let mut url = self.base.clone();
        {
            let mut path = url
                .path_segments_mut()
                .map_err(|_| Error::InvalidInput("invalid base URL".into()))?;
            path.pop_if_empty();
            for segment in segments {
                path.push(segment);
            }
        }
        url.query_pairs_mut()
            .extend_pairs(query.iter().map(|(k, v)| (k, v)));
        Ok(url)
    }
    async fn request(
        &self,
        method: Method,
        segments: &[&str],
        query: &[(String, String)],
        body: Option<&Value>,
    ) -> Result<Response> {
        let mut url = self.url(segments, query)?;
        let mut method = method;
        let mut include_body = true;
        for _ in 0..=10 {
            let mut builder = self.http.request(method.clone(), url.clone());
            if url.origin() == self.base.origin() {
                if let Some(auth) = &self.auth {
                    builder = builder.header(AUTHORIZATION, auth.clone());
                }
            }
            if include_body {
                if let Some(body) = body {
                    builder = builder.json(body);
                }
            }
            let response = tokio::select! { _=self.cancellation.cancelled()=>return Err(Error::Cancelled), result=builder.send()=>result? };
            let status = response.status();
            if matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308) {
                let location = response
                    .headers()
                    .get(LOCATION)
                    .and_then(|h| h.to_str().ok())
                    .ok_or_else(|| Error::InvalidResponse("redirect without Location".into()))?;
                let next = url
                    .join(location)
                    .map_err(|_| Error::InvalidResponse("invalid redirect".into()))?;
                if !matches!(next.scheme(), "http" | "https")
                    || !next.username().is_empty()
                    || next.password().is_some()
                    || (self.auth.is_some() && url.scheme() == "https" && next.scheme() != "https")
                {
                    return Err(Error::InvalidResponse("unsafe redirect".into()));
                }
                if status.as_u16() == 303
                    || (matches!(status.as_u16(), 301 | 302) && method == Method::POST)
                {
                    method = Method::GET;
                    include_body = false;
                }
                url = next;
                continue;
            }
            if !status.is_success() {
                return Err(Error::Http(status.as_u16()));
            }
            return Ok(response);
        }
        Err(Error::InvalidResponse("too many redirects".into()))
    }
    fn check_length(response: &Response, limit: u64) -> Result<()> {
        if response.content_length().is_some_and(|size| size > limit) {
            return Err(Error::Limit("declared response size".into()));
        }
        Ok(())
    }
    fn stream_response(&self, response: Response, limit: u64) -> Result<ByteStream> {
        Self::check_length(&response, limit)?;
        let cancellation = self.cancellation.clone();
        let bytes = response.bytes_stream();
        Ok(Box::pin(stream::try_unfold(
            (Box::pin(bytes), 0u64, cancellation),
            move |(mut bytes, total, cancel)| async move {
                let next = tokio::select! {_=cancel.cancelled()=>return Err(Error::Cancelled),next=bytes.next()=>next};
                match next {
                    Some(chunk) => {
                        let chunk = chunk?;
                        let total = total
                            .checked_add(chunk.len() as u64)
                            .filter(|n| *n <= limit)
                            .ok_or_else(|| Error::Limit("received response size".into()))?;
                        Ok(Some((chunk.to_vec(), (bytes, total, cancel))))
                    }
                    None => Ok(None),
                }
            },
        )))
    }
    async fn json(
        &self,
        method: Method,
        segments: &[&str],
        query: &[(String, String)],
        body: Option<&Value>,
    ) -> Result<Value> {
        let response = self.request(method, segments, query, body).await?;
        let mut stream = self.stream_response(response, self.options.max_json_bytes)?;
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.try_next().await? {
            bytes.extend(chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| Error::InvalidResponse("invalid JSON".into()))
    }
    pub async fn configuration(&self) -> Result<Value> {
        self.json(Method::GET, &["configuration"], &[], None).await
    }
    pub async fn version(&self) -> Result<Value> {
        self.json(Method::GET, &["version"], &[], None).await
    }
    pub async fn authenticated(&self) -> Result<Value> {
        self.json(Method::GET, &["authenticated"], &[], None).await
    }
    pub async fn get_object(&self, id: &str) -> Result<Option<Value>> {
        match self
            .json(Method::GET, &["object"], &[("id".into(), id.into())], None)
            .await
        {
            Err(Error::Http(404)) => Ok(None),
            Ok(value) if value.get("message") == Some(&json!("Not Found")) => Ok(None),
            Ok(value) if value.is_object() => Ok(Some(value)),
            Ok(_) => Err(Error::InvalidResponse(
                "object summary must be an object".into(),
            )),
            Err(error) => Err(error),
        }
    }
    pub async fn browse(&self, options: &BrowseOptions) -> Result<Value> {
        let mut query = vec![("offset".into(), options.offset.to_string())];
        if let Some(limit) = options.limit {
            if limit == 0 {
                return Err(Error::InvalidInput("limit must be positive".into()));
            }
            query.push(("limit".into(), limit.to_string()));
        }
        for member in &options.member_of {
            query.push(("memberOf".into(), member.clone()));
        }
        if let Some(profile) = &options.conforms_to {
            query.push(("conformsTo".into(), profile.clone()));
        }
        self.json(Method::GET, &["object"], &query, None).await
    }
    pub async fn get_metadata(&self, id: &str, resolved: bool, rewrite_ids: bool) -> Result<Value> {
        let mut query = vec![("id".into(), id.into())];
        if resolved {
            query.push(("resolve-parts".into(), "".into()));
        }
        if !rewrite_ids {
            query.push(("raw".into(), "".into()));
        }
        let value = self
            .json(Method::GET, &["object", "meta"], &query, None)
            .await?;
        if !value.is_object() {
            return Err(Error::InvalidResponse("metadata must be an object".into()));
        }
        Ok(value)
    }
    pub async fn get_crate(&self, id: &str, resolved: bool, rewrite_ids: bool) -> Result<RoCrate> {
        RoCrate::from_value(self.get_metadata(id, resolved, rewrite_ids).await?)
    }
    pub async fn search_raw(&self, index: &str, body: &Value) -> Result<SearchPage> {
        if !body.is_object() {
            return Err(Error::InvalidInput("search body must be an object".into()));
        }
        let raw = self
            .json(Method::POST, &["search", "index", index], &[], Some(body))
            .await?;
        search_page(
            raw,
            body.get("from").and_then(Value::as_u64).unwrap_or(0),
            body.get("size").and_then(Value::as_u64).unwrap_or(10),
        )
    }
    pub async fn search_field(&self, index: &str, field: &str, value: &str) -> Result<Value> {
        self.json(
            Method::GET,
            &["search", "fields", index],
            &[
                ("field".into(), field.into()),
                ("value".into(), value.into()),
            ],
            None,
        )
        .await
    }
    pub async fn search(
        &self,
        method: &str,
        query: &str,
        limit: u64,
        offset: u64,
    ) -> Result<SearchPage> {
        let body = build_search_body(method, query, limit, offset)?;
        if method == "identifier" {
            if let Some(id) = extract_identifier(query) {
                if let Some(summary) = self.get_object(&id).await? {
                    return Ok(SearchPage {
                        items: vec![normalize_record(&summary)?],
                        total: 1,
                        offset,
                        limit,
                        raw: summary,
                    });
                }
            }
        }
        self.search_raw("items", &body).await
    }
    pub async fn featured_collections(&self, ids: &[String]) -> Result<Vec<Value>> {
        let summaries: Vec<_> = stream::iter(ids.iter().cloned().map(|id| {
            let client = self.clone();
            async move { client.get_object(&id).await }
        }))
        .buffered(self.options.concurrency)
        .try_collect()
        .await?;
        summaries.iter().flatten().map(normalize_record).collect()
    }
    pub async fn stream_file(&self, id: &str, path: &str, max_bytes: u64) -> Result<ByteStream> {
        let response = self
            .request(
                Method::GET,
                &["stream"],
                &[("id".into(), id.into()), ("path".into(), path.into())],
                None,
            )
            .await?;
        self.stream_response(response, max_bytes)
    }
    pub async fn download_file(
        &self,
        id: &str,
        path: &str,
        destination: &Path,
        max_bytes: u64,
    ) -> Result<u64> {
        let parent = destination
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let temporary = tempfile::NamedTempFile::new_in(parent)?;
        let mut file = tokio::fs::File::from_std(temporary.reopen()?);
        let mut stream = self.stream_file(id, path, max_bytes).await?;
        let mut total = 0;
        while let Some(bytes) = stream.try_next().await? {
            use tokio::io::AsyncWriteExt;
            file.write_all(&bytes).await?;
            total += bytes.len() as u64;
        }
        file.sync_all().await?;
        drop(file);
        temporary
            .persist_noclobber(destination)
            .map_err(|e| Error::Io(e.error))?;
        Ok(total)
    }
    pub async fn download_texts(
        &self,
        id: &str,
        paths: &[String],
        max_total_bytes: u64,
    ) -> Result<IndexMap<String, String>> {
        if paths.len() > self.options.max_documents {
            return Err(Error::Limit("too many documents".into()));
        }
        let total = Arc::new(AtomicU64::new(0));
        stream::iter(paths.iter().cloned().map(|path| {
            let total = total.clone();
            let client = self.clone();
            let id = id.to_owned();
            async move {
                let response = client
                    .request(
                        Method::GET,
                        &["stream"],
                        &[("id".into(), id), ("path".into(), path.clone())],
                        None,
                    )
                    .await?;
                let charset = response
                    .headers()
                    .get(CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.split(';').find_map(|p| p.trim().strip_prefix("charset=")))
                    .map(|s| s.trim_matches('"').to_owned());
                let mut stream =
                    client.stream_response(response, client.options.max_document_bytes)?;
                let mut bytes = Vec::new();
                while let Some(chunk) = stream.try_next().await? {
                    total
                        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                            n.checked_add(chunk.len() as u64)
                                .filter(|n| *n <= max_total_bytes)
                        })
                        .map_err(|_| Error::Limit("aggregate download size".into()))?;
                    bytes.extend(chunk);
                }
                let text = if let Some(charset) = charset {
                    let encoding = encoding_rs::Encoding::for_label(charset.as_bytes())
                        .ok_or_else(|| {
                            Error::InvalidResponse("unsupported text encoding".into())
                        })?;
                    encoding
                        .decode_without_bom_handling_and_without_replacement(&bytes)
                        .ok_or_else(|| Error::InvalidResponse("invalid document encoding".into()))?
                        .into_owned()
                } else {
                    String::from_utf8(bytes)
                        .map_err(|_| Error::InvalidResponse("invalid UTF-8 document".into()))?
                };
                Ok((path.clone(), text))
            }
        }))
        .buffered(self.options.concurrency)
        .try_collect()
        .await
    }
    pub async fn document_table(
        &self,
        id: &str,
        paths: &[String],
        max_total_bytes: u64,
    ) -> Result<Table> {
        crate::documents::from_texts(id, &self.download_texts(id, paths, max_total_bytes).await?)
    }

    pub async fn wordflow_table(
        &self,
        id: &str,
        krate: &RoCrate,
        max_total_bytes: u64,
    ) -> Result<Table> {
        let documents = select_documents(krate);
        if documents.is_empty() {
            return wordflow_metadata(krate, id, None);
        }
        let declared = documents
            .iter()
            .filter_map(|d| d.content_size)
            .try_fold(0u64, |sum, n| sum.checked_add(n as u64))
            .ok_or_else(|| Error::Limit("declared download size".into()))?;
        if declared > max_total_bytes {
            return Err(Error::Limit("declared download size".into()));
        }
        let paths: Vec<_> = documents.iter().map(|d| d.path.clone()).collect();
        document_table(
            &documents,
            &self.download_texts(id, &paths, max_total_bytes).await?,
        )
    }
}
pub fn build_search_body(method: &str, query: &str, limit: u64, offset: u64) -> Result<Value> {
    if !(1..=100).contains(&limit) {
        return Err(Error::InvalidInput(
            "page size must be between 1 and 100".into(),
        ));
    }
    let query = query.trim();
    let filter = match method {
        "identifier" => {
            let id = extract_identifier(query).unwrap_or_else(|| query.into());
            json!({"bool":{"should":[{"term":{"@id.keyword":id}},{"term":{"_crateId.@value.keyword":id}},{"term":{"_crateId.keyword":id}}],"minimum_should_match":1}})
        }
        "collection" => {
            json!({"bool":{"filter":[{"terms":{"@type.keyword":["Dataset","RepositoryCollection"]}},{"terms":{"_isTopLevel.@value.keyword":["true"]}}]}})
        }
        "file_format" => {
            let mut filters = vec![json!({"terms":{"@type.keyword":["File"]}})];
            if !query.is_empty() {
                filters.push(json!({"terms":{"encodingFormat.@value.keyword":[query]}}));
            }
            json!({"bool":{"filter":filters}})
        }
        "all" => json!({"match_all":{}}),
        "keyword" if query.is_empty() => json!({"match_all":{}}),
        "keyword" => {
            json!({"multi_match":{"query":query,"fields":["name.@value","description.@value","_text","@id"]}})
        }
        _ => return Err(Error::InvalidInput("unknown search method".into())),
    };
    Ok(
        json!({"size":limit,"from":offset,"_source":["@id","@type","_crateId","_memberOf","_root","_mainCollection","name","description","encodingFormat","license","conformsTo","_access","error"],"query":filter}),
    )
}
pub fn normalize_record(summary: &Value) -> Result<Value> {
    let object = summary
        .as_object()
        .ok_or_else(|| Error::InvalidResponse("record must be an object".into()))?;
    let crate_id = first_string(object.get("crateId").or_else(|| object.get("_crateId")));
    let id = first_string(object.get("@id"))
        .or_else(|| crate_id.clone())
        .or_else(|| first_string(object.get("id")))
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| Error::InvalidResponse("record is missing its identifier".into()))?;
    let nested = object.get("record");
    if nested.is_some_and(|v| !v.is_null() && !v.is_object()) {
        return Err(Error::InvalidResponse("invalid nested record".into()));
    }
    let mut collections = Vec::new();
    for key in [
        "_memberOf",
        "_mainCollection",
        "_root",
        "_crateId",
        "crateId",
    ] {
        for value in strings(object.get(key)) {
            if !collections.contains(&value) {
                collections.push(value);
            }
        }
    }
    Ok(
        json!({"id":id,"crate_id":crate_id,"title":first_string(object.get("name")).or_else(||first_string(nested.and_then(|v|v.get("name")))) .unwrap_or(id),"description":first_string(object.get("description")).or_else(||first_string(nested.and_then(|v|v.get("description")))),"types":strings(object.get("recordType").or_else(||object.get("@type"))),"license":first_string(object.get("license")),"importable":object.get("error")!=Some(&json!("not_authorized")) && object.get("_access").and_then(|a|a.get("hasAccess")).and_then(Value::as_bool)!=Some(false),"access":strings(object.get("_access")),"collections":collections,"file_formats":strings(object.get("encodingFormat"))}),
    )
}
fn search_page(raw: Value, offset: u64, limit: u64) -> Result<SearchPage> {
    let hits = raw
        .get("hits")
        .and_then(Value::as_object)
        .ok_or_else(|| Error::InvalidResponse("invalid search hits".into()))?;
    let items = hits
        .get("hits")
        .and_then(Value::as_array)
        .ok_or_else(|| Error::InvalidResponse("search hits must be an array".into()))?;
    let total = hits
        .get("total")
        .and_then(|v| {
            v.as_u64()
                .or_else(|| v.get("value").and_then(Value::as_u64))
        })
        .unwrap_or(0);
    let items = items
        .iter()
        .map(|hit| normalize_record(hit.get("_source").unwrap_or(&Value::Null)))
        .collect::<Result<_>>()?;
    Ok(SearchPage {
        items,
        total,
        offset,
        limit,
        raw,
    })
}
