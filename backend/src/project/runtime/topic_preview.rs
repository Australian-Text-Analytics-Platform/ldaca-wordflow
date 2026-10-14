//! A Topic Preview lives exactly as long as its response stream. Only fitting
//! and query operations count as active project work; an idle model does not.
use super::*;
use crate::project::topic_modeling::*;
use axum::response::sse::{Event, KeepAlive, Sse};

pub(super) struct Preview {
    pub(super) cancellation: CancellationToken,
    model: Mutex<Option<Arc<TopicModel>>>,
    id: Uuid,
    tab: Uuid,
    finished: CancellationToken,
}
struct Lease {
    preview: Arc<Preview>,
    runtime: ProjectRuntime,
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.preview.cancellation.cancel();
        if let Ok(mut previews) = self.runtime.shared.topic_previews.lock() {
            previews.remove(&self.preview.id);
        }
    }
}
#[derive(Clone, Serialize, utoipa::ToSchema)]
#[schema(as = TopicPreviewUpdate)]
#[serde(tag = "state", rename_all = "snake_case")]
pub(crate) enum Update {
    Preparing {
        preview_id: Uuid,
        stage: String,
        #[schema(required = true)]
        fraction: Option<f64>,
    },
    Ready {
        preview_id: Uuid,
        summary: PreviewSummary,
    },
    Failed {
        preview_id: Uuid,
        error: Error,
    },
}
impl ProjectRuntime {
    fn topic_adjustment_operation(&self, key: Uuid) -> Result<(Operation, Uuid)> {
        let operation = self.operation()?;
        let revision = Uuid::new_v4();
        if let Some((_, previous)) = locked(&self.shared.topic_adjustments)?
            .insert(key, (revision, operation.cancellation.clone()))
        {
            previous.cancel();
        }
        Ok((operation, revision))
    }
    fn finish_topic_adjustment(&self, key: Uuid, revision: Uuid) -> Result<()> {
        let mut operations = locked(&self.shared.topic_adjustments)?;
        if operations
            .get(&key)
            .is_some_and(|(current, _)| *current == revision)
        {
            operations.remove(&key);
        }
        Ok(())
    }
    pub(crate) async fn adjust_topic_model(
        &self,
        id: Uuid,
        input: TopicAdjustment,
    ) -> Result<Analysis> {
        self.ensure_writable().await?;
        let tab = self
            .with_project(move |db| Ok(db.analysis(id)?.tab_id))
            .await?;
        if self.shared.tasks.analysis_active(tab) {
            return Err(Error::new(
                "analysis_busy",
                "Wait for the active Run to finish",
            ));
        }
        let cache = locked(&self.shared.embedding_cache)?.clone();
        let (operation, revision) = self.topic_adjustment_operation(id)?;
        let _cancel_on_drop = operation.cancellation.clone().drop_guard();
        let result = self
            .run_operation(operation, Access::Write, move |db, _| {
                db.adjust_topic_model(id, input, cache)
            })
            .await;
        self.finish_topic_adjustment(id, revision)?;
        result
    }
    pub(crate) async fn adjust_topic_preview(
        &self,
        tab: Uuid,
        id: Uuid,
        input: TopicAdjustment,
    ) -> Result<PreviewSummary> {
        let preview = self.topic_preview(tab, id)?;
        let model = locked(&preview.model)?
            .clone()
            .ok_or_else(|| Error::new("preview_not_ready", "Preview is still calculating"))?;
        let cache = locked(&self.shared.embedding_cache)?.clone();
        let (operation, revision) = self.topic_adjustment_operation(id)?;
        let _cancel_on_drop = operation.cancellation.clone().drop_guard();
        let owner = preview.clone();
        let result = self
            .run_operation(operation, Access::Read, move |db, _| {
                check_cancellation(&owner.cancellation)?;
                let mut texts = Vec::new();
                for (source, rows) in model.sources.iter().zip(&model.preview_documents) {
                    texts.extend(rows.texts(&source.input.column)?);
                }
                let adjusted = model.adjusted(
                    &texts,
                    &input,
                    cache.as_deref(),
                    db.model_assets.as_ref(),
                    &db.cancellation,
                )?;
                check_cancellation(&owner.cancellation)?;
                check_cancellation(&db.cancellation)?;
                let mut slot = locked(&owner.model)?;
                if slot
                    .as_ref()
                    .is_none_or(|current| current.revision != input.expected_projection)
                {
                    return Err(Error::new(
                        "topic_adjustment_stale",
                        "The Topic Preview changed. Refresh and retry this adjustment.",
                    ));
                }
                let summary = adjusted.summary();
                *slot = Some(Arc::new(adjusted));
                Ok(summary)
            })
            .await;
        self.finish_topic_adjustment(id, revision)?;
        result
    }
    /// The host chooses an application cache outside every project database.
    pub fn set_embedding_cache_path(&self, path: PathBuf) -> Result<()> {
        *locked(&self.shared.embedding_cache)? = Some(path);
        Ok(())
    }
    pub(super) fn cancel_topic_preview(&self, tab: Uuid) -> Result<()> {
        for preview in locked(&self.shared.topic_previews)?
            .values()
            .filter_map(std::sync::Weak::upgrade)
            .filter(|p| p.tab == tab)
        {
            preview.cancellation.cancel();
        }
        Ok(())
    }
    async fn release_topic_previews(&self, tab: Uuid) -> Result<()> {
        let previews = locked(&self.shared.topic_previews)?
            .values()
            .filter_map(std::sync::Weak::upgrade)
            .filter(|p| p.tab == tab)
            .collect::<Vec<_>>();
        for preview in previews {
            preview.cancellation.cancel();
            if let Some((_, adjustment)) = locked(&self.shared.topic_adjustments)?.get(&preview.id)
            {
                adjustment.cancel();
            }
            preview.finished.cancelled().await;
            *locked(&preview.model)? = None;
        }
        Ok(())
    }
    pub(crate) async fn submit_topic_model(
        &self,
        tab: Uuid,
        request: TopicRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        request.validate()?;
        let selected = request.clone();
        let title = self
            .with_project(move |p| {
                p.validate_topic_request(tab, &selected)?;
                Ok(p.analysis_tab(tab)?.name)
            })
            .await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Topic Modelling: {title}"),
            Some(tab),
            move |context| async move {
                let submitted = serde_json::to_value(&request)?;
                let id = runtime
                    .with_writable_project(move |p| p.begin_analysis_run(tab, KIND, submitted))
                    .await?;
                {
                    let _admission = runtime.shared.topic_preview_admission.lock().await;
                    runtime.release_topic_previews(tab).await?;
                }
                context.progress("Preparing local models", None);
                let prepare = request.clone();
                let assets = runtime.model_assets()?;
                context
                    .run_blocking(move |context| {
                        context.check_cancelled()?;
                        prepare.prepare(assets.as_ref())?;
                        context.check_cancelled()
                    })
                    .await?;
                let cache = locked(&runtime.shared.embedding_cache)?.clone();
                runtime
                    .with_writable_project(move |p| {
                        p.run_topic_model(tab, id, request, cache, |stage, fraction| {
                            context.progress(stage, fraction)
                        })
                    })
                    .await
            },
        )
    }
    pub(crate) async fn query_topic_model(
        &self,
        id: Uuid,
        request: TopicQuery,
    ) -> Result<TopicProjection> {
        self.with_project(move |p| p.query_topic_model(id, request))
            .await
    }
    pub(crate) async fn submit_topic_publish(
        &self,
        id: Uuid,
        request: TopicPublish,
    ) -> Result<crate::TaskHandle<Vec<ObjectTarget>>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add Topic Modelling to Project".into(),
            None,
            move |context| async move {
                context.progress("Publishing annotated documents and topic dictionary", None);
                runtime
                    .with_writable_project(move |p| p.publish_topic_model(id, request))
                    .await
            },
        )
    }
    pub(crate) async fn open_topic_preview(
        &self,
        tab: Uuid,
        input: TopicPreviewRequest,
    ) -> Result<impl axum::response::IntoResponse + use<>> {
        let _admission = self.shared.topic_preview_admission.lock().await;
        self.ensure_writable().await?;
        let request = input.request.clone();
        self.with_project(move |p| p.validate_topic_request(tab, &request))
            .await?;
        if self.shared.tasks.analysis_active(tab) {
            return Err(Error::new(
                "analysis_busy",
                "Wait for the active Run to finish",
            ));
        }
        self.release_topic_previews(tab).await?;
        let operation = self.operation()?;
        let id = Uuid::new_v4();
        let preview = Arc::new(Preview {
            cancellation: operation.cancellation.clone(),
            model: Mutex::new(None),
            id,
            tab,
            finished: CancellationToken::new(),
        });
        locked(&self.shared.topic_previews)?.insert(id, Arc::downgrade(&preview));
        let (sender, updates) = watch::channel(Update::Preparing {
            preview_id: id,
            stage: "Preparing local models".into(),
            fraction: None,
        });
        let lease = Lease {
            preview: preview.clone(),
            runtime: self.clone(),
        };
        let runtime = self.clone();
        let cache = locked(&self.shared.embedding_cache)?.clone();
        let assets = runtime.model_assets()?;
        tokio::spawn(async move {
            let owned = preview.clone();
            // The blocking preparation owns the Operation even if the stream is dropped.
            let prepared = tokio::task::spawn_blocking(move || {
                let result = check_cancellation(&operation.cancellation)
                    .and_then(|()| input.request.prepare(assets.as_ref()))
                    .and_then(|()| check_cancellation(&operation.cancellation));
                (operation, input, result)
            })
            .await;
            let result = match prepared {
                Ok((operation, input, Ok(()))) => {
                    let progress = sender.clone();
                    runtime
                        .run_operation(operation, Access::Write, move |db, _| {
                            db.preview_topic_model(tab, input, cache, |stage, fraction| {
                                progress.send_replace(Update::Preparing {
                                    preview_id: id,
                                    stage: stage.into(),
                                    fraction,
                                });
                            })
                        })
                        .await
                }
                Ok((_, _, Err(error))) => Err(error),
                Err(error) => Err(Error::from(error)),
            };
            let update = match result {
                Ok(model) if !owned.cancellation.is_cancelled() => {
                    let summary = model.summary();
                    match locked(&owned.model) {
                        Ok(mut slot) => {
                            *slot = Some(Arc::new(model));
                            Update::Ready {
                                preview_id: id,
                                summary,
                            }
                        }
                        Err(error) => Update::Failed {
                            preview_id: id,
                            error,
                        },
                    }
                }
                Ok(_) => Update::Failed {
                    preview_id: id,
                    error: interrupted(),
                },
                Err(error) => Update::Failed {
                    preview_id: id,
                    error,
                },
            };
            sender.send_replace(update);
            owned.finished.cancel();
        });
        let shutdown = self.shared.shutdown.clone();
        let stream = futures_util::stream::unfold(
            (lease, updates, shutdown, true, false),
            |(lease, mut updates, shutdown, initial, terminal)| async move {
                if terminal {
                    return None;
                }
                if !initial {
                    tokio::select! {
                        ()=shutdown.cancelled()=>return None,
                        ()=lease.preview.cancellation.cancelled()=>return None,
                        result=updates.changed()=>if result.is_err() {
                            // Fitting has finished. Retain the lease until the client or project closes.
                            tokio::select! { ()=shutdown.cancelled()=>{}, ()=lease.preview.cancellation.cancelled()=>{} }
                            return None;
                        },
                    }
                }
                let update = updates.borrow_and_update().clone();
                let terminal = matches!(update, Update::Failed { .. });
                let event = Event::default().event("preview").json_data(update);
                Some((event, (lease, updates, shutdown, false, terminal)))
            },
        );
        Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
    }
    fn topic_preview(&self, tab: Uuid, id: Uuid) -> Result<Arc<Preview>> {
        locked(&self.shared.topic_previews)?
            .get(&id)
            .and_then(std::sync::Weak::upgrade)
            .filter(|p| p.tab == tab && !p.cancellation.is_cancelled())
            .ok_or_else(|| {
                Error::new(
                    "preview_expired",
                    "This Preview has expired. Click Preview to sample again.",
                )
            })
    }
    pub(crate) async fn delete_topic_preview(&self, tab: Uuid, id: Uuid) -> Result<()> {
        let preview = self.topic_preview(tab, id)?;
        preview.cancellation.cancel();
        preview.finished.cancelled().await;
        *locked(&preview.model)? = None;
        Ok(())
    }
    pub(crate) async fn query_topic_preview(
        &self,
        tab: Uuid,
        id: Uuid,
        request: TopicQuery,
    ) -> Result<TopicProjection> {
        self.query_topic_preview_rows(tab, id, request, false).await
    }
    async fn query_topic_preview_rows(
        &self,
        tab: Uuid,
        id: Uuid,
        request: TopicQuery,
        all: bool,
    ) -> Result<TopicProjection> {
        let preview = self.topic_preview(tab, id)?;
        let model = locked(&preview.model)?
            .clone()
            .ok_or_else(|| Error::new("preview_not_ready", "Preview is still calculating"))?;
        let operation = self.operation()?;
        let cancellation = operation.cancellation.clone();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        let owner = preview.cancellation.clone();
        let finished = CancellationToken::new();
        let _finish_on_drop = finished.clone().drop_guard();
        let done = finished.clone();
        let monitor = tokio::spawn(async move {
            tokio::select! { ()=owner.cancelled()=>cancellation.cancel(), ()=done.cancelled()=>{} }
        });
        let result = self
            .run_operation(operation, Access::Read, move |db, _| {
                let result = db.project_topic_rows(&model, None, request, all)?;
                check_cancellation(&db.cancellation)?;
                Ok(result)
            })
            .await;
        finished.cancel();
        let _ = monitor.await;
        result
    }

    pub(crate) async fn download_topic_preview(
        &self,
        tab: Uuid,
        id: Uuid,
        input: result_downloads::TopicPreviewDownload,
    ) -> Result<tempfile::NamedTempFile> {
        let preview = self.topic_preview(tab, id)?;
        let model = locked(&preview.model)?
            .clone()
            .ok_or_else(|| Error::new("preview_not_ready", "Preview is still calculating"))?;
        let source = model
            .sources
            .get(input.query.source)
            .ok_or_else(|| Error::invalid("Unknown Topics source"))?;
        let document = result_downloads::ResultColumn {
            column: source.input.column.clone(),
            metadata: true,
        };
        let TopicProjection::Documents(page) = self
            .query_topic_preview_rows(tab, id, TopicQuery::Documents(input.query), true)
            .await?
        else {
            return Err(Error::invalid("Choose Topic documents"));
        };
        self.with_project(move |p| {
            result_downloads::export_result_rows(
                &p.conn,
                page.file,
                &document,
                &input.columns,
                input.format,
                &p.cancellation,
            )
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn idle(runtime: &ProjectRuntime) -> Arc<Preview> {
        let finished = CancellationToken::new();
        finished.cancel();
        let preview = Arc::new(Preview {
            cancellation: CancellationToken::new(),
            model: Mutex::new(None),
            id: Uuid::new_v4(),
            tab: Uuid::new_v4(),
            finished,
        });
        locked(&runtime.shared.topic_previews)
            .unwrap()
            .insert(preview.id, Arc::downgrade(&preview));
        preview
    }
    #[tokio::test]
    async fn idle_preview_has_no_running_work_and_stream_drop_expires_handle() {
        let runtime = ProjectRuntime::new(CancellationToken::new());
        let preview = idle(&runtime);
        assert!(runtime.shared.tracker.is_empty());
        assert!(runtime.topic_preview(preview.tab, preview.id).is_ok());
        assert!(runtime.topic_preview(Uuid::new_v4(), preview.id).is_err());
        let lease = Lease {
            preview: preview.clone(),
            runtime: runtime.clone(),
        };
        drop(lease);
        assert!(preview.cancellation.is_cancelled());
        assert!(runtime.topic_preview(preview.tab, preview.id).is_err());
        assert!(locked(&runtime.shared.topic_previews).unwrap().is_empty());
    }
    #[tokio::test]
    async fn release_waits_for_active_computation_cleanup() {
        let runtime = ProjectRuntime::new(CancellationToken::new());
        let preview = idle(&runtime);
        let preview = Arc::new(Preview {
            finished: CancellationToken::new(),
            cancellation: preview.cancellation.clone(),
            model: Mutex::new(None),
            id: preview.id,
            tab: preview.tab,
        });
        locked(&runtime.shared.topic_previews)
            .unwrap()
            .insert(preview.id, Arc::downgrade(&preview));
        let owner = runtime.clone();
        let tab = preview.tab;
        let release = tokio::spawn(async move { owner.release_topic_previews(tab).await });
        preview.cancellation.cancelled().await;
        assert!(!release.is_finished());
        assert!(runtime.topic_preview(tab, preview.id).is_err());
        preview.finished.cancel();
        release.await.unwrap().unwrap();
    }
}
