import { useContext } from 'react';
import { ProjectSelectionContext } from '../ServerProjectContext';

/**
 * Reads selected-node state and pagination handlers from ServerProjectProvider.
 * Used by graph controls, `Sidebar`, hint conditions, and feature hooks
 * that need only the current node selection slice.
 * Why: because project chrome and sidebar controls need only selection state and setters from the provider.
 */
export const useProjectSelection = () => {
  const selection = useContext(ProjectSelectionContext);
  if (!selection) {
    throw new Error('useProjectSelection must be used within a ServerProjectProvider');
  }
  return selection;
};
