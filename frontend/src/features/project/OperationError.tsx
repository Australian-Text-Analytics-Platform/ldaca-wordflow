import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { recordSessionError } from '@/features/diagnostics/sessionErrors';
import { useUIStore } from '@/stores/uiStore';

/** The form or result that failed owns its original diagnostic and recovery action. */
export function OperationError({
  error,
  title,
  onRetry,
}: {
  error: unknown;
  title: string;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const recorded = useRef<unknown>(undefined);
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : String(error);
  const details =
    error && typeof error === 'object' && 'details' in error
      ? `${message}\n\n${String(error.details)}`
      : message;
  useEffect(() => {
    if (recorded.current === error) return;
    recorded.current = error;
    recordSessionError(error, title);
  }, [error, title]);
  return (
    <div role="alert" className="min-w-0 rounded-md border border-error/40 p-3 text-body">
      <p className="font-medium">{title}</p>
      <p className="line-clamp-3 whitespace-pre-wrap break-words">{message}</p>
      <details className="mt-2">
        <summary className="cursor-pointer">Details</summary>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all">{details}</pre>
      </details>
      <div className="mt-2 flex flex-wrap gap-2">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(details).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied' : 'Copy details'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => useUIStore.getState().openFeedback(title)}
        >
          Feedback
        </Button>
      </div>
    </div>
  );
}
