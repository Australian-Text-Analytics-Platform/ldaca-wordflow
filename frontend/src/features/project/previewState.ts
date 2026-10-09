import { sameTarget, targetKey, type DataTarget } from '@/features/project/objects';
import { create } from 'zustand';
import { initialEditorDraft, type EditorDraft, type EditorTool } from './data-editor/expressions';

export interface EditorSession {
  target: DataTarget;
  tool: EditorTool;
  draft: EditorDraft;
}

interface State {
  active: DataTarget | null;
  editor: EditorSession | null;
  edit: (target: DataTarget, tool: EditorTool, column: string) => void;
  updateEditor: (draft: EditorDraft) => void;
  closeEditor: () => void;
  open: (id: DataTarget) => void;
  toggle: (id: DataTarget) => void;
  close: () => void;
  remove: (id: DataTarget) => void;
  rename: (old: DataTarget, next: DataTarget) => void;
  retain: (names: Set<string>) => void;
  retainObjects: (keys: Set<string>) => void;
}

/** One window-local preview, independent of graph selection and preprocessing inputs. */
export const useProjectPreview = create<State>((set) => ({
  active: null,
  editor: null,
  edit: (target, tool, column) =>
    set({ active: target, editor: { target, tool, draft: initialEditorDraft(column) } }),
  updateEditor: (draft) =>
    set((state) => (state.editor ? { editor: { ...state.editor, draft } } : state)),
  closeEditor: () => set({ editor: null }),
  open: (active) => {
    set((state) => ({
      active,
      editor: sameTarget(state.editor?.target ?? null, active) ? state.editor : null,
    }));
  },
  toggle: (id) => {
    set((state) => ({ active: sameTarget(state.active, id) ? null : id, editor: null }));
  },
  close: () => {
    set({ active: null, editor: null });
  },
  remove: (id) => {
    set((state) => (sameTarget(state.active, id) ? { active: null, editor: null } : state));
  },
  rename: (old, next) => {
    set((state) =>
      sameTarget(state.active, old)
        ? { active: next, editor: state.editor ? { ...state.editor, target: next } : null }
        : state,
    );
  },
  retainObjects: (keys) => {
    set((state) =>
      state.active !== null && !keys.has(targetKey(state.active))
        ? { active: null, editor: null }
        : state,
    );
  },
  retain: (names) => {
    set((state) =>
      typeof state.active === 'string' && !names.has(state.active)
        ? { active: null, editor: null }
        : state,
    );
  },
}));
