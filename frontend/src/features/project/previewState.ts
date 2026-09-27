import { create } from 'zustand';
import { sameTarget, targetKey, type DataTarget } from './api';

interface State {
  active: DataTarget | null;
  open: (id: DataTarget) => void;
  toggle: (id: DataTarget) => void;
  close: () => void;
  remove: (id: DataTarget) => void;
  rename: (old: DataTarget, next: DataTarget) => void;
  retain: (names: Set<string>) => void;
  retainObjects: (keys: Set<string>) => void;
}

/** One window-local preview, independent of graph selection and preprocessing inputs. */
export const useProjectPreview = create<State>((set) => ({
  active: null,
  open: (active) => {
    set({ active });
  },
  toggle: (id) => {
    set((state) => ({ active: sameTarget(state.active, id) ? null : id }));
  },
  close: () => {
    set({ active: null });
  },
  remove: (id) => {
    set((state) => (sameTarget(state.active, id) ? { active: null } : state));
  },
  rename: (old, next) => {
    set((state) => (sameTarget(state.active, old) ? { active: next } : state));
  },
  retainObjects: (keys) => {
    set((state) =>
      state.active !== null && !keys.has(targetKey(state.active)) ? { active: null } : state,
    );
  },
  retain: (names) => {
    set((state) =>
      typeof state.active === 'string' && !names.has(state.active) ? { active: null } : state,
    );
  },
}));
