/**
 * A one-shot request to show a task in the Tasks panel (issue 350). An
 * analysis page's "Live progress in Tasks" sets it; the Sidebar opens the
 * Tasks section, the task row expands and scrolls into view, then clears it.
 */
import { create } from 'zustand';

interface TaskFocusState {
  /** Task (Analysis or import) id to show, or null. */
  taskId: string | null;
  /** Increments per request, so asking for the same task again still works. */
  requestId: number;
  revealTask: (taskId: string) => void;
  clearFocus: () => void;
}

export const useTaskFocusStore = create<TaskFocusState>()((set) => ({
  taskId: null,
  requestId: 0,
  revealTask: (taskId) => {
    set((state) => ({ taskId, requestId: state.requestId + 1 }));
  },
  clearFocus: () => {
    set({ taskId: null });
  },
}));
