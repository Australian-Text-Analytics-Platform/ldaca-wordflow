import { create } from 'zustand';

export interface SessionError {
  id: string;
  timestamp: string;
  source: 'notification' | 'react' | 'window' | 'rejection';
  title: string;
  message: string;
  details?: string;
  stack?: string;
  taskId?: string;
}

// Window-local diagnostics, deliberately independent of project/query persistence.
export const useSessionErrors = create<{ entries: SessionError[]; clear: () => void }>((set) => ({
  entries: [],
  clear: () => {
    set({ entries: [] });
  },
}));

export function recordSessionError(
  error: unknown,
  title: string,
  source: SessionError['source'] = 'notification',
  taskId?: string,
): SessionError {
  let details: string | undefined;
  if (error && typeof error === 'object') {
    if ('details' in error && typeof error.details === 'string') {
      details = error.details;
    } else if (!(error instanceof Error)) {
      try {
        details = JSON.stringify(error, null, 2);
      } catch {
        // Global rejection reasons can contain circular objects.
      }
    }
  }
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : (details ?? String(error));
  const entry: SessionError = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    title,
    message: message.slice(0, 16_384),
    details: details?.slice(0, 16_384),
    stack: error instanceof Error ? error.stack?.slice(0, 16_384) : undefined,
    taskId,
  };
  useSessionErrors.setState(({ entries }) => ({ entries: [entry, ...entries].slice(0, 200) }));
  return entry;
}

export function formatSessionErrors(entries: readonly SessionError[]) {
  return JSON.stringify(entries, null, 2);
}

export function listenForSessionErrors(target: Window) {
  const onError = (event: ErrorEvent) => {
    recordSessionError(
      event.error ?? new Error(event.message),
      'Unexpected frontend error',
      'window',
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordSessionError(event.reason, 'Unhandled promise rejection', 'rejection');
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
