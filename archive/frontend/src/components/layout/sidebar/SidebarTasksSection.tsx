import { Button } from '@/components/ui/button';
import type { TaskItem } from '@/features/project/task-stream/taskProjection';
import { TaskRows, type TaskRow } from './TaskRows';
interface SidebarTasksSectionProps {
  tasks: TaskItem[];
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  onReconnect: () => void;
  onStopUserFileImport: (importId: string) => void;
  onClearUserFileImport: (importId: string) => void;
  onClearUnavailableAnalysis: (projectId: string, tabId: string) => void;
  stoppingImportId: string | null;
  clearingImportId: string | null;
  clearingAnalysisTabId: string | null;
}

const time = (value?: string | number | null) =>
  value == null ? undefined : typeof value === 'number' ? value : Date.parse(value);
export default function SidebarTasksSection(props: SidebarTasksSectionProps) {
  const priority = (state: string) =>
    ['failed', 'cancelled'].includes(state) ? 0 : ['running', 'queued'].includes(state) ? 1 : 2;
  const tasks: TaskRow[] = props.tasks
    .toSorted(
      (a, b) =>
        priority(a.state) - priority(b.state) ||
        (time(b.finished_at ?? b.started_at ?? b.created_at) ?? 0) -
          (time(a.finished_at ?? a.started_at ?? a.created_at) ?? 0),
    )
    .map((task) => {
      const live = task.state === 'queued' || task.state === 'running';
      const type = task.task_type.replace(/_/g, ' ');
      let action: TaskRow['action'];
      if (task.resource_type === 'user_file_import') {
        const busy =
          props.stoppingImportId === task.task_id || props.clearingImportId === task.task_id;
        action = live
          ? {
              label: busy ? 'Stopping...' : 'Stop',
              disabled: busy,
              run: () => {
                props.onStopUserFileImport(task.task_id);
              },
            }
          : {
              label: busy ? 'Clearing...' : 'Clear',
              disabled: busy,
              run: () => {
                props.onClearUserFileImport(task.task_id);
              },
            };
      } else if (task.task_type === 'analysis_unavailable') {
        action = {
          label: props.clearingAnalysisTabId === task.tab_id ? 'Clearing...' : 'Clear results',
          disabled: props.clearingAnalysisTabId === task.tab_id,
          run: () => {
            props.onClearUnavailableAnalysis(task.workspace_id, task.tab_id);
          },
        };
      }
      return {
        id: task.task_id,
        label: task.name ? `${type}: ${task.name}` : type,
        state: task.state === 'successful' ? 'succeeded' : task.state,
        progress: task.progress,
        message: task.message,
        detail: live ? task.progress_message : undefined,
        createdAt: time(task.created_at),
        startedAt: time(task.started_at),
        finishedAt: time(task.finished_at),
        action,
      };
    });
  const connection =
    props.connectionError ??
    (props.isConnecting ? 'Connecting...' : props.isConnected ? '' : 'Idle');
  return (
    <div className="flex flex-col gap-2">
      {connection && (
        <div className="flex items-center justify-between text-[11px] text-description">
          <span>{connection}</span>
          {props.connectionError && (
            <Button variant="ghost" size="sm" onClick={props.onReconnect}>
              Retry
            </Button>
          )}
        </div>
      )}
      <TaskRows tasks={tasks} />
    </div>
  );
}
