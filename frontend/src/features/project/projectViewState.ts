import { create } from 'zustand';
import {
  defaultTablePreferences,
  type TablePreferences,
} from './data-view/components/projectTableFeatures';
import type { SortingState } from '@tanstack/react-table';
export interface NodeViewState {
  page: number;
  size: number;
  sorting: SortingState;
  columns: TablePreferences;
}
export const defaultNodeView: NodeViewState = {
  page: 1,
  size: 20,
  sorting: [],
  columns: defaultTablePreferences,
};
interface State {
  nodes: Map<string, NodeViewState>;
  update: (name: string, patch: Partial<NodeViewState>) => void;
  rename: (old: string, next: string) => void;
  changeColumn: (name: string, from: string, to?: string) => void;
  reconcileColumns: (name: string, columns: Set<string>) => void;
  retain: (names: Set<string>) => void;
}
/** Window-local table state survives node renames and Save As. */
export const useProjectViewState = create<State>((set) => ({
  nodes: new Map(),
  update: (name, patch) => {
    set((s) => ({
      nodes: new Map(s.nodes).set(name, { ...(s.nodes.get(name) ?? defaultNodeView), ...patch }),
    }));
  },
  rename: (old, next) => {
    set((s) => {
      const nodes = new Map(s.nodes);
      const previous = nodes.get(old);
      nodes.delete(old);
      if (previous) nodes.set(next, previous);
      return { nodes };
    });
  },
  changeColumn: (name, from, to) => {
    set((s) => {
      const view = s.nodes.get(name) ?? defaultNodeView;
      const rename = (names: string[]) => names.flatMap((n) => (n !== from ? [n] : to ? [to] : []));
      const renameKeys = <T>(values: Record<string, T>) =>
        Object.fromEntries(
          Object.entries(values).flatMap(([key, value]) =>
            key !== from ? [[key, value]] : to ? [[to, value]] : [],
          ),
        );
      return {
        nodes: new Map(s.nodes).set(name, {
          ...view,
          page: 1,
          sorting: view.sorting.flatMap((sort) =>
            sort.id !== from ? [sort] : to ? [{ ...sort, id: to }] : [],
          ),
          columns: {
            widths: renameKeys(view.columns.widths),
            expanded: renameKeys(view.columns.expanded),
            pinning: {
              start: rename(view.columns.pinning.start),
              end: rename(view.columns.pinning.end),
            },
          },
        }),
      };
    });
  },
  reconcileColumns: (name, columns) => {
    set((s) => {
      const view = s.nodes.get(name);
      if (!view) return s;
      const existing = [
        ...view.sorting.map((sort) => sort.id),
        ...Object.keys(view.columns.widths),
        ...Object.keys(view.columns.expanded),
        ...view.columns.pinning.start,
        ...view.columns.pinning.end,
      ];
      if (existing.every((column) => columns.has(column))) return s;
      const keep = <T>(values: Record<string, T>) =>
        Object.fromEntries(Object.entries(values).filter(([column]) => columns.has(column)));
      return {
        nodes: new Map(s.nodes).set(name, {
          ...view,
          page: 1,
          sorting: view.sorting.filter((sort) => columns.has(sort.id)),
          columns: {
            widths: keep(view.columns.widths),
            expanded: keep(view.columns.expanded),
            pinning: {
              start: view.columns.pinning.start.filter((column) => columns.has(column)),
              end: view.columns.pinning.end.filter((column) => columns.has(column)),
            },
          },
        }),
      };
    });
  },
  retain: (names) => {
    set((s) => ({
      nodes: new Map([...s.nodes].filter(([name]) => names.has(name))),
    }));
  },
}));
