import { beforeEach, describe, expect, it } from 'vitest';
import { useFreshItemsStore } from '../freshItemsStore';

const reset = () => {
  useFreshItemsStore.setState({
    paths: new Set(),
    projectIds: new Set(),
    scrollRequest: null,
    pendingImportIds: new Set(),
    finishedImports: new Map(),
  });
};

describe('freshItemsStore (issue 443)', () => {
  beforeEach(reset);

  it('marks the folder of an import this session started, when it finishes', () => {
    const store = useFreshItemsStore.getState();
    store.importStarted('import-1');
    expect(useFreshItemsStore.getState().paths.size).toBe(0);
    store.importSucceeded('import-1', 'sample_data/ADO');
    const state = useFreshItemsStore.getState();
    expect([...state.paths]).toEqual(['sample_data/ADO']);
    expect(state.scrollRequest).toMatchObject({ kind: 'path', key: 'sample_data/ADO' });
    expect(state.pendingImportIds.size).toBe(0);
  });

  it('marks an import that finished before its start was recorded', () => {
    const store = useFreshItemsStore.getState();
    store.importSucceeded('import-1', 'ldaca/collection');
    expect(useFreshItemsStore.getState().paths.size).toBe(0);
    store.importStarted('import-1');
    expect([...useFreshItemsStore.getState().paths]).toEqual(['ldaca/collection']);
    expect(useFreshItemsStore.getState().finishedImports.size).toBe(0);
  });

  it('never marks an import this session did not start', () => {
    useFreshItemsStore.getState().importSucceeded('earlier-import', 'sample_data/old');
    expect(useFreshItemsStore.getState().paths.size).toBe(0);
    expect(useFreshItemsStore.getState().scrollRequest).toBeNull();
  });

  it('marks uploads and Projects until cleared, with a new scroll request each time', () => {
    const store = useFreshItemsStore.getState();
    store.markPaths(['a.csv', 'folder']);
    const first = useFreshItemsStore.getState().scrollRequest;
    expect(first).toMatchObject({ kind: 'path', key: 'a.csv' });
    store.markProject('project-1');
    const second = useFreshItemsStore.getState().scrollRequest;
    expect(second).toMatchObject({ kind: 'project', key: 'project-1' });
    expect(second?.id).toBeGreaterThan(first?.id ?? 0);
    store.clearPath('a.csv');
    store.clearProject('project-1');
    expect([...useFreshItemsStore.getState().paths]).toEqual(['folder']);
    expect(useFreshItemsStore.getState().projectIds.size).toBe(0);
  });

  it('ignores an empty upload', () => {
    useFreshItemsStore.getState().markPaths([]);
    expect(useFreshItemsStore.getState().scrollRequest).toBeNull();
  });
});
