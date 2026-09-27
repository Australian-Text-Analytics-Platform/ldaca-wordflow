import { create } from 'zustand';

interface ErrorDetailsState {
  /** The technical text on show, or null when the dialog is closed. */
  technical: string | null;
  show: (technical: string) => void;
  close: () => void;
}

/**
 * The one Error details dialog (issue 205). Toasts open it here rather than
 * owning it, so it stays open when the toast that opened it times out.
 */
export const useErrorDetailsStore = create<ErrorDetailsState>((set) => ({
  technical: null,
  show: (technical) => {
    set({ technical });
  },
  close: () => {
    set({ technical: null });
  },
}));
