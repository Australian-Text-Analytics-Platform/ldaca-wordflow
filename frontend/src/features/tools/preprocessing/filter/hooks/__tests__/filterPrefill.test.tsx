import { act, renderHook, waitFor } from '@testing-library/react';
import { Field, Int64 } from 'apache-arrow';
import { expect, it, vi } from 'vite-plus/test';
import { useFilterSubTabSections } from '../useFilterSubTabSections';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/features/project/api', () => ({ querySql: query }));
vi.mock('../../../hooks/useNodePreviewWithRawFallback', () => ({
  useNodePreviewWithRawFallback: () => ({ data: [], columns: [] }),
}));
it('does not overwrite edited bounds or accept bounds for another source, and retains zero', async () => {
  const releases: ((value: unknown) => void)[] = [];
  query.mockImplementation((_base, statements) =>
    statements[0].sql.includes('missing_count')
      ? Promise.resolve({ get: () => ({ missing_count: 0 }) })
      : new Promise((resolve) => releases.push(resolve)),
  );
  const props = {
    projectBase: 'project',
    selectedNodeId: 'first',
    selectedNode: null,
    columnOptions: [{ name: 'number', typeName: 'Int64', field: new Field('number', new Int64()) }],
    filterNode: vi.fn(),
    filterPreview: vi.fn(),
    isLoading: { operations: false },
    onAlert: vi.fn(),
  };
  const { result, rerender } = renderHook(
    ({ source }) => useFilterSubTabSections({ ...props, selectedNodeId: source }),
    { initialProps: { source: 'first' } },
  );
  const change = (field: 'column' | 'operator' | 'value', value: string) =>
    act(() => result.current.conditionBuilder.onConditionChange('1', field, value));
  change('column', 'number');
  change('operator', 'gte');
  await waitFor(() => expect(releases).toHaveLength(1));
  change('value', '9007199254740993');
  await act(async () =>
    releases[0]!({ get: () => ({ minimum: '0', maximum: '30', median: '15' }) }),
  );
  expect(result.current.conditionBuilder.conditions[0]?.value).toBe('9007199254740993');
  change('operator', 'between');
  await waitFor(() => expect(releases).toHaveLength(2));
  rerender({ source: 'second' });
  await act(async () => releases[1]!({ get: () => ({ minimum: '1', maximum: '20' }) }));
  expect(result.current.conditionBuilder.conditions[0]?.value).toEqual({ start: null, end: null });
  change('operator', 'gte');
  await waitFor(() => expect(releases).toHaveLength(3));
  await act(async () => releases[2]!({ get: () => ({ minimum: '0', maximum: '20' }) }));
  expect(result.current.conditionBuilder.conditions[0]?.value).toBe('0');
});
