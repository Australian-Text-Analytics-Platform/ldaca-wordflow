import React from 'react';
import type { ProgressDetail } from '@/api';

/** No report from a running task for this long suggests the worker stopped. */
const SILENT_AFTER_MS = 2 * 60 * 1000;
/** Counts unchanged this long, with the processors idle, may mean a stuck run. */
const STALLED_AFTER_SECONDS = 10 * 60;
/** Below this many processors' worth of work, the run counts as idle. */
const IDLE_PROCESSORS = 0.1;

const formatMinutes = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${String(minutes)} min`;
};

/**
 * Shows a slow run is alive (issue 350): how many processors it is using,
 * and a calm note when its counts have not moved for a while with the
 * processors idle, or when no report has arrived for two minutes.
 * Used by: SidebarTasksSection for an expanded running task.
 */
export function TaskLiveness({ detail }: { detail: ProgressDetail }) {
  // Time since the last report, measured on a 15-second tick.
  const lastReport = React.useRef(0);
  const [silentMs, setSilentMs] = React.useState(0);
  React.useEffect(() => {
    lastReport.current = Date.now();
  }, [detail]);
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setSilentMs(Date.now() - lastReport.current);
    }, 15_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const busy = detail.processors_busy;
  // AI annotation spends most of its time waiting for the provider (issue 370).
  const provider = detail.waiting_for === 'ai_provider';
  const stalled =
    (detail.stalled_seconds ?? 0) >= STALLED_AFTER_SECONDS &&
    busy !== null &&
    busy !== undefined &&
    busy < IDLE_PROCESSORS;

  return (
    <div className="space-y-1 text-[11px] text-description" data-testid="task-liveness">
      {busy !== null && busy !== undefined ? (
        <p>
          {busy < IDLE_PROCESSORS
            ? provider
              ? 'Waiting for the AI provider.'
              : 'Waiting: the processors are idle.'
            : `Working: using ${busy.toLocaleString(undefined, { maximumFractionDigits: 1 })}${
                detail.processors ? ` of ${String(detail.processors)}` : ''
              } processors.`}
        </p>
      ) : null}
      {silentMs >= SILENT_AFTER_MS ? (
        <p className="text-warning">
          No update from this run for {formatMinutes(silentMs / 1000)}. It may have stopped; you can
          stop it from its tab.
        </p>
      ) : stalled ? (
        <p className="text-warning">
          {provider
            ? `No answer from the AI provider for ${formatMinutes(detail.stalled_seconds ?? 0)}.`
            : `No progress for ${formatMinutes(detail.stalled_seconds ?? 0)} and the processors are idle.`}{' '}
          The run may be stuck; you can stop it from its tab.
        </p>
      ) : null}
    </div>
  );
}
