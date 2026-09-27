import { create } from 'zustand';
import type { Viewport } from '@xyflow/react';
import { objectRef, targetKey, type DataTarget } from './api';

export type GraphMode = 'logical' | 'dependencies';
interface Placement {
  position?: { x: number; y: number };
  measured?: { width: number; height: number };
}
interface GraphState {
  mode: GraphMode;
  selected: string[];
  logical: { nodes: Map<string, Placement>; viewport?: Viewport };
  dependencies: { nodes: Map<string, Placement>; viewport?: Viewport };
  rename: (old: DataTarget, next: DataTarget) => void;
  retain: (mode: GraphMode, ids: Set<string>) => void;
}

/** Each projection owns its canvas; neither owns the shared data preview. */
export const useGraphState = create<GraphState>((set) => ({
  mode: 'logical',
  selected: [],
  logical: { nodes: new Map() },
  dependencies: { nodes: new Map() },
  rename: (old, next) => {
    set((state) => {
      const move = (mode: GraphMode, from: string, to: string) => {
        const nodes = new Map(state[mode].nodes);
        const previous = nodes.get(from);
        nodes.delete(from);
        if (previous) nodes.set(to, previous);
        return { ...state[mode], nodes };
      };
      return {
        logical:
          objectRef(old).schema === 'data'
            ? move('logical', objectRef(old).name, objectRef(next).name)
            : state.logical,
        dependencies: move('dependencies', targetKey(old), targetKey(next)),
        selected: state.selected.map((id) => (id === targetKey(old) ? targetKey(next) : id)),
      };
    });
  },
  retain: (mode, ids) => {
    set((state) => ({
      [mode]: {
        ...state[mode],
        nodes: new Map([...state[mode].nodes].filter(([id]) => ids.has(id))),
      },
      selected:
        mode === 'dependencies' ? state.selected.filter((id) => ids.has(id)) : state.selected,
    }));
  },
}));
