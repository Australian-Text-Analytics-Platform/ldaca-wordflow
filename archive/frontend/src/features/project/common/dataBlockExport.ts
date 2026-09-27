import { exportDataBlocks, type DataBlockExportFormat } from '@/api';
import { safeDownloadStem, saveDataBlockDownload } from '@/lib/download';

import { DATA_BLOCK_EXPORT_FORMATS, type DataBlockExportSelection } from './exportFormats';
export { DATA_BLOCK_EXPORT_FORMATS, type DataBlockExportSelection } from './exportFormats';

const filenameFromResponse = (response: Response | undefined): string | null => {
  const disposition = response?.headers.get('content-disposition');
  if (!disposition) return null;
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return null;
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
};

/** Downloads one direct Data Block file or one server-built multi-block ZIP. */
export const downloadDataBlocks = async ({
  projectId,
  projectName,
  dataBlocks,
  format,
}: {
  projectId: string;
  projectName: string;
  dataBlocks: DataBlockExportSelection[];
  format: DataBlockExportFormat;
}): Promise<string | null> => {
  const formatSpec = DATA_BLOCK_EXPORT_FORMATS.find((candidate) => candidate.value === format);
  const fallbackFilename =
    dataBlocks.length > 1
      ? `${safeDownloadStem(projectName, projectId)}_data_blocks.zip`
      : `${safeDownloadStem(dataBlocks[0]?.name ?? '', dataBlocks[0]?.id ?? 'data-block')}.${formatSpec?.extension ?? format}`;
  let filename = fallbackFilename;
  const saved = await saveDataBlockDownload({
    projectId,
    nodeIds: dataBlocks.map((node) => node.id),
    format,
    filename: fallbackFilename,
    loadBrowserDownload: async () => {
      const { data, response } = await exportDataBlocks({
        parseAs: 'blob',
        path: { workspace_id: projectId },
        body: { node_ids: dataBlocks.map((node) => node.id), format },
        throwOnError: true,
      });
      filename = filenameFromResponse(response) ?? fallbackFilename;
      return { blob: data, filename };
    },
  });
  return saved ? filename : null;
};
