import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Utf8 } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import NativeDataView from './NativeDataView';
import type { ProjectDataTableViewModel } from './data-view/components/projectTableModel';
import { objectRef, targetKey, type DataTarget, type ProjectNode } from './api';
import { useProjectPreview } from './previewState';
import { useProjectViewState } from './projectViewState';
import { refreshProjectQueries } from './projectChanges';

const api = vi.hoisted(() => ({
  nodeSchema: vi.fn(),
  rowPage: vi.fn(),
  changeColumn: vi.fn(),
}));
vi.mock('./api', async (original) => ({ ...(await original()), ...api }));
let model: ProjectDataTableViewModel;
vi.mock('./data-view/components/ProjectDataTableView', () => ({
  ProjectDataTableView: (props: { model: ProjectDataTableViewModel }) => {
    model = props.model;
    return null;
  },
}));
const nodes: ProjectNode[] = ['a', 'b'].map((table_name) => ({
  table_name,
  visible: true,
  kind: 'table',
  column_count: 1,
  color: null,
  document_column: null,
  can_undo: false,
}));
beforeEach(() => {
  vi.clearAllMocks();
  useProjectPreview.setState({ active: 'a' });
  useProjectViewState.setState({ nodes: new Map() });
  api.nodeSchema.mockImplementation(async (_base: string, target: DataTarget) => [
    {
      name: objectRef(target).name === 'a' ? 'old' : 'other',
      field: new Field(objectRef(target).name === 'a' ? 'old' : 'other', new Utf8()),
    },
  ]);
  api.rowPage.mockResolvedValue({ columns: ['old'], rows: [{ old: 'text' }], hasMore: false });
});
it('finishes a column rename against its captured node after changing previews', async () => {
  let finish!: () => void;
  api.changeColumn.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const state = useProjectViewState.getState();
  state.update(targetKey('a'), {
    page: 3,
    sorting: [{ id: 'old', desc: false }],
    columns: {
      widths: { old: 340 },
      expanded: { old: true },
      pinning: { start: ['old'], end: [] },
    },
  });
  state.update(targetKey('b'), { page: 2 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (active: string) => (
    <QueryClientProvider client={client}>
      <NativeDataView
        base="project"
        nodes={nodes}
        name={active}
        onClose={vi.fn()}
        rename={vi.fn()}
        undo={vi.fn()}
      />
    </QueryClientProvider>
  );
  const view = render(ui('a'));
  await waitFor(() => expect(api.rowPage).toHaveBeenCalled());
  let operation!: Promise<void>;
  act(() => {
    operation = model.table.onRenameColumn!('old', 'renamed');
  });
  await waitFor(() => expect(api.changeColumn).toHaveBeenCalledTimes(1));
  act(() => useProjectPreview.getState().open('b'));
  view.rerender(ui('b'));
  await waitFor(() => expect(model.header.nodeLabel).toBe('b'));
  await act(async () => {
    finish();
    await operation;
  });
  expect(api.changeColumn).toHaveBeenCalledWith('project', 'a', {
    operation: 'rename',
    column: 'old',
    name: 'renamed',
  });
  expect(useProjectViewState.getState().nodes.get(targetKey('a'))).toMatchObject({
    page: 1,
    sorting: [{ id: 'renamed', desc: false }],
    columns: {
      widths: { renamed: 340 },
      expanded: { renamed: true },
      pinning: { start: ['renamed'], end: [] },
    },
  });
  expect(useProjectViewState.getState().nodes.get(targetKey('b'))?.page).toBe(2);
});

it('does not refetch a closed preview while its exit animation retains the table', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NativeDataView
        base="project"
        nodes={nodes}
        name="a"
        onClose={vi.fn()}
        rename={vi.fn()}
        undo={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(model.loading.nodeData).toBe(false));
  act(() => useProjectPreview.getState().close());
  await act(async () => {
    await client.invalidateQueries();
  });
  expect(api.nodeSchema).toHaveBeenCalledTimes(1);
  expect(api.rowPage).toHaveBeenCalledTimes(1);
});

it('casts an unregistered object in its own schema without touching Data Block metadata', async () => {
  const object = { schema: 'other', name: 'a' };
  useProjectPreview.setState({ active: object });
  api.changeColumn.mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NativeDataView
        base="project"
        nodes={[{ ...nodes[0]!, object, registered: false }]}
        name={object}
        logical={false}
        onClose={vi.fn()}
        rename={vi.fn()}
        undo={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(model.loading.nodeData).toBe(false));
  await act(async () => {
    await model.table.onCast!('value', 'integer');
  });
  expect(api.changeColumn).toHaveBeenCalledWith('project', object, {
    operation: 'cast',
    column: 'value',
    target: 'integer',
    format: undefined,
  });
  expect(model.table.nodeId).toBe(targetKey(object));
  expect(model.table.documentColumn).toBeUndefined();
  expect(model.header.nodeLabel).toBe('other.a');
  expect(model.header.renameValue).toBe('a');
});

it('refetches the open page after a committed lazy cast and exposes read errors', async () => {
  api.changeColumn.mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NativeDataView
        base="project"
        nodes={nodes}
        name="a"
        onClose={vi.fn()}
        rename={vi.fn()}
        undo={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(api.rowPage).toHaveBeenCalledTimes(1));
  await act(async () => {
    await model.table.onCast!('old', 'datetime');
  });
  const failure = new Error('Conversion Error: invalid timestamp');
  api.rowPage.mockRejectedValue(failure);
  // The database commit event, not the mutation callback, owns invalidation.
  await act(async () => {
    await refreshProjectQueries(client, 'project', { objects: [{ schema: 'data', name: 'a' }] });
  });
  await waitFor(() => expect(model.table.pageError).toBe(failure));
  expect(api.rowPage).toHaveBeenCalledTimes(2);
  expect(api.nodeSchema).toHaveBeenCalledTimes(2);
  expect(model.table.data).toEqual([{ old: 'text' }]);
});
