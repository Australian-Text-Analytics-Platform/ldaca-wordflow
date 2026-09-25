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
  | 'split'
  | 'count';

export type DataEditorEdit = EditNodeData['body'];

export const DATA_EDITOR_TOOL_LABELS: Record<DataEditorTool, string> = {
  find_replace: 'Find & replace',
  extract: 'Extract text',
  combine: 'Combine columns',
  duplicate: 'Duplicate column',
  clean_text: 'Clean text',
  split: 'Split column',
  count: 'Count',
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
  /** Column scrolled to the panel's left edge; `null` scrolls to the end. */
  scrollAnchor: string | null;
  changedRows: number | null;
  /**
   * First previewed value of the first highlighted column: `undefined` until a
   * preview arrives, `null` when that value is empty.
   */
  previewSample: string | null | undefined;
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
  setDraft: (
    request: DataEditorEdit | null,
    highlightColumns: string[],
    dirty: boolean,
    scrollAnchor?: string | null,
  ) => void;
  setChangedRows: (changedRows: number | null) => void;
  setPreviewSample: (previewSample: string | null | undefined) => void;
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
  scrollAnchor: null,
  changedRows: null,
  previewSample: undefined,
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
  setDraft: (request, highlightColumns, dirty, scrollAnchor = null) => {
    set({
      request,
      highlightColumns,
      scrollAnchor,
      dirty,
      ...(request ? {} : { changedRows: null, previewSample: undefined }),
    });
  },
  setChangedRows: (changedRows) => {
    set({ changedRows });
  },
  setPreviewSample: (previewSample) => {
    set({ previewSample });
  },
  setGraphVisible: (graphVisible) => {
    set({ graphVisible });
  },
}));
