/**
 * The one open Data Editor tool (issue 143): which tool, which Data Block it
 * edits, the current preview request, and whether the user changed anything.
 *
 * Shared by the right column (the tool panel replaces the Project Graph while
 * open) and the Data Editor table (which shows the preview). Drafts are never
 * kept per Data Block: switching blocks with unfinished settings asks first.
 */
import { create } from 'zustand';
import type { EditNodeData } from '@/api';

export type DataEditorTool =
  | 'find_replace'
  | 'extract'
  | 'combine'
  | 'duplicate'
  | 'clean_text'
  | 'split';

export type DataEditorEdit = EditNodeData['body'];

export const DATA_EDITOR_TOOL_LABELS: Record<DataEditorTool, string> = {
  find_replace: 'Find & replace',
  extract: 'Extract text',
  combine: 'Combine columns',
  duplicate: 'Duplicate column',
  clean_text: 'Clean text',
  split: 'Split column',
};

interface DataEditorToolState {
  tool: DataEditorTool | null;
  nodeId: string | null;
  nodeName: string;
  /** The Data Block's columns when the tool opened. */
  columns: string[];
  /** Column chosen from a column header menu, pre-filled in the form. */
  initialColumn: string | null;
  /** Pre-selected text cleaning operation, from the Clean text menu. */
  initialOperation: string | null;
  /** The valid edit to preview, or null while the form is incomplete. */
  request: DataEditorEdit | null;
  /** Columns the preview adds or changes, highlighted in the table. */
  highlightColumns: string[];
  changedRows: number | null;
  dirty: boolean;
  /** The Project Graph can be shown again without closing the tool. */
  graphVisible: boolean;
  open: (
    tool: DataEditorTool,
    nodeId: string,
    options: {
      nodeName: string;
      columns: string[];
      column?: string | null;
      operation?: string | null;
    },
  ) => void;
  close: () => void;
  setDraft: (request: DataEditorEdit | null, highlightColumns: string[], dirty: boolean) => void;
  setChangedRows: (changedRows: number | null) => void;
  setGraphVisible: (visible: boolean) => void;
}

const CLOSED = {
  tool: null,
  nodeId: null,
  nodeName: '',
  columns: [],
  initialColumn: null,
  initialOperation: null,
  request: null,
  highlightColumns: [],
  changedRows: null,
  dirty: false,
  graphVisible: false,
} satisfies Partial<DataEditorToolState>;

export const useDataEditorToolStore = create<DataEditorToolState>()((set) => ({
  ...CLOSED,
  open: (tool, nodeId, options) => {
    set({
      ...CLOSED,
      tool,
      nodeId,
      nodeName: options.nodeName,
      columns: options.columns,
      initialColumn: options.column ?? null,
      initialOperation: options.operation ?? null,
    });
  },
  close: () => {
    set(CLOSED);
  },
  setDraft: (request, highlightColumns, dirty) => {
    set({ request, highlightColumns, dirty, ...(request ? {} : { changedRows: null }) });
  },
  setChangedRows: (changedRows) => {
    set({ changedRows });
  },
  setGraphVisible: (graphVisible) => {
    set({ graphVisible });
  },
}));
