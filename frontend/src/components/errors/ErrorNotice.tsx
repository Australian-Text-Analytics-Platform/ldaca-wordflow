import { cn } from '@/lib/utils';
import { presentError } from '@/lib/errorPresentation';

import { ErrorDetails } from './ErrorDetails';

/**
 * An error shown in place, such as a failed analysis in its tab (issue 205):
 * the message in plain words, with any technical text under Details.
 */
export function ErrorNotice({
  error,
  fallback = 'Something went wrong.',
  className,
}: {
  error: unknown;
  fallback?: string;
  className?: string;
}) {
  const { message, technical } = presentError(error, fallback);
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border border-error/30 bg-error/10 px-4 py-3 text-body text-error',
        className,
      )}
    >
      <p className="whitespace-pre-wrap wrap-break-word">{message}</p>
      {technical ? <ErrorDetails technical={technical} /> : null}
    </div>
  );
}
