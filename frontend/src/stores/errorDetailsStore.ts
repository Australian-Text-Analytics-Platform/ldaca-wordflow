import { create } from 'zustand';

export interface DetailsDialogContent {
  /** The text on show, which the dialog lets people copy. */
  text: string;
  title: string;
  explanation: string;
  /** Offer Send feedback, for errors. */
  feedback: boolean;
}

interface ErrorDetailsState {
  details: DetailsDialogContent | null;
  show: (details: DetailsDialogContent) => void;
  close: () => void;
}

/**
 * The one Details dialog (issue 205). Toasts open it here rather than owning
 * it, so it stays open when the toast that opened it times out.
 */
export const useErrorDetailsStore = create<ErrorDetailsState>((set) => ({
  details: null,
  show: (details) => {
    set({ details });
  },
  close: () => {
    set({ details: null });
  },
}));
