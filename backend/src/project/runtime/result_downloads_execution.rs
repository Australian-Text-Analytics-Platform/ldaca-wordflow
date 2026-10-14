use super::*;

impl ProjectRuntime {
    pub(crate) async fn download_captured_result(
        &self,
        input: result_downloads::CapturedResultDownload,
    ) -> Result<tempfile::NamedTempFile> {
        self.with_project(move |p| p.download_captured_result(input))
            .await
    }
    pub(crate) async fn download_result(
        &self,
        id: Uuid,
        input: result_downloads::ResultDownload,
    ) -> Result<tempfile::NamedTempFile> {
        let shared = self.shared.clone();
        self.with_project(move |p| {
            if matches!(
                input.selection,
                result_downloads::ResultSelection::Annotation { .. }
            ) {
                let request: annotation::execution::Request =
                    serde_json::from_value(p.analysis(id)?.request)?;
                if shared.protection.is_manually_editing(&request.setup.source) {
                    return Err(cell_edit::editing_active());
                }
            }
            p.download_result(id, input)
        })
        .await
    }
}
