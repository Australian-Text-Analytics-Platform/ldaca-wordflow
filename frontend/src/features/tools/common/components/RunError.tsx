import { OperationError } from '@/features/project/OperationError';
import type { NativeTask } from '@/features/project/tasksApi';

/** Existing task/query state owns failures; this only supplies their visible form. */
export function RunError({
  tabId,
  taskLabel,
  name,
  title = `Could not run ${name}`,
  tasks,
  error,
  active,
  busy,
  onRetry,
}: {
  tabId?: string;
  taskLabel?: string;
  name: string;
  title?: string;
  tasks: NativeTask[];
  error: unknown;
  active: boolean;
  busy: boolean;
  onRetry?: () => void;
}) {
  const accepted = error && typeof error === 'object' && 'taskId' in error && error.taskId;
  const latest = tasks
    .filter((task) =>
      accepted
        ? task.id === accepted
        : tabId
          ? task.tab_id === tabId
          : !task.tab_id && task.label === taskLabel,
    )
    .sort((a, b) => b.created_at - a.created_at)[0];
  const diagnostic = busy
    ? undefined
    : error && !accepted
      ? error
      : latest?.state === 'failed'
        ? latest.error
        : undefined;
  return (
    <div
      data-task-owner={active ? tabId : undefined}
      data-task-label={active ? taskLabel : undefined}
    >
      {active && diagnostic != null && (
        <OperationError
          title={title}
          error={diagnostic}
          taskId={diagnostic === latest?.error ? latest?.id : undefined}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}
