import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONTEXTUAL_HINT_IDS } from '@/features/guidance/registry';
import { useDataLoaderGuidance } from '../useDataLoaderGuidance';

const publish = vi.fn();

vi.mock('@/features/guidance/useProgressiveContextualHints', () => ({
  useProgressiveContextualHints: (ids: readonly string[]) => publish(ids),
}));

describe('useDataLoaderGuidance', () => {
  beforeEach(() => publish.mockClear());

  it('waits for stable project and file state', () => {
    renderHook(() =>
      useDataLoaderGuidance({
        currentProjectId: null,
        loadingFiles: true,
        nodeCount: 0,
        totalFileCount: 0,
        projectBusy: true,
        projectCount: 0,
      }),
    );
    expect(publish).toHaveBeenLastCalledWith([]);
  });

  it('publishes the mutually exclusive create and load branches', () => {
    const { rerender } = renderHook(
      (projectCount) =>
        useDataLoaderGuidance({
          currentProjectId: null,
          loadingFiles: false,
          nodeCount: 0,
          totalFileCount: 0,
          projectBusy: false,
          projectCount,
        }),
      { initialProps: 0 },
    );
    expect(publish).toHaveBeenLastCalledWith([CONTEXTUAL_HINT_IDS.dataLoader.project]);
    rerender(1);
    expect(publish).toHaveBeenLastCalledWith([CONTEXTUAL_HINT_IDS.dataLoader.projectLoad]);
  });

  it('catches up through every reached active-Project milestone', () => {
    const { rerender } = renderHook(
      ({ nodeCount, totalFileCount }) =>
        useDataLoaderGuidance({
          currentProjectId: 'project-1',
          loadingFiles: false,
          nodeCount,
          totalFileCount,
          projectBusy: false,
          projectCount: 1,
        }),
      { initialProps: { nodeCount: 0, totalFileCount: 0 } },
    );
    expect(publish).toHaveBeenLastCalledWith([
      CONTEXTUAL_HINT_IDS.dataLoader.activeProject,
      CONTEXTUAL_HINT_IDS.dataLoader.fileSources,
    ]);

    rerender({ nodeCount: 1, totalFileCount: 1 });
    expect(publish).toHaveBeenLastCalledWith([
      CONTEXTUAL_HINT_IDS.dataLoader.activeProject,
      CONTEXTUAL_HINT_IDS.dataLoader.fileSources,
      CONTEXTUAL_HINT_IDS.dataLoader.addDataBlock,
      CONTEXTUAL_HINT_IDS.dataLoader.dataBlocks,
    ]);
  });
});
