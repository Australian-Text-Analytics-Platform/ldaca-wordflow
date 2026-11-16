import { create } from 'zustand';

import type { CodebookRow } from './taskContext';

/**
 * Unsaved changes in the Edit codebook window, kept per Annotation tab and
 * codebook until Save or a confirmed discard (Chao, 15 Nov 2026). An AI draft
 * cost a request and typed codes cost effort, so an accidental Esc, a click
 * outside, or switching tab or tool must not lose either. Held in memory for
 * this session only: a reload loses them, and they are never written to the
 * Project.
 */
interface CodebookEditorDraft {
  rows: CodebookRow[];
  taskContext: string;
  /** The codes are levels of an ordered scale, lowest first. */
  scale: boolean;
  /** The designer's codes, while the draft is still the AI draft. */
  designedSignature: string | null;
}

interface CodebookDraftState {
  drafts: Record<string, CodebookEditorDraft>;
  setDraft: (key: string, draft: CodebookEditorDraft) => void;
  clearDraft: (key: string) => void;
}

export const useCodebookDraftStore = create<CodebookDraftState>((set) => ({
  drafts: {},
  setDraft: (key, draft) => {
    set((state) => ({ drafts: { ...state.drafts, [key]: draft } }));
  },
  clearDraft: (key) => {
    set((state) => {
      if (!(key in state.drafts)) return state;
      const { [key]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    });
  },
}));

/** One draft per tab and codebook (Data Block and its two columns). */
export const codebookDraftKey = (parts: readonly (string | null | undefined)[]): string =>
  parts.map((part) => part ?? '').join('|');
