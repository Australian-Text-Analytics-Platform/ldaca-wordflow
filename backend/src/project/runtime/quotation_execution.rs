use super::*;

impl ProjectRuntime {
    pub(crate) async fn quotation_preview(
        &self,
        tab: Uuid,
        input: QuotationPreview,
    ) -> Result<DocumentPage> {
        self.ensure_writable().await?;
        document_matches::page_offset(input.page, input.page_size)?;
        let selected = input.input.clone();
        self.with_project(move |p| p.validate_quotation_input(tab, &selected))
            .await?;
        let operation = self.operation()?;
        let cancellation = operation.cancellation.clone();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        let runtime = self.clone();
        tokio::spawn(async move {
            let extractor = quotation::prepare_extractor(
                runtime.shared.client.clone(),
                cancellation.clone(),
                runtime.quotation_path()?,
            )
            .await?;
            check_cancellation(&cancellation)?;
            runtime
                .run_operation(operation, Access::Write, move |database, _| {
                    database.quotation_preview(tab, input, extractor)
                })
                .await
        })
        .await?
    }
    pub(crate) async fn quotation_page(
        &self,
        id: Uuid,
        input: QuotationQuery,
    ) -> Result<DocumentPage> {
        self.with_project(move |p| p.quotation_page(id, input))
            .await
    }
    pub(crate) async fn submit_quotation(
        &self,
        tab_id: Uuid,
        input: QuotationRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != "quotation" {
            return Err(Error::invalid("Select a Quotation tab"));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Quotation: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let analysis_id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, "quotation", submitted)
                    })
                    .await?;
                let selected = input.input.clone();
                runtime
                    .with_project(move |p| p.validate_quotation_input(tab_id, &selected))
                    .await?;
                context.progress("Loading quotation model", None);
                let extractor = quotation::prepare_extractor(
                    runtime.shared.client.clone(),
                    context.cancellation().clone(),
                    runtime.quotation_path()?,
                )
                .await?;
                context.check_cancelled()?;
                runtime
                    .with_writable_project(move |p| {
                        p.run_quotation(tab_id, analysis_id, input, extractor, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    pub(crate) async fn submit_quotation_publication(
        &self,
        id: Uuid,
        input: QuotationPublish,
    ) -> Result<crate::TaskHandle<ObjectTarget>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add Quotation results to project".into(),
            None,
            move |context| async move {
                context.progress("Creating Data Block", None);
                runtime
                    .with_writable_project(move |p| p.publish_quotation(id, input))
                    .await
            },
        )
    }
}
