use super::*;

impl ProjectRuntime {
    pub(crate) async fn concordance_preview(
        &self,
        tab: Uuid,
        input: ConcordancePreview,
    ) -> Result<DocumentPage> {
        self.ensure_writable().await?;
        let operation = self.operation()?;
        // Unlike accepted tasks, a Preview belongs to its request. Cleanup stays runtime-owned.
        let cancellation = operation.cancellation.clone();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        let runtime = self.clone();
        tokio::spawn(async move {
            let search = input.search.clone();
            let source = input.input.clone();
            let assets = runtime.model_assets()?;
            let matcher = tokio::task::spawn_blocking(move || {
                DocumentMatcher::prepare_in(&search, &source, assets.as_ref())
            })
            .await??;
            check_cancellation(&cancellation)?;
            runtime
                .run_operation(operation, Access::Write, move |database, _| {
                    database.concordance_preview(tab, input, matcher)
                })
                .await
        })
        .await?
    }
    pub(crate) async fn concordance_page(
        &self,
        id: Uuid,
        input: ConcordanceQuery,
    ) -> Result<DocumentPage> {
        self.with_project(move |p| p.concordance_page(id, input))
            .await
    }
    pub(crate) async fn concordance_density(
        &self,
        id: Uuid,
        input: ConcordanceDensity,
    ) -> Result<tempfile::NamedTempFile> {
        self.with_project(move |p| p.concordance_density(id, input))
            .await
    }
    pub(crate) async fn submit_concordance_publication(
        &self,
        id: Uuid,
        input: ConcordancePublish,
    ) -> Result<crate::TaskHandle<Vec<ObjectTarget>>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add Concordance results to project".into(),
            None,
            move |context| async move {
                context.progress("Creating Data Blocks", None);
                runtime
                    .with_writable_project(move |p| p.publish_concordance(id, input))
                    .await
            },
        )
    }
    pub(crate) async fn submit_concordance(
        &self,
        tab_id: Uuid,
        input: ConcordanceRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != "concordance" || !(1..=2).contains(&input.inputs.len()) {
            return Err(Error::invalid(
                "Select a Concordance tab and one or two inputs",
            ));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Concordance: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let analysis_id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, "concordance", submitted)
                    })
                    .await?;
                context.progress("Preparing search", None);
                let request = input.clone();
                let assets = runtime.model_assets()?;
                let matchers = context
                    .run_blocking(move |context| {
                        request
                            .inputs
                            .iter()
                            .map(|input| {
                                context.check_cancelled()?;
                                DocumentMatcher::prepare_in(&request.search, input, assets.as_ref())
                            })
                            .collect::<Result<Vec<_>>>()
                    })
                    .await?;
                context.check_cancelled()?;
                runtime
                    .with_writable_project(move |p| {
                        p.run_concordance(tab_id, analysis_id, input, matchers, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
}
