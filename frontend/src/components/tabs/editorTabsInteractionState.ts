interface EditorTabsDragRenderState {
  order: string[] | null;
  tabId: string | null;
  deltaX: number;
  homeLeft: number;
}

interface EditorTabsRenameState {
  /** The tab whose rename box is open; its draft lives in useInlineRename. */
  id: string | null;
}

export interface EditorTabsInteractionState {
  drag: EditorTabsDragRenderState;
  rename: EditorTabsRenameState;
}

export type EditorTabsInteractionAction =
  | { type: 'dragStarted'; tabId: string; order: string[]; homeLeft: number }
  | { type: 'dragMoved'; deltaX: number; order: string[] }
  | { type: 'dragCleared' }
  | { type: 'renameStarted'; tabId: string }
  | { type: 'renameCancelled' };

const idleDragState: EditorTabsDragRenderState = {
  order: null,
  tabId: null,
  deltaX: 0,
  homeLeft: 0,
};

const idleRenameState: EditorTabsRenameState = {
  id: null,
};

/** Creates the reducer-owned drag and rename state for ``EditorTabs``. */
export const createEditorTabsInteractionState = (): EditorTabsInteractionState => ({
  drag: idleDragState,
  rename: idleRenameState,
});

/** Reduces transient tab-strip interaction state independently of the DOM. */
export const editorTabsInteractionReducer = (
  state: EditorTabsInteractionState,
  action: EditorTabsInteractionAction,
): EditorTabsInteractionState => {
  switch (action.type) {
    case 'dragStarted':
      return {
        ...state,
        drag: {
          order: [...action.order],
          tabId: action.tabId,
          deltaX: 0,
          homeLeft: action.homeLeft,
        },
      };
    case 'dragMoved':
      return state.drag.tabId
        ? { ...state, drag: { ...state.drag, deltaX: action.deltaX, order: [...action.order] } }
        : state;
    case 'dragCleared':
      return state.drag.tabId || state.drag.order ? { ...state, drag: idleDragState } : state;
    case 'renameStarted':
      return {
        ...state,
        rename: { id: action.tabId },
      };
    case 'renameCancelled':
      return state.rename.id ? { ...state, rename: idleRenameState } : state;
    default:
      return state;
  }
};
