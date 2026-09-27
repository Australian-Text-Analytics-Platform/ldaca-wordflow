import { TaskRows } from '@/components/layout/sidebar/TaskRows';
import type { NativeTask } from './api';

export function TaskCentre({
  tasks,
  reconnecting,
  cancel,
  dismiss,
  cancellingId,
  dismissingId,
}: {
  tasks: NativeTask[];
  reconnecting: boolean;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  cancellingId?: string;
  dismissingId?: string;
}) {
  return (
    <div className="space-y-2">
      {reconnecting && (
        <p role="status" className="text-[11px] text-description">
          Reconnecting to task updates…
        </p>
      )}
      <TaskRows
        tasks={tasks.map((task) => ({
          id: task.id,
          label: task.label,
          state: task.state,
          progress: task.progress?.fraction,
          message: task.finished_at === null ? task.progress?.message : undefined,
          detail: task.error?.message,
          createdAt: task.created_at,
          startedAt: task.started_at,
          finishedAt: task.finished_at,
          action:
            task.finished_at === null
              ? {
                  label: task.state === 'cancelling' ? 'Cancelling…' : 'Cancel',
                  disabled: task.state === 'cancelling' || cancellingId === task.id,
                  run: () => {
                    cancel(task.id);
                  },
                }
              : {
                  label: 'Dismiss',
                  disabled: dismissingId === task.id,
                  run: () => {
                    dismiss(task.id);
                  },
                },
        }))}
      />
    </div>
  );
}
