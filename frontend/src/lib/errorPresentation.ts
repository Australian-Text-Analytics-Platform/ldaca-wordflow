import { ApiError } from '@/lib/apiError';

/**
 * What users read when nobody wrote a message for a failure (issue 205). It
 * matches the backend's message; the technical text goes under Details.
 */
export const UNEXPECTED_ERROR_MESSAGE =
  'Something went wrong in Wordflow. Try again. If it keeps happening, please send feedback with the details.';

/**
 * A "Type: text" diagnostic such as `ValueError: …` or `ComputeError: …`.
 * Written messages never start with an exception class name.
 */
const DIAGNOSTIC = /^[A-Za-z_][\w.]*(?:Error|Exception|Interrupt|Exit|Warning)(?::\s|$)/;

export interface PresentedError {
  /** Plain words for the user. */
  message: string;
  /** Text for the developers, shown under Details; null when there is none. */
  technical: string | null;
}

/**
 * Splits a failure message into plain words and technical details.
 * Used by: toastError, ErrorNotice, and task rows, for messages that arrive
 * as text (analysis and import failures).
 */
export function presentFailureMessage(
  message: string | null | undefined,
  fallback: string,
): PresentedError {
  const text = (message ?? '').trim();
  if (!text) return { message: fallback, technical: null };
  if (DIAGNOSTIC.test(text)) return { message: UNEXPECTED_ERROR_MESSAGE, technical: text };
  return { message: text, technical: null };
}

/** Presents any thrown value: an ApiError, an Error, a string, or nothing useful. */
export function presentError(error: unknown, fallback: string): PresentedError {
  if (error instanceof ApiError) {
    const presented = presentFailureMessage(error.message, fallback);
    const technical = [presented.technical, error.technical].filter(Boolean).join('\n');
    return { message: presented.message, technical: technical || null };
  }
  if (error instanceof Error) return presentFailureMessage(error.message, fallback);
  // A stored failure: `message` for users, `diagnostic` for Details.
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const failure = error as { message: string; diagnostic?: unknown };
    const presented = presentFailureMessage(failure.message, fallback);
    const diagnostic = typeof failure.diagnostic === 'string' ? failure.diagnostic : null;
    return { message: presented.message, technical: diagnostic ?? presented.technical };
  }
  if (typeof error === 'string') return presentFailureMessage(error, fallback);
  return { message: fallback, technical: null };
}
