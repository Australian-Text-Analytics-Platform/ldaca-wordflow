import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatSessionErrors, useSessionErrors, type SessionError } from './sessionErrors';

export function SessionErrors() {
  const entries = useSessionErrors((state) => state.entries);
  const clear = useSessionErrors((state) => state.clear);
  const [status, setStatus] = useState('');
  const copy = async (items: SessionError[]) => {
    try {
      await navigator.clipboard.writeText(formatSessionErrors(items));
      setStatus('Copied error details.');
    } catch {
      setStatus('Could not copy. Select and copy the expanded details instead.');
    }
  };
  return (
    <section className="min-w-0 space-y-3 border-t border-surface-border pt-4">
      <h3 className="text-body font-semibold">Diagnostics</h3>
      <details className="min-w-0">
        <summary className="cursor-pointer rounded-sm text-body font-medium focus-visible:outline-2 focus-visible:outline-focus">
          Session errors ({entries.length})
        </summary>
        <p className="mt-2 text-body-secondary text-description">
          The latest 200 errors in this window. Cleared on reload; not saved in your project.
        </p>
        <div className="my-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!entries.length}
            onClick={() => void copy(entries)}
          >
            Copy all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!entries.length}
            onClick={() => {
              clear();
              setStatus('Error history cleared.');
            }}
          >
            Clear
          </Button>
        </div>
        <p role="status" className="text-body-secondary text-description">
          {status}
        </p>
        <div className="max-h-72 min-w-0 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-body text-description">No errors recorded in this window.</p>
          ) : (
            entries.map((entry) => (
              <details key={entry.id} className="min-w-0 border-t border-surface-border py-2">
                <summary className="cursor-pointer break-words text-body focus-visible:outline-2 focus-visible:outline-focus">
                  <span className="font-medium">{entry.title}</span>{' '}
                  <time dateTime={entry.timestamp} className="text-body-secondary text-description">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </time>
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-body">{entry.message}</p>
                {entry.details && (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-body-secondary text-description">
                    {entry.details}
                  </pre>
                )}
                {entry.taskId && (
                  <p className="mt-1 break-all text-body-secondary text-description">
                    Task: {entry.taskId}
                  </p>
                )}
                {entry.stack && (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-body-secondary text-description">
                    {entry.stack}
                  </pre>
                )}
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => void copy([entry])}
                >
                  Copy details
                </Button>
              </details>
            ))
          )}
        </div>
      </details>
    </section>
  );
}
