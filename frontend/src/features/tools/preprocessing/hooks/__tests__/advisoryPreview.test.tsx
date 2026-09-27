import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { Field, Utf8 } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';
import { inputNode } from '@/test/nodeMetadata';
import { useFilterSubTabSections } from '../../filter/hooks/useFilterSubTabSections';
import { useReplaceSubTab } from '../../replace/hooks/useReplaceSubTab';
import { useBuildSubTab } from '../../build/hooks/useBuildSubTab';
const preview = vi.hoisted(() => vi.fn());
vi.mock('../usePreprocessingPreview', () => ({ usePreprocessingPreview: preview }));
vi.mock('../useNodePreviewWithRawFallback', () => ({ useNodePreviewWithRawFallback: preview }));
vi.mock('@/features/project/api', () => ({
  identifier: (s: string) => s,
  querySql: vi.fn().mockResolvedValue({ get: () => ({ missing_count: 0 }) }),
}));
const field = new Field('text', new Utf8());
const node = inputNode({ id: 'source', name: 'source' });
const common = {
  projectBase: 'project',
  isLoading: { operations: false },
  onAlert: vi.fn(),
};
describe('preview is advisory', () => {
  it.each(['loading', 'failed', 'empty'])(
    'permits complete Filter, Find and Build requests when preview is %s',
    async (state) => {
      preview.mockReturnValue({
        data: [],
        columns: [],
        loading: state === 'loading',
        error: state === 'failed' ? 'preview failed' : null,
        refresh: vi.fn(),
      });
      const filterNode = vi.fn();
      const { result: filter } = renderHook(() =>
        useFilterSubTabSections({
          ...common,
          selectedNodeId: 'source',
          selectedNode: node,
          columnOptions: [{ name: 'text', typeName: 'Utf8', field }],
          filterNode,
          filterPreview: vi.fn(),
        }),
      );
      act(() => {
        filter.current.conditionBuilder.onConditionChange('1', 'column', 'text');
      });
      act(() => {
        filter.current.conditionBuilder.onConditionChange('1', 'operator', 'is_null');
      });
      expect(filter.current.applyButtonDisabled).toBe(false);
      await act(async () => {
        await filter.current.applyFilter();
      });
      expect(filterNode).toHaveBeenCalledOnce();
      const replaceText = vi.fn();
      const { result: find } = renderHook(() =>
        useReplaceSubTab({
          ...common,
          selectedNodes: [node],
          getColumnInfos: () => [{ name: 'text', typeName: 'Utf8', field }],
          replaceText,
          replaceTextPreview: vi.fn(),
        }),
      );
      act(() => {
        find.current.setPattern('[');
      });
      expect(find.current.canApply).toBe(true);
      await act(async () => {
        await find.current.handleApply();
      });
      expect(replaceText).toHaveBeenCalledOnce();
      const buildColumnApply = vi.fn().mockResolvedValue({ table_name: 'new' });
      const { result: build } = renderHook(
        () =>
          useBuildSubTab({
            ...common,
            selectedNodes: [node],
            getColumnInfos: () => [{ name: 'text', typeName: 'Utf8', field }],
            buildColumnApply,
            buildColumnPreview: vi.fn(),
          }),
        {
          wrapper: ({ children }) => (
            <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
          ),
        },
      );
      act(() => {
        build.current.addPart({ id: 'text', kind: 'column', column: 'text', operations: [] });
      });
      expect(build.current.apply.canApply).toBe(true);
      await act(async () => {
        await build.current.apply.handleApply();
      });
      expect(buildColumnApply).toHaveBeenCalledOnce();
    },
  );
});
