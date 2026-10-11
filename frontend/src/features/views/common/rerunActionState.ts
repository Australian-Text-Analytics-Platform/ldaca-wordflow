/**
 * Execution and Clear-button policy shared by every Analysis view.
 *
 * The owning Tab's attached Analysis, not Result availability, determines
 * whether Clear is available. Active Analyses cannot be replaced; failed and
 * cancelled roots require Clear; successful Analyses require an exact request
 * change before their corresponding action is enabled again. A view whose
 * new submission replaces the Tab's finished Analyses (Annotation) may run
 * again after a failed or cancelled run without Clear.
 */
export interface RerunActionStateInput {
  hasWorkspace: boolean;
  /** Inputs + any required params form a runnable request. */
  isRunnable: boolean;
  /** The backend Tab currently references a root Analysis. */
  hasAttachedAnalysis: boolean;
  /** The backend Tab contains any Analysis, used by the tab-wide Clear action. */
  hasAnyAnalysis?: boolean;
  /** Latest projected lifecycle state for the attached Analysis, when available. */
  analysisState: 'queued' | 'running' | 'successful' | 'succeeded' | 'failed' | 'cancelled' | null;
  /** Current params or node inputs differ from the last run. */
  hasChanges: boolean;
  /** A failed or cancelled root requires Clear Results before either action can run. */
  requiresClear?: boolean;
  /** A new submission replaces failed or cancelled Analyses, so Clear isn't needed first. */
  rerunWithoutClear?: boolean;
  isBusy?: boolean;
}

export interface RerunActionState {
  runDisabled: boolean;
  clearDisabled: boolean;
  runDisabledReason: string | undefined;
  clearDisabledReason: string | undefined;
}

/**
 * Derives an execution action's disabled state and the tab-wide Clear state.
 * Called by: analysis features when rendering Preview, Run, or Run All.
 * Flow: invalid/busy/active/clear-required → disabled; no attached Analysis →
 * enabled; successful Analysis → enabled only after an execution-request change.
 */
export const getRerunActionState = ({
  hasWorkspace,
  isRunnable,
  hasAttachedAnalysis,
  hasAnyAnalysis = hasAttachedAnalysis,
  analysisState,
  hasChanges,
  requiresClear = false,
  rerunWithoutClear = false,
  isBusy = false,
}: RerunActionStateInput): RerunActionState => {
  const isActiveAnalysis = analysisState === 'queued' || analysisState === 'running';
  const isUnfinishedState = analysisState === 'failed' || analysisState === 'cancelled';
  const isClearRequiredState = isUnfinishedState && !rerunWithoutClear;
  const attachedStateUnavailable = hasAttachedAnalysis && analysisState === null;

  const runDisabled =
    !hasWorkspace ||
    !isRunnable ||
    isBusy ||
    isActiveAnalysis ||
    requiresClear ||
    isClearRequiredState ||
    attachedStateUnavailable ||
    (hasAttachedAnalysis && !hasChanges && !isUnfinishedState);

  const clearDisabled = !hasWorkspace || !hasAnyAnalysis || isBusy || isActiveAnalysis;
  const clearDisabledReason = !hasWorkspace
    ? 'Open a Project first'
    : !hasAnyAnalysis
      ? 'There are no results to clear'
      : isBusy || isActiveAnalysis
        ? 'Stop the running analysis before clearing results'
        : undefined;

  const runDisabledReason: string | undefined = (() => {
    if (isBusy) return undefined;
    if (!hasWorkspace) return 'Open a Project first';
    if (!isRunnable) return 'Add a Data Block and select a column to run';
    if (isActiveAnalysis) return 'The analysis is already queued or running';
    if (requiresClear || isClearRequiredState) return 'Choose Clear before running again';
    if (attachedStateUnavailable) return 'Clear the current analysis before running again';
    if (hasAttachedAnalysis && !hasChanges && !isUnfinishedState) {
      return 'Change a parameter or the selection to run again';
    }
    return undefined;
  })();

  return { runDisabled, clearDisabled, runDisabledReason, clearDisabledReason };
};
