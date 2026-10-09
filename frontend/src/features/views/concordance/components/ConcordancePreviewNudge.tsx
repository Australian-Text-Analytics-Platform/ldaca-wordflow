import { NudgeCard } from '@/features/nudges/NudgeCard';
import { batchProcessedCount } from '../concordanceDispersionDomain';

interface ConcordancePreviewNudgeProps {
  groups: readonly (readonly unknown[])[];
  pagination: { page_size?: number; total_source_rows?: number };
  /** Changes with a new search or page, so the suggestion comes back. */
  occurrence: string;
}

/**
 * Suggestion when a Preview found nothing in the documents it checked, while
 * the Data Block has more (issue 360): show more documents per page, or Run.
 */
export function ConcordancePreviewNudge({
  groups,
  pagination,
  occurrence,
}: ConcordancePreviewNudgeProps) {
  const checked = batchProcessedCount(pagination);
  const total = pagination.total_source_rows;
  const matches = groups.reduce((sum, group) => sum + group.length, 0);
  const partial = checked !== undefined && total !== undefined && total > checked;
  if (matches > 0 || !partial) return null;
  return <NudgeCard id="concordance-preview-empty" occurrence={occurrence} className="mb-2 mt-2" />;
}
