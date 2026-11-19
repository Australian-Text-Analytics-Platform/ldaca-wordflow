import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';

/** Why Add to Project waits while only Preview Results are showing. */
export const PREVIEW_ADD_TO_PROJECT_REASON =
  'These are Preview Results. Only the Results of a full Run can be added to the Project: press Run first.';

/** Why Download waits while only Preview Results are showing. */
export const PREVIEW_DOWNLOAD_REASON =
  'These are Preview Results. Only the Results of a full Run can be downloaded: press Run first.';

/** Why both actions wait while a Run is still going. */
const RUNNING_RESULT_ACTION_REASON = 'Available when the Run finishes';

interface PreviewResultActionsProps {
  /** Names the Results in the Download button's label, such as "Concordance Results". */
  resultsLabel: string;
  /** A full Run is in progress, so the actions wait for it rather than for Run. */
  running?: boolean;
}

/**
 * Download and Add to Project, disabled, in the header of Preview Results (Chao).
 * Used by: Concordance and Quotation, whose Results can be downloaded or added
 * only after a full Run. Keeping both buttons in place, with tooltips saying why
 * they wait, tells people they are looking at a Preview, even when the
 * parameters pane is scrolled away or the Results are maximised.
 */
export function PreviewResultActions({ resultsLabel, running = false }: PreviewResultActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <DisabledReasonTooltip
        reason={running ? RUNNING_RESULT_ACTION_REASON : PREVIEW_DOWNLOAD_REASON}
        side="bottom"
      >
        <Button variant="outline" size="sm" aria-label={`Download ${resultsLabel}`} disabled>
          <Download className="h-4 w-4" />
        </Button>
      </DisabledReasonTooltip>
      <DisabledReasonTooltip
        reason={running ? RUNNING_RESULT_ACTION_REASON : PREVIEW_ADD_TO_PROJECT_REASON}
        side="bottom"
      >
        <Button type="button" disabled>
          Add to Project
        </Button>
      </DisabledReasonTooltip>
    </div>
  );
}
