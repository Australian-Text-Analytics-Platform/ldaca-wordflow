/**
 * Extracts backend invalid-name messages so project forms can show them inline.
 * Used by: ProjectControls component, useDataLoaderProjectActions hook.
 * Why: because project controls need backend validation failures translated into user-facing name errors.
 * Flow: inspect top-level message text first, then fall back to nested detail payloads before returning no inline error.
 */
export const getInvalidProjectNameMessage = (error: unknown): string | null => {
  const rawMessage = (error as { message?: unknown } | null)?.message;
  if (
    typeof rawMessage === 'string' &&
    rawMessage.toLowerCase().includes('invalid project name')
  ) {
    return rawMessage;
  }

  const detail = (error as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object') {
    const detailMessage =
      (detail as { detail?: unknown; message?: unknown }).detail ??
      (detail as { message?: unknown }).message;
    if (
      typeof detailMessage === 'string' &&
      detailMessage.toLowerCase().includes('invalid project name')
    ) {
      return detailMessage;
    }
  }

  return null;
};
