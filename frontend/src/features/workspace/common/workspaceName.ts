/**
 * Extracts backend invalid-name messages so workspace forms can show them inline.
 * Used by: WorkspaceControls component, useDataLoaderWorkspaceActions hook.
 * Why: because workspace controls need backend validation failures translated into user-facing name errors.
 * Flow: inspect top-level message text first, then fall back to nested detail payloads before returning no inline error.
 */
// Older backends said "workspace"; the UI term is now "project" (issue 132).
const isInvalidNameMessage = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes('invalid project name') || lower.includes('invalid workspace name');
};

export const getInvalidWorkspaceNameMessage = (error: unknown): string | null => {
  const rawMessage = (error as { message?: unknown } | null)?.message;
  if (typeof rawMessage === 'string' && isInvalidNameMessage(rawMessage)) {
    return rawMessage;
  }

  const detail = (error as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object') {
    const detailMessage =
      (detail as { detail?: unknown; message?: unknown }).detail ??
      (detail as { message?: unknown }).message;
    if (typeof detailMessage === 'string' && isInvalidNameMessage(detailMessage)) {
      return detailMessage;
    }
  }

  return null;
};
