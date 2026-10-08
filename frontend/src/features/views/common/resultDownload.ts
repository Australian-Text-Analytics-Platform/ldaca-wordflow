import { downloadResult, type DataBlockExportFormat, type ResultDownloadRequest } from '@/api';
import { safeDownloadStem, saveBlob } from '@/lib/download';
import { filenameFromResponse } from '@/features/workspace/common/dataBlockExport';

/**
 * Downloads the table Add to Project would create, as a file (issue 352):
 * one CSV or Excel file, or a ZIP when several sources are chosen.
 * Used by: Concordance and Quotation Results.
 */
export const downloadResultSelection = async ({
  workspaceId,
  analysisId,
  request,
  format,
  fallbackName,
}: {
  workspaceId: string;
  analysisId: string;
  request: ResultDownloadRequest['request'];
  format: DataBlockExportFormat;
  fallbackName: string;
}): Promise<boolean> => {
  const { data, response } = await downloadResult({
    parseAs: 'blob',
    path: { workspace_id: workspaceId, analysis_id: analysisId },
    body: { request, format },
    throwOnError: true,
  });
  const fallback = `${safeDownloadStem(fallbackName, 'results')}.${format}`;
  return saveBlob(data, filenameFromResponse(response) ?? fallback);
};
