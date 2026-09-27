import { useEffect, useState } from 'react';
import type { NativeTask } from '@/features/project/api';
import { Button } from '@/components/ui/button';

export function AnalysisProgress({
  name,
  task,
  message,
  error,
  onRetry,
  onCancel,
  progress,
  startedAt,
}: {
  name: string;
  task?: NativeTask;
  message?: string;
  error?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  progress?: NativeTask['progress'];
  startedAt?: number;
}) {
  const [now, setNow] = useState(Date.now);
  const running = task?.finished_at === null || (startedAt !== undefined && !error);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]);
  const suppliedProgress = task?.progress ?? progress;
  const fraction = suppliedProgress?.fraction;
  const elapsed = task
    ? Math.max(
        0,
        Math.floor(((task.finished_at ?? now) - (task.started_at ?? task.created_at)) / 1000),
      )
    : startedAt === undefined
      ? null
      : Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <section
      aria-label="Analysis progress"
      className="space-y-3 rounded-lg border border-surface-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{task?.label ?? name}</h2>
        {task && (
          <span className="text-description text-label-secondary">
            {task.state} · {elapsed}s
          </span>
        )}
        {!task && elapsed !== null && (
          <span className="text-description text-label-secondary">{elapsed}s</span>
        )}
      </div>
      <p role={error ? 'alert' : 'status'}>
        {message ?? suppliedProgress?.message ?? 'Submitting…'}
      </p>
      {!error && (
        <progress
          aria-label="Analysis progress"
          className="h-2 w-full accent-primary"
          max={1}
          value={fraction ?? undefined}
        />
      )}
      {fraction != null && <p className="text-description">{Math.round(fraction * 100)}%</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
      {onCancel && (
        <Button variant="outline" disabled={task?.state === 'cancelling'} onClick={onCancel}>
          Cancel
        </Button>
      )}
    </section>
  );
}
