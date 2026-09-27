import { useContext } from 'react';
import { ProjectStatusContext } from '../ServerProjectContext';

/**
 * Reads project loading/error state from the sliced ServerProjectProvider context.
 * Used by `ConcordanceFeature` and `DataPreprocessingFeature` to gate actions
 * while project operations are active.
 * Why: because analysis and project controls need loading/error/operation state without subscribing to data or actions.
 */
export const useProjectStatus = () => {
  const status = useContext(ProjectStatusContext);
  if (!status) {
    throw new Error('useProjectStatus must be used within a ServerProjectProvider');
  }
  return status;
};
