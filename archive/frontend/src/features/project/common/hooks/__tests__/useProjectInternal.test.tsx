import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useProjectCoreMock = vi.hoisted(() => vi.fn());
const useProjectQueriesMock = vi.hoisted(() => vi.fn());
const useProjectNodeMutationsMock = vi.hoisted(() => vi.fn());
const useIsMutatingMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useIsMutating: useIsMutatingMock,
}));

vi.mock('../useProjectCore', () => ({ useProjectCore: useProjectCoreMock }));
vi.mock('../useProjectQueries', () => ({ useProjectQueries: useProjectQueriesMock }));
vi.mock('../useProjectNodeMutations', () => ({
  useProjectNodeMutations: useProjectNodeMutationsMock,
}));

import { useProjectInternal } from '../useProjectInternal';

const coreDefaults = {
  isAuthenticated: true,
  userId: 'user-1',
  activeNodeId: null,
  selectedNodeIds: [],
  activateNode: vi.fn(),
  reorderSelectedNodes: vi.fn(),
  removeNode: vi.fn(),
  replaceSelectedNodes: vi.fn(),
  toggleNode: vi.fn(),
  clearSelection: vi.fn(),
};

const queryDefaults = {
  projectCatalogue: [],
  projects: [],
  currentProject: null,
  projectGraph: null,
  nodes: [],
  selectedNode: null,
  selectedNodes: [],
  queryLoadingState: {},
  currentProjectId: null,
  projectsHydrated: true,
  nodesHydrated: true,
};

const renderInternal = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useProjectInternal(), { wrapper });
};

describe('useProjectInternal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIsMutatingMock.mockReturnValue(0);
    useProjectCoreMock.mockReturnValue({ ...coreDefaults });
    useProjectQueriesMock.mockReturnValue({ ...queryDefaults });
    useProjectNodeMutationsMock.mockReturnValue({ actions: { createProject: vi.fn() } });
  });

  it('selects nothing when the backend reports no open Project', () => {
    useProjectCoreMock.mockReturnValue({
      ...coreDefaults,
      isAuthenticated: false,
    });
    const { result } = renderInternal();
    expect(result.current.currentProjectId).toBeNull();
    expect(result.current.currentProject).toBeNull();
  });

  it('clears local Data Block selection when the backend open Project changes', () => {
    const clearSelection = vi.fn();
    useProjectCoreMock.mockReturnValue({ ...coreDefaults, clearSelection });
    useProjectQueriesMock.mockReturnValue({
      ...queryDefaults,
      currentProjectId: 'project-1',
    });
    const { rerender } = renderInternal();
    useProjectQueriesMock.mockReturnValue({
      ...queryDefaults,
      currentProjectId: 'project-2',
    });
    rerender();
    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it('combines operation loading with query loading', () => {
    useIsMutatingMock.mockReturnValue(1);
    useProjectQueriesMock.mockReturnValue({
      ...queryDefaults,
      queryLoadingState: { projects: true },
    });
    const { result } = renderInternal();
    expect(result.current.isLoading).toMatchObject({ operations: true, projects: true });
  });

  it('exposes selected project and graph data from the local selection plus canonical queries', () => {
    useProjectCoreMock.mockReturnValue({ ...coreDefaults, activeNodeId: 'node-1' });
    useProjectQueriesMock.mockReturnValue({
      ...queryDefaults,
      currentProject: { id: 'project-1' },
      currentProjectId: 'project-1',
      projectGraph: { nodes: [{ id: 'node-1' }] },
    });
    const { result } = renderInternal();
    expect(result.current.currentProjectId).toBe('project-1');
    expect(result.current.activeNodeId).toBe('node-1');
    expect(result.current.projectGraph).toEqual({ nodes: [{ id: 'node-1' }] });
  });
});
