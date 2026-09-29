/**
 * A one-shot request to show a folder in the Data Loader's file tree
 * (issue 235). The Tasks panel sets it when a finished import's go-to button
 * is clicked; FileTree opens the folder's parents, selects it, scrolls to it,
 * and clears the request.
 */
import { create } from 'zustand';

interface FileRevealState {
  /** Folder path to show, relative to the data files root, or null. */
  path: string | null;
  /** Increments per request, so asking for the same folder again still works. */
  requestId: number;
  requestReveal: (path: string) => void;
  clearReveal: () => void;
}

export const useFileRevealStore = create<FileRevealState>()((set) => ({
  path: null,
  requestId: 0,
  requestReveal: (path) => {
    set((state) => ({ path, requestId: state.requestId + 1 }));
  },
  clearReveal: () => {
    set({ path: null });
  },
}));
