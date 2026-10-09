import { TaskRows } from '@/components/layout/sidebar/TaskRows';
import type { NativeTask } from '@/features/project/tasksApi';
import type { Tab } from '@/features/tools/common/analysisApi';

export function TaskCentre({
  tasks,
  reconnecting,
  cancel,
  dismiss,
  cancellingId,
  dismissingId,
  tabs = [],
  openTab,
}: {
  tasks: NativeTask[];
  reconnecting: boolean;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  cancellingId?: string;
  dismissingId?: string;
  tabs?: Tab[];
  openTab?: (tab: Tab) => void;
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
          label: tabs.find((tab) => tab.id === task.tab_id)?.name ?? task.label,
          state: task.state,
          progress: task.progress?.fraction,
          message: task.finished_at === null ? task.progress?.message : (task.notice ?? undefined),
          openTab:
            openTab && tabs.some((tab) => tab.id === task.tab_id)
              ? () => {
                  const tab = tabs.find((tab) => tab.id === task.tab_id);
                  if (tab) openTab(tab);
                }
              : undefined,
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
