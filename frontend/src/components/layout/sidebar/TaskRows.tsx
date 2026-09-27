import { useEffect, useState } from 'react';
import { CheckCircle, ChevronDown, Clock, LoaderCircle, Square, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface TaskRow {
  id: string;
  label: string;
  state: 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number | null;
  message?: string;
  detail?: string;
  createdAt?: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  action?: { label: string; disabled?: boolean; run: () => void };
}
const states = {
  queued: { icon: Clock, label: 'Queued', color: 'text-description' },
  running: { icon: LoaderCircle, label: 'Running', color: 'text-warning' },
  cancelling: { icon: LoaderCircle, label: 'Cancelling', color: 'text-description' },
  succeeded: { icon: CheckCircle, label: 'Succeeded', color: 'text-[var(--vscode-charts-green)]' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-error' },
  cancelled: { icon: Square, label: 'Cancelled', color: 'text-description' },
};
const timestamp = (value?: number | null) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
export function TaskRows({ tasks }: { tasks: TaskRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(Date.now);
  const active = tasks.some(
    (task) => !task.finishedAt && ['queued', 'running', 'cancelling'].includes(task.state),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active]);
  if (!tasks.length)
    return (
      <div className="rounded-md bg-list-hover/40 px-3 py-2 text-label-secondary text-description">
        No tasks
      </div>
    );
  return (
    <div className="space-y-1">
      {tasks.map((task) => {
        const meta = states[task.state];
        const Icon = meta.icon;
        const open = expanded.has(task.id);
        const running = ['running', 'cancelling'].includes(task.state);
        const progress = task.progress == null ? undefined : Math.round(task.progress * 100);
        const elapsed = task.startedAt
          ? Math.max(0, Math.floor(((task.finishedAt ?? now) - task.startedAt) / 1000))
          : null;
        return (
          <div
            key={task.id}
            className={cn(
              'rounded-md border bg-editor text-left',
              task.state === 'failed' ? 'border-error' : 'border-surface-border/40',
            )}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-label={`Task: ${task.label}. ${open ? 'Collapse details' : 'Expand details'}`}
              className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
              onClick={() => {
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(task.id)) next.delete(task.id);
                  else next.add(task.id);
                  return next;
                });
              }}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  meta.color,
                  running && 'animate-spin motion-reduce:animate-none',
                )}
              />
              <span className="min-w-0 flex-1 truncate text-label-secondary font-medium text-foreground">
                {task.label}
              </span>
              {running && progress !== undefined && (
                <Progress
                  value={progress}
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${task.label} progress`}
                  className="h-1 w-14 shrink-0"
                />
              )}
              <ChevronDown
                className={cn(
                  'h-3 w-3 shrink-0 text-description transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
            {open && (
              <div className="space-y-2 border-t border-surface-border/40 px-2.5 py-2 text-[11px] text-description">
                <p>
                  {meta.label}
                  {elapsed !== null && ` · ${String(elapsed)}s`}
                  {running && progress !== undefined && ` · ${String(progress)}%`}
                </p>
                {task.message && (
                  <p className="whitespace-pre-wrap wrap-break-word">{task.message}</p>
                )}
                {task.detail && task.detail !== task.message && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-inherit">
                    {task.detail}
                  </pre>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-badge">
                  <dt>Created</dt>
                  <dd>{timestamp(task.createdAt)}</dd>
                  <dt>Started</dt>
                  <dd>{timestamp(task.startedAt)}</dd>
                  <dt>Finished</dt>
                  <dd>{timestamp(task.finishedAt)}</dd>
                </dl>
                {task.action && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      disabled={task.action.disabled}
                      onClick={task.action.run}
                    >
                      {task.action.label}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
