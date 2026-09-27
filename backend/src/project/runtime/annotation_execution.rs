use super::*;
use crate::project::annotation::execution::{Preview, PreviewRequest, Request, Run};

impl ProjectRuntime {
    pub(crate) async fn annotation_review(
        &self,
        id: Uuid,
        query: crate::project::annotation::review::Query,
    ) -> Result<crate::project::annotation::review::Output> {
        self.with_project(move |p| p.query_annotation(id, query))
            .await
    }

    pub(crate) async fn submit_annotation(
        &self,
        tab: Uuid,
        request: Request,
    ) -> Result<crate::TaskHandle<analyses::Analysis>> {
        self.ensure_writable().await?;
        let selected = request.clone();
        let title = self
            .with_project(move |p| {
                selected.validate(&p.conn, tab, true)?;
                Ok(p.analysis_tab(tab)?.name)
            })
            .await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Annotation: {title}"),
            Some(tab),
            move |context| async move {
                let operation = runtime.operation()?;
                let work = operation.work.clone();
                let shared = runtime.shared.clone();
                Self::own(operation, async move {
                    let _lifecycle = tokio::select! {
                        guard = shared.lifecycle.clone().read_owned() => guard,
                        () = work.cancellation.cancelled() => return Err(interrupted()),
                    };
                    let protection = shared.protection.editing(request.setup.source.clone())?;
                    protection.ready(&work.cancellation).await?;
                    context.progress("Capturing source and Codebook", None);
                    let config = request.inference.clone();
                    let ai = shared.ai.clone();
                    let client = shared.client.clone();
                    let worker = work.clone();
                    let (mut run, id) = tokio::task::spawn_blocking(move || {
                        let mut db = locked(&shared.project)?
                            .as_ref()
                            .ok_or_else(|| Error::new("project_closed", "Open a project first"))?
                            .database.connection(worker.cancellation.clone())?;
                        *locked(&worker.interrupt)? = Some(db.conn.interrupt_handle());
                        let relation = request.validate(&db.conn, tab, true)?;
                        cell_edit::validate_identifiers(&db.conn, &relation)?;
                        let id = db.begin_analysis_run(tab, "annotation", serde_json::to_value(&request)?)?;
                        Ok::<_, Error>((Run::capture(db, request, tab)?, id))
                    }).await??;
                    context.progress("Preparing provider", None);
                    let inference = ai.prepare_inference(&client, config).await?;
                    context.progress("Annotating documents", Some(0.0));
                    loop {
                        let (mut next, batch) = context.run_blocking(move |context| {
                            context.check_cancelled()?;
                            let batch = run.next()?;
                            Ok((run, batch))
                        }).await?;
                        if batch.texts.is_empty() {
                            run = next;
                            break;
                        }
                        let predictions = inference.predict(
                            &batch.texts, &next.context.codes, &next.context.examples,
                            context.cancellation(),
                        ).await?;
                        run = context.run_blocking(move |context| {
                            context.check_cancelled()?;
                            next.stage(batch.refs, predictions)?;
                            Ok(next)
                        }).await?;
                        context.progress("Annotating documents", Some(run.fraction()));
                    }
                    context.progress("Saving labels and run report", Some(1.0));
                    let result = context.run_blocking(move |context| {
                        context.check_cancelled()?;
                        let result = run.publish(tab, id)?;
                        if let Some(payload) = result.result.as_ref().map(|output| &output.payload) {
                            let skipped = payload["skipped"].as_u64().unwrap_or(0);
                            let failed = payload["failed"].as_u64().unwrap_or(0);
                            if skipped > 0 || failed > 0 {
                                context.notice(format!(
                                    "{} documents labelled; {skipped} blank documents skipped; {failed} predictions failed. Failed rows kept their previous labels.",
                                    payload["processed"],
                                ));
                            }
                        }
                        Ok(result)
                    }).await;
                    drop(protection);
                    result
                }).await
            },
        )
    }

    pub(crate) async fn annotation_preview(
        &self,
        tab: Uuid,
        input: PreviewRequest,
    ) -> Result<tempfile::NamedTempFile> {
        let operation = self.operation()?;
        let work = operation.work.clone();
        let _request = work.cancellation.clone().drop_guard();
        let shared = self.shared.clone();
        Self::own(operation, async move {
            let _lifecycle = tokio::select! {
                guard = shared.lifecycle.clone().read_owned() => guard,
                () = work.cancellation.cancelled() => return Err(interrupted()),
            };
            let inference = shared
                .ai
                .prepare_inference(&shared.client, input.request.inference.clone())
                .await?;
            let worker = work.clone();
            let preview = tokio::task::spawn_blocking(move || {
                let db = locked(&shared.project)?
                    .as_ref()
                    .ok_or_else(|| Error::new("project_closed", "Open a project first"))?
                    .database
                    .connection(worker.cancellation.clone())?;
                *locked(&worker.interrupt)? = Some(db.conn.interrupt_handle());
                Preview::capture(db, input, tab)
            })
            .await??;
            let predictions = inference
                .predict(
                    &preview.texts,
                    &preview.context.codes,
                    &preview.context.examples,
                    &work.cancellation,
                )
                .await?;
            tokio::task::spawn_blocking(move || preview.finish(predictions)).await?
        })
        .await
    }
}
