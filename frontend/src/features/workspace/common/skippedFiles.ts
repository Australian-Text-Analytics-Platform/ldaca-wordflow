import type { SkippedFileCount } from '@/api';

/**
 * Summarizes files left out of a folder or ZIP of documents, e.g.
 * "50 files skipped while loading: pdf - 30, xlsx - 10, docx - 5, csv - 4, exe - 1".
 * Text files that are not UTF-8 are listed as "txt (not UTF-8)".
 */
export function describeSkippedFiles(skipped: SkippedFileCount[]): string {
  const total = skipped.reduce((sum, entry) => sum + entry.count, 0);
  const parts = [...skipped]
    .sort((left, right) => right.count - left.count)
    .map((entry) => {
      const label = entry.extension || '(no extension)';
      const reason = entry.reason === 'not_utf8' ? ' (not UTF-8)' : '';
      return `${label}${reason} - ${String(entry.count)}`;
    });
  const noun = total === 1 ? 'file' : 'files';
  return `${String(total)} ${noun} skipped while loading: ${parts.join(', ')}`;
}
