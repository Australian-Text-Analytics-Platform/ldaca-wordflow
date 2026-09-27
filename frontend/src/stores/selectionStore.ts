import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface SelectionStore {
  selectedNodeIds: string[];
  removeNode: (nodeId: string) => void;
  replaceSelectedNodes: (nodeIds: string[]) => void;
  toggleNode: (nodeId: string) => void;
  clearSelection: () => void;
}

/** Ordered graph/sidebar membership. The displayed preview is independent of selection. */
export const useSelectionStore = create<SelectionStore>()(
  devtools(
    (set) => ({
      selectedNodeIds: [],
      removeNode: (id) => {
        set((state) => ({ selectedNodeIds: state.selectedNodeIds.filter((node) => node !== id) }));
      },
      replaceSelectedNodes: (ids) => {
        set({ selectedNodeIds: [...new Set(ids.filter(Boolean))] });
      },
      toggleNode: (id) => {
        if (!id) return;
        set((state) => ({
          selectedNodeIds: state.selectedNodeIds.includes(id)
            ? state.selectedNodeIds.filter((node) => node !== id)
            : [...state.selectedNodeIds, id],
        }));
      },
      clearSelection: () => {
        set({ selectedNodeIds: [] });
      },
    }),
    { name: 'selection-store' },
  ),
);
