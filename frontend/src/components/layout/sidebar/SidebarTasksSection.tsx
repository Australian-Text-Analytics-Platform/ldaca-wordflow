import React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle,
  ChevronDown,
  Clock,
  Square,
  XCircle,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TaskItem } from '@/features/workspace/task-stream/taskProjection';

import { MiddleFadeLabel } from './MiddleFadeLabel';
import { buildTaskRows, type TaskRowTarget, type TaskTab } from './taskRows';

/** Task states treated as attention-worthy in the sidebar task list. */
const PROBLEMATIC_STATES = new Set(['failed', 'cancelled']);

/** Display metadata consumed by task rows to keep icon, label, and color consistent. */
const DEFAULT_STATUS_META = {
  icon: AlertCircle,
  className: 'text-description',
  label: 'Unknown',
};
const STATUS_META: Record<string, { icon: typeof Clock; className: string; label: string }> = {
  running: { icon: Clock, className: 'text-warning', label: 'Running' },
  queued: { icon: Clock, className: 'text-description', label: 'Queued' },
  successful: {
    icon: CheckCircle,
    className: 'text-[var(--vscode-charts-green)]',
    label: 'Successful',
  },
  failed: { icon: XCircle, className: 'text-error', label: 'Failed' },
  cancelled: { icon: Square, className: 'text-description', label: 'Cancelled' },
  default: DEFAULT_STATUS_META,
};

interface SidebarTasksSectionProps {
  tasks: TaskItem[];
  /** Analysis tabs by id, for task names (issue 199). */
  tabsById?: ReadonlyMap<string, TaskTab>;
  /** Data Block names by id, for task details. */
  nodeNameById?: ReadonlyMap<string, string>;
  /** Opens a task's analysis tab, or the Data Loader for file imports. */
  onOpenTarget?: (target: TaskRowTarget) => void;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  onReconnect: () => void;
  onStopUserFileImport: (importId: string) => void;
  onClearUserFileImport: (importId: string) => void;
  onClearUnavailableAnalysis: (workspaceId: string, tabId: string) => void;
  stoppingImportId: string | null;
  clearingImportId: string | null;
  clearingAnalysisTabId: string | null;
}

/** Called by: SidebarTasksSection sorting and expanded timestamp formatting. */
const normalizeTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
};

/** Called by: SidebarTasksSection expanded task detail rows. */
const formatTimestamp = (value: unknown): string => {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) return 'Not recorded';
  return new Date(timestamp).toLocaleString();
};

/**
 * Task stream section used inside the sidebar. It shows connection health,
 * prioritizes active/problematic jobs, and lets users expand rows for backend
 * task timing/progress details.
 * Rendered by: Sidebar's Tasks section because task stream health and recent job state need to stay visible beside navigation.
 * Flow: sort tasks by priority and timestamp, manage expanded rows, then render connection status, retry action, and task details.
 */
const EMPTY_TABS: ReadonlyMap<string, TaskTab> = new Map();
const EMPTY_NAMES: ReadonlyMap<string, string> = new Map();

