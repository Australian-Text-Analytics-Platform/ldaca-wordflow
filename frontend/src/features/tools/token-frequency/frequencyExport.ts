import type { ChartExportFormat } from '../common/chartExport';
type FrequencyExportFormat = 'csv' | 'markdown';
export type DownloadFormat = ChartExportFormat | FrequencyExportFormat;

export async function buildFrequencyBundle(
  blob: Blob,
  filename: string,
  stopwords: string[],
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const name = filename.replace(/[\\/]/g, '_');
  zip.file(name, await blob.arrayBuffer());
  zip.file(`${name.replace(/\.[^.]+$/, '')}-stopwords.txt`, stopwords.join('\n'));
  return zip.generateAsync({ type: 'blob' });
}
