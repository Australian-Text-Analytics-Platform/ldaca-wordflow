import { useContext } from 'react';
import { ProjectDataContext } from '../ServerProjectContext';

/**
 * Reads project graph/data state from the data slice context.
 * Used by: DataFolderSettingsPanel, useProjectDataTable, and project/view features that read the current project slice.
 * Why: because data-view consumers need only the project data context slice without subscribing to actions or status.
 */
export const useProjectData = () => {
  const data = useContext(ProjectDataContext);
  if (!data) {
    throw new Error('useProjectData must be used within a ServerProjectProvider');
  }
  return data;
};
