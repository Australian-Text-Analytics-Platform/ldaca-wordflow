/**
 * Session-only tracking for Data Blocks created by this frontend session.
 *
 * Creation commands call ``markCreated`` with the authoritative IDs returned
 * by the backend. Graph refreshes only reconcile deleted IDs; they never infer
 * creation from a cache miss or query timing. The graph and sidebar call
 * ``markInteracted`` when the user acts on a highlighted Data Block.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

enableMapSet();

interface FreshNodesState {
  freshIdsByProject: Map<string, Set<string>>;
  /** Marks backend-confirmed Data Block creations as new for this session. */
  markCreated(projectId: string, nodeIds: readonly string[]): void;
  /** Removes markers for Data Blocks that no longer belong to the Project. */
  reconcileNodeIds(projectId: string, currentIds: readonly string[]): void;
  /** Clears the new marker after the user's first interaction. */
  markInteracted(projectId: string, nodeIds: readonly string[]): void;
  reset(): void;
}

export const useFreshNodesStore = create<FreshNodesState>()(
  immer((set) => ({
    freshIdsByProject: new Map<string, Set<string>>(),

    markCreated: (projectId, nodeIds) => {
      set((state) => {
        if (!projectId) return;
        const validIds = nodeIds.filter(Boolean);
        if (validIds.length === 0) return;
        const freshIds = state.freshIdsByProject.get(projectId) ?? new Set<string>();
        for (const id of validIds) freshIds.add(id);
        state.freshIdsByProject.set(projectId, freshIds);
      });
    },

    reconcileNodeIds: (projectId, currentIds) => {
      set((state) => {
        const freshIds = state.freshIdsByProject.get(projectId);
        if (!freshIds) return;
        const currentIdSet = new Set(currentIds.filter(Boolean));
        for (const id of freshIds) {
          if (!currentIdSet.has(id)) freshIds.delete(id);
        }
        if (freshIds.size === 0) state.freshIdsByProject.delete(projectId);
      });
    },

    markInteracted: (projectId, nodeIds) => {
      set((state) => {
        const freshIds = state.freshIdsByProject.get(projectId);
        if (!freshIds) return;
        for (const id of nodeIds) {
          if (id) freshIds.delete(id);
        }
        if (freshIds.size === 0) state.freshIdsByProject.delete(projectId);
      });
    },

    reset: () => {
      set((state) => {
        state.freshIdsByProject = new Map();
      });
    },
  })),
);
