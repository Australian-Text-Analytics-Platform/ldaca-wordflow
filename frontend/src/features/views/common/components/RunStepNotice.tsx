import type { ProgressDetail } from '@/api';
import { useTaskFocusStore } from '@/stores/taskFocusStore';

interface RunStepNoticeProps {
  detail: ProgressDetail;
  taskId: string | null | undefined;
}

/**
 * The analysis page's calm line for a slow run (issue 350): which step it is
 * on, changing only between steps, with live counts, time left and processor
 * use kept in the Tasks panel.
 * Used by: AnalysisRunningStateCard and AnalysisTaskBanner.
 */
export function RunStepNotice({ detail, taskId }: RunStepNoticeProps) {
  const revealTask = useTaskFocusStore((state) => state.revealTask);
  const step =
    detail.steps > 1
      ? `Step ${String(detail.step)} of ${String(detail.steps)}: ${detail.step_label}.`
      : `${detail.step_label}.`;
  return (
    <p className="text-body">
      {step}{' '}
      {taskId ? (
        <button
          type="button"
          className="underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
          onClick={() => {
            revealTask(taskId);
          }}
        >
          Live progress in Tasks
        </button>
      ) : (
        'Live progress is in Tasks.'
      )}
    </p>
  );
}
