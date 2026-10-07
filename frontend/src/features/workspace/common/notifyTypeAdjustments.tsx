import { toast } from 'sonner';

import type { DtypeNormalizationChange } from '@/api';
import { DetailsDialogButton } from '@/components/errors/ErrorDetails';

/** A change users would notice: times read as UTC, or moved to UTC. */
const isVisible = (change: DtypeNormalizationChange) =>
  change.reason.includes('time zone') ||
  change.reason.includes('converted from') ||
  // Excel times without a date became elapsed time (issue 324).
  change.reason.includes('elapsed time');

/**
 * Tells users when importing a file changed how some columns are stored
 * (issue 205). Changes they would not see (number sizes, time precision) are
 * left out; the rest are listed under Details.
 */
export function notifyTypeAdjustments(changes: readonly DtypeNormalizationChange[]) {
  const visible = changes.filter(isVisible);
  if (visible.length === 0) return;
  const heading =
    visible.length === 1
      ? 'We adjusted 1 column type so Wordflow can use it.'
      : `We adjusted ${String(visible.length)} column types so Wordflow can use them.`;
  const text = visible.map((change) => `${change.column}: ${change.reason}.`).join('\n');
  toast.info(heading, {
    description: (
      <DetailsDialogButton
        text={text}
        title="Column types adjusted"
        explanation="How Wordflow stores these columns. The Data Editor shows each column's type."
        feedback={false}
      />
    ),
    duration: 10_000,
  });
}
