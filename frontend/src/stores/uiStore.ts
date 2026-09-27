import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DocumentTarget } from '@/tutorials/documentationRegistry';
import { captureFeedbackContext, type FeedbackContext } from '@/features/feedback/feedbackContext';

interface UIStore {
  feedback: FeedbackContext | null;
  documentTarget: DocumentTarget | null;
  openFeedback: (feature: string) => void;
  closeFeedback: () => void;
  openDocument: (target: DocumentTarget) => void;
  closeDocument: () => void;
}

/** Window-local overlay intent; no persisted active-feature or navigation state. */
export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      feedback: null,
      documentTarget: null,
      openFeedback: (feature) => {
        set({ feedback: captureFeedbackContext(feature) });
      },
      closeFeedback: () => {
        set({ feedback: null });
      },
      openDocument: (documentTarget) => {
        set({ documentTarget });
      },
      closeDocument: () => {
        set({ documentTarget: null });
      },
    }),
    { name: 'ui-store' },
  ),
);
