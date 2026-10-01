use super::*;

impl ProjectRuntime {
    pub(crate) async fn plot_timezones(&self) -> Result<Vec<String>> {
        self.load_icu().await?;
        self.with_project(|p| {
            Ok(p.conn
                .prepare("SELECT name FROM pg_timezone_names() ORDER BY name")?
                .query_map([], |r| r.get(0))?
                .collect::<duckdb::Result<Vec<_>>>()?)
        })
        .await
    }
    pub(crate) async fn submit_plot(
        &self,
        tab_id: Uuid,
        mode: PlotMode,
        input: PlotRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != mode.kind() {
            return Err(Error::invalid("Select the matching plot tab"));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Plot: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, mode.kind(), submitted)
                    })
                    .await?;
                context.check_cancelled()?;
                if matches!(&input, PlotRequest::Trends(r) if matches!(r.interval,Interval::Time{..})) {
                    context.progress("Preparing timezone support", None);
                    tokio::select! {
                        result = runtime.load_icu() => result?,
                        () = context.cancellation().cancelled() => return Err(interrupted()),
                    }
                }
                runtime
                    .with_writable_project(move |p| {
                        p.run_plot(tab_id, id, mode, input, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    async fn load_plot_icu(&self, id: Uuid, mode: PlotMode) -> Result<()> {
        if mode == PlotMode::Trends {
            let time=self.with_project(move |p| Ok(matches!(PlotRequest::decode(mode,p.analysis(id)?.request)?,PlotRequest::Trends(r) if matches!(r.interval,Interval::Time{..})))).await?;
            if time {
                self.load_icu().await?;
            }
        }
        Ok(())
    }
    pub(crate) async fn plot_page(
        &self,
        id: Uuid,
        mode: PlotMode,
        input: PlotQuery,
    ) -> Result<tempfile::NamedTempFile> {
        self.load_plot_icu(id, mode).await?;
        self.with_project(move |p| p.plot_page(id, mode, input))
            .await
    }
    pub(crate) async fn submit_plot_publication(
        &self,
        id: Uuid,
        mode: PlotMode,
        input: PlotPublish,
    ) -> Result<crate::TaskHandle<ObjectTarget>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add plot rows to project".into(),
            None,
            move |context| async move {
                context.progress("Creating Data Block", None);
                runtime.load_plot_icu(id, mode).await?;
                runtime
                    .with_writable_project(move |p| p.publish_plot(id, mode, input))
                    .await
            },
        )
    }
}
