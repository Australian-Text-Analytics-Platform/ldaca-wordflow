use super::*;

impl ProjectRuntime {
    pub(crate) async fn submit_frequency(
        &self,
        tab_id: Uuid,
        input: FrequencyRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != "frequency" {
            return Err(Error::invalid("Analysis tab is not a Frequency tab"));
        }
        if !(1..=2).contains(&input.inputs.len()) {
            return Err(Error::invalid("Select one or two corpora"));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Frequency: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let analysis_id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, "frequency", submitted)
                    })
                    .await?;
                context.progress("Loading tokenizer", None);
                let models: Vec<_> = input
                    .inputs
                    .iter()
                    .map(|input| input.tokenizer.clone())
                    .collect();
                let tokenizers = context
                    .run_blocking(move |context| {
                        models
                            .iter()
                            .map(|model| {
                                context.check_cancelled()?;
                                ldaca_rs::text::Tokenizer::load(model).map_err(|error| {
                                    Error::new("tokenizer_error", error.to_string())
                                })
                            })
                            .collect::<Result<Vec<_>>>()
                    })
                    .await?;
                context.check_cancelled()?;
                runtime
                    .with_writable_project(move |p| {
                        p.run_frequency(tab_id, analysis_id, input, tokenizers, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    pub(crate) async fn frequency_page(
        &self,
        id: Uuid,
        query: FrequencyQuery,
    ) -> Result<FrequencyPage> {
        self.with_project(move |p| p.frequency_page(id, query))
            .await
    }
    /// Write a saved result directly into host-owned staging, retaining it through database cleanup.
    pub async fn export_frequency_into(
        &self,
        id: Uuid,
        query: FrequencyQuery,
        format: FrequencyExportFormat,
        file: tempfile::NamedTempFile,
    ) -> Result<tempfile::NamedTempFile> {
        self.with_project(move |p| {
            p.export_frequency_into(id, query, format, file.path())?;
            Ok(file)
        })
        .await
    }
    pub(crate) async fn frequency_export_parts(
        &self,
        id: Uuid,
        query: FrequencyQuery,
        format: FrequencyExportFormat,
    ) -> Result<(tempfile::NamedTempFile, String)> {
        self.with_project(move |p| {
            use std::io::Write;
            let table = tempfile::NamedTempFile::new()?;
            let words = tempfile::NamedTempFile::new()?;
            p.export_frequency_parts(id, query, format, table.path(), Some(words.path()))?;
            let boundary = format!("wordflow-{}", Uuid::new_v4().simple());
            let mut output = tempfile::NamedTempFile::new()?;
            for (name, extension, file) in [("table", format.extension(), table), ("stopwords", "txt", words)] {
                write!(output, "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{name}.{extension}\"\r\nContent-Type: application/octet-stream\r\n\r\n")?;
                std::io::copy(&mut std::fs::File::open(file.path())?, &mut output)?;
                write!(output, "\r\n")?;
            }
            write!(output, "--{boundary}--\r\n")?;
            Ok((output, format!("multipart/form-data; boundary={boundary}")))
        }).await
    }
}
