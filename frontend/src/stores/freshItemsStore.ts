/**
 * Files, folders and Projects that arrived in this session (issue 443): an
 * upload, a sample or LDaCA import, or a Project ZIP import. Their rows pulse
 * like a hint's click target and scroll into view once, until the person
 * clicks in the row, so a new arrival is easy to find. Session-only: nothing
 * is saved, so reopening Wordflow never marks old imports.
 */
import { create } from 'zustand';

interface ScrollRequest {
  kind: 'path' | 'project';
  key: string;
  /** Increments per request, so the same item can be shown again. */
  id: number;
}

interface FreshItemsState {
  /** File and folder paths, relative to the data files root. */
  paths: ReadonlySet<string>;
  projectIds: ReadonlySet<string>;
  scrollRequest: ScrollRequest | null;
  /** Imports started here that haven't finished, by import id. */
  pendingImportIds: ReadonlySet<string>;
  /** Imports that finished before their start was recorded, by import id. */
  finishedImports: ReadonlyMap<string, string>;
  markPaths: (paths: readonly string[]) => void;
  markProject: (projectId: string) => void;
  /** Records an import this session started; its folder is marked when it finishes. */
  importStarted: (importId: string) => void;
  /** Marks a finished import's folder, if this session started the import. */
  importSucceeded: (importId: string, destinationPath: string) => void;
  clearPath: (path: string) => void;
  clearProject: (projectId: string) => void;
  clearScrollRequest: () => void;
}

const withPaths = (state: FreshItemsState, added: readonly string[]) => {
  const paths = added.filter(Boolean);
  if (paths.length === 0) return {};
  const first = paths[0] ?? '';
  return {
    paths: new Set([...state.paths, ...paths]),
    scrollRequest: { kind: 'path' as const, key: first, id: (state.scrollRequest?.id ?? 0) + 1 },
  };
};

export const useFreshItemsStore = create<FreshItemsState>()((set) => ({
  paths: new Set(),
  projectIds: new Set(),
  scrollRequest: null,
  pendingImportIds: new Set(),
  finishedImports: new Map(),
  markPaths: (paths) => {
    set((state) => withPaths(state, paths));
  },
  markProject: (projectId) => {
    set((state) => ({
      projectIds: new Set([...state.projectIds, projectId]),
      scrollRequest: { kind: 'project', key: projectId, id: (state.scrollRequest?.id ?? 0) + 1 },
    }));
  },
  importStarted: (importId) => {
    set((state) => {
      const destination = state.finishedImports.get(importId);
      if (destination === undefined) {
        return { pendingImportIds: new Set([...state.pendingImportIds, importId]) };
      }
      const finishedImports = new Map(state.finishedImports);
      finishedImports.delete(importId);
      return { finishedImports, ...withPaths(state, [destination]) };
    });
  },
  importSucceeded: (importId, destinationPath) => {
    set((state) => {
      if (!state.pendingImportIds.has(importId)) {
        // The finish can be seen before the start request returns.
        return {
          finishedImports: new Map(state.finishedImports).set(importId, destinationPath),
        };
      }
      const pendingImportIds = new Set(state.pendingImportIds);
      pendingImportIds.delete(importId);
      return { pendingImportIds, ...withPaths(state, [destinationPath]) };
    });
  },
  clearPath: (path) => {
    set((state) => {
      if (!state.paths.has(path)) return {};
      const paths = new Set(state.paths);
      paths.delete(path);
      return { paths };
    });
  },
  clearProject: (projectId) => {
    set((state) => {
      if (!state.projectIds.has(projectId)) return {};
      const projectIds = new Set(state.projectIds);
      projectIds.delete(projectId);
      return { projectIds };
    });
  },
  clearScrollRequest: () => {
    set({ scrollRequest: null });
  },
}));
