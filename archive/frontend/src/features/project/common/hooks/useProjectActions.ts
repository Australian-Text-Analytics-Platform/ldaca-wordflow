import { useContext } from 'react';
import { ProjectActionsContext } from '../ServerProjectContext';

/**
 * Reads project mutation and selection actions from ServerProjectProvider.
 * Used by: DataFolderSettingsPanel, ProjectControls, and project/view features that execute project mutations.
 * Why: because feature controls need the mutation action context slice without importing provider internals.
 */
export const useProjectActions = () => {
  const actions = useContext(ProjectActionsContext);
  if (!actions) {
    throw new Error('useProjectActions must be used within a ServerProjectProvider');
  }
  return actions;
};