function SidebarTasksSection({
  tasks,
  tabsById = EMPTY_TABS,
  nodeNameById = EMPTY_NAMES,
  onOpenTarget,
  isConnected,
  isConnecting,
  connectionError,
  onReconnect,
  onStopUserFileImport,
  onClearUserFileImport,
  onClearUnavailableAnalysis,
  stoppingImportId,
  clearingImportId,
  clearingAnalysisTabId,
}: SidebarTasksSectionProps) {
  const rows = buildTaskRows(Array.isArray(tasks) ? tasks : [], tabsById, nodeNameById);

  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(() => new Set());

  /** Called by: SidebarTasksSection task row click and keyboard handlers. */
  const toggleExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  /** Called by: SidebarTasksSection row rendering for task status icons and labels. */
  const statusMeta = (status?: string) => STATUS_META[status ?? ''] ?? DEFAULT_STATUS_META;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty-string error should still fall through to live connection status
  const connectionLabel = connectionError
    ? connectionError
    : isConnecting
      ? 'Connecting...'
      : isConnected
        ? ''
        : 'Idle';

  return (
    <div className="flex flex-col gap-2">
      {connectionLabel && (
        <div className="flex items-center justify-between text-[11px] text-description">
          <span>{connectionLabel}</span>
          {connectionError && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-error"
              onClick={onReconnect}
              title="Retry connection"
            >
              Retry
            </Button>
          )}
        </div>
      )}
      <TooltipProvider delayDuration={400}>
        <div className="space-y-1">
          {rows.length ? (
            rows.map((row) => {
              const task = row.primary;
              const meta = statusMeta(row.state);
              const StatusIcon = meta.icon;
              const rawProgress = Math.max(0, Math.min(1, task.progress ?? 0));
              const progressPercent = Math.round(rawProgress * 100);
              const hasProgressValue = typeof task.progress === 'number' && task.progress >= 0;
              const isComplete =
                hasProgressValue && progressPercent >= 100 && task.state === 'successful';
              const showProgress =
                hasProgressValue &&
                !isComplete &&
                (task.state === 'running' || task.state === 'successful');
              const expanded = expandedTaskIds.has(row.key);
              const label = row.label;
              const combined = row.steps.length > 1;
              const isUserFileImport = task.resource_type === 'user_file_import';
              const canStop =
                isUserFileImport && (task.state === 'queued' || task.state === 'running');
              const canClearImport =
                isUserFileImport &&
                (task.state === 'successful' ||
                  task.state === 'failed' ||
                  task.state === 'cancelled');
              const canClearAnalysis =
                task.resource_type === 'analysis' && task.task_type === 'analysis_unavailable';
              const canClear = canClearImport || canClearAnalysis;
              const isStopping = stoppingImportId === task.task_id;
              const isClearing =
                clearingImportId === task.task_id ||
                (task.resource_type === 'analysis' && clearingAnalysisTabId === task.tab_id);

              return (
                <div
                  key={row.key}
                  className={cn(
                    'rounded-md border bg-editor text-left transition-colors',
                    PROBLEMATIC_STATES.has(row.state.toLowerCase())
                      ? 'border-error bg-error-background/50'
                      : 'border-surface-border/40',
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    aria-label={`Task: ${label}. ${expanded ? 'Collapse details' : 'Expand details'}`}
                    className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    onClick={() => {
                      toggleExpanded(row.key);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      toggleExpanded(row.key);
                    }}
                  >
                    <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', meta.className)} />
                    <MiddleFadeLabel
                      text={label}
                      className="flex-1 text-label-secondary font-medium text-foreground"
                    />
                    {showProgress && (
                      <Progress
                        value={progressPercent}
                        className={cn('h-1 w-14 shrink-0', {
                          'bg-[color-mix(in_srgb,var(--vscode-charts-green)_20%,transparent)] **:data-[slot=progress-indicator]:bg-[var(--vscode-charts-green)]':
                            task.state === 'successful',
                        })}
                      />
                    )}
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 shrink-0 text-description transition-transform',
                        expanded && 'rotate-180',
                      )}
                    />
                    {row.target && onOpenTarget ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={
                              row.target.kind === 'tab' ? `Open ${label}` : 'Open the Data Loader'
                            }
                            className="-mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-description hover:bg-list-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (row.target) onOpenTarget(row.target);
                            }}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {row.target.kind === 'tab' ? `Open ${label}` : 'Open the Data Loader'}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>

                  {expanded && combined && (
                    <ul
                      aria-label={`${label} steps`}
                      className="space-y-1.5 border-t border-surface-border/40 px-2.5 py-2"
                    >
                      {row.steps.map((stepItem) => (
                        <li key={stepItem.task.task_id} className="text-badge text-description">
                          <span className="font-semibold text-foreground">{stepItem.label}</span>
                          {stepItem.blocks.length > 0 ? `: ${stepItem.blocks.join(', ')}` : null}
                          <span className="block">
                            {formatTimestamp(stepItem.task.finished_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {expanded && !combined && (
                    <div className="space-y-2 border-t border-surface-border/40 px-2.5 py-2">
                      {showProgress && (
                        <div className="space-y-1">
                          <Progress
                            value={progressPercent}
                            className={cn('h-1.5', {
                              'bg-[color-mix(in_srgb,var(--vscode-charts-green)_20%,transparent)] **:data-[slot=progress-indicator]:bg-[var(--vscode-charts-green)]':
                                task.state === 'successful',
                            })}
                          />
                          <p className="text-badge text-description">{progressPercent}%</p>
                        </div>
                      )}
                      {task.message && (
                        <p className="whitespace-pre-wrap wrap-break-word text-[11px] text-description">
                          {task.message}
                        </p>
                      )}
                      {(task.state === 'queued' || task.state === 'running') &&
                        task.progress_message &&
                        task.progress_message !== task.message && (
                          <p className="text-[11px] text-description">{task.progress_message}</p>
                        )}
                      {row.steps[0] && row.steps[0].blocks.length > 0 ? (
                        <p className="text-badge text-description">
                          <span className="font-semibold text-foreground">
                            {row.steps[0].label}
                          </span>
                          {`: ${row.steps[0].blocks.join(', ')}`}
                        </p>
                      ) : null}
                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-badge text-description">
                        <dt>Created</dt>
                        <dd className="truncate">{formatTimestamp(task.created_at)}</dd>
                        <dt>Started</dt>
                        <dd className="truncate">{formatTimestamp(task.started_at)}</dd>
                        <dt>Finished</dt>
                        <dd className="truncate">{formatTimestamp(task.finished_at)}</dd>
                      </dl>
                      {(canStop || canClear) && (
                        <div className="flex justify-end border-t border-surface-border/40 pt-2">
                          {canStop ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={isStopping || isClearing}
                              onClick={() => {
                                onStopUserFileImport(task.task_id);
                              }}
                            >
                              {isStopping ? 'Stopping...' : 'Stop'}
                            </Button>
                          ) : null}
                          {canClear ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={isStopping || isClearing}
                              onClick={() => {
                                if (task.resource_type === 'analysis') {
                                  onClearUnavailableAnalysis(task.workspace_id, task.tab_id);
                                } else {
                                  onClearUserFileImport(task.task_id);
                                }
                              }}
                            >
                              {isClearing
                                ? 'Clearing...'
                                : canClearAnalysis
                                  ? 'Clear results'
                                  : 'Clear'}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-md bg-list-hover/40 px-3 py-2 text-label-secondary text-description">
              No tasks
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

export default SidebarTasksSection;
