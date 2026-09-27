import type { ProjectTableProps } from './ProjectTable';
export interface ProjectDataTableHeaderInfo {
  nodeLabel: string;
  renameValue?: string;
  isEmptyTable: boolean;
  canUndo: boolean;
}

interface ProjectDataTableNodeActions {
  onClose: () => void;
  undoTitle?: string;
  redoTitle?: string;
  onRename?: (newName: string) => void;
  onUndo?: () => void;
}

export interface ProjectDataTableViewModel {
  selectedNode: { id: string } | null;
  header: ProjectDataTableHeaderInfo;
  nodeActions: ProjectDataTableNodeActions;
  table: ProjectTableProps;
  loading: {
    nodeData: boolean;
  };
}
