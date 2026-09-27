import { toast, type ExternalToast } from 'sonner';

import { ErrorDetails } from '@/components/errors/ErrorDetails';
import { presentError } from '@/lib/errorPresentation';

interface ToastErrorOptions extends ExternalToast {
  /** A heading for the toast; the error's message then becomes its text. */
  title?: string;
}

/**
 * Shows an error toast in plain words, with technical text under Details
 * (issue 205). Use it instead of `toast.error(error.message)`.
 */
export function toastError(error: unknown, fallback: string, options: ToastErrorOptions = {}) {
  const { title, description, duration, ...rest } = options;
  const { message, technical } = presentError(error, fallback);
  const details = technical ? <ErrorDetails technical={technical} variant="dialog" /> : null;
  const extra = typeof description === 'function' ? description() : description;
  const body =
    title !== undefined ? (
      <>
        <span className="block">{message}</span>
        {extra ? <span className="block">{extra}</span> : null}
        {details}
      </>
    ) : details || extra ? (
      <>
        {extra ? <span className="block">{extra}</span> : null}
        {details}
      </>
    ) : undefined;
  return toast.error(title ?? message, {
    ...rest,
    description: body,
    // Details need time to read and copy.
    duration: technical ? Math.max(duration ?? 0, 15_000) : duration,
  });
}
