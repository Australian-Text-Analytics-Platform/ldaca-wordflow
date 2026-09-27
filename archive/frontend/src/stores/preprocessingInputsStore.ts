import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { AnalysisTabInput } from '@/features/views/common/tabs/tabStateOps';

/**
 * Frontend-persisted input node sets for preprocessing subtabs.
 *
 * Unlike completed analyses (whose immutable requests persist server-side),
 * preprocessing subtabs (build, concat, expression, filter, join, replace,
 * slice) keep their add-node-as-needed selection here — in localStorage, scoped
 * by ``(userId, projectId, subtabId)``. Each subtab owns an independent selection so
 * switching subtabs never reconfigures another, and a "Clear all" control maps
 * to {@link clearInputs}. Selections survive reload but are intentionally not
 * round-tripped to the backend (a user often wants different inputs each time).
 *
 * Used by: the preprocessing subtab hooks via ``useNodeInputs`` (value/onChange
 * bound to ``getInputs``/``setInputs`` for that subtab's key).
 */
interface PreprocessingInputsState {
  /** Map of ``"<projectId>::<subtabId>"`` → that subtab's input node set. */
  byKey: Record<string, AnalysisTabInput[]>;
}

interface PreprocessingInputsActions {
  /** Replace the input set for one user/project/subtab key. */
  setInputs: (
    userId: string,
    projectId: string,
    subtabId: string,
    inputs: AnalysisTabInput[],
  ) => void;
  /** Clear the input set for one user/project/subtab key. */
  clearInputs: (userId: string, projectId: string, subtabId: string) => void;
  pruneProjects: (userId: string, projectIds: readonly string[]) => void;
  pruneNodes: (userId: string, projectId: string, nodeIds: readonly string[]) => void;
}

export type PreprocessingInputsStore = PreprocessingInputsState & PreprocessingInputsActions;

/** Builds the composite storage key; null project falls back to a stable sentinel. */
export const preprocessingInputsKey = (
  userId: string | null | undefined,
  projectId: string | null | undefined,
  subtabId: string,
): string => `${userId ?? '__anonymous__'}::${projectId ?? '__none__'}::${subtabId}`;

const projectKeyPrefix = (userId: string, projectId: string): string =>
  `${userId}::${projectId}::`;

export const usePreprocessingInputsStore = create<PreprocessingInputsStore>()(
  devtools(
    persist(
      immer((set) => ({
        byKey: {},

        /** Commits a subtab's add/remove/column change; consumed by useNodeInputs.onChange. */
        setInputs: (userId, projectId, subtabId, inputs) =>
          set((state) => {
            state.byKey[preprocessingInputsKey(userId, projectId, subtabId)] = inputs;
          }),

        /** Backs the per-subtab "Clear all" control. */
        clearInputs: (userId, projectId, subtabId) =>
          set((state) => {
            state.byKey[preprocessingInputsKey(userId, projectId, subtabId)] = [];
          }),

        pruneProjects: (userId, projectIds) =>
          set((state) => {
            const valid = new Set(projectIds);
            state.byKey = Object.fromEntries(
              Object.entries(state.byKey).filter(([key]) => {
                if (!key.startsWith(`${userId}::`)) return true;
                const projectId = key.split('::')[1];
                return projectId ? valid.has(projectId) : false;
              }),
            );
          }),

        pruneNodes: (userId, projectId, nodeIds) =>
          set((state) => {
            const valid = new Set(nodeIds);
            const prefix = projectKeyPrefix(userId, projectId);
            Object.entries(state.byKey).forEach(([key, inputs]) => {
              if (key.startsWith(prefix)) {
                state.byKey[key] = inputs.filter((input) => valid.has(input.node_id));
              }
            });
          }),
      })),
      {
        name: 'ldaca-preprocessing-inputs-v2',
        version: 2,
        /** Persists only the selection map, not devtools metadata. */
        partialize: (state) => ({ byKey: state.byKey }),
      },
    ),
    { name: 'preprocessing-inputs-store' },
  ),
);
