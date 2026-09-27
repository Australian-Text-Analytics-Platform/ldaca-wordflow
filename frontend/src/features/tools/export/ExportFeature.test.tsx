import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import ExportFeature from './ExportFeature';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  exportProject: vi.fn(),
  inspectExport: vi.fn(),
  dependencyGraph: vi.fn(),
}));
const nodes = ['visible', 'hidden', 'Unicode 数据'].map(
  (table_name): api.ProjectNode => ({
    table_name,
    visible: table_name !== 'hidden',
    color: null,
    document_column: null,
    kind: 'table',
    column_count: 2,
    can_undo: false,
  }),
);
beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(api.exportProject).mockReset().mockResolvedValue(null);
  vi.mocked(api.inspectExport)
    .mockReset()
    .mockResolvedValue({
      summary: { data_blocks: 0, hidden_data_blocks: 0, analyses: 0, sql_cells: 0 },
      objects: [],
      blockers: [],
    });
  vi.mocked(api.dependencyGraph)
    .mockReset()
    .mockResolvedValue({
      edges: [],
      nodes: nodes.map((node) => ({
        object: api.objectRef(node.table_name),
        kind: 'table',
        registered: true,
        visible: node.visible,
        color: null,
        column_count: 2,
        can_undo: false,
      })),
    });
});
function setup() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ExportFeature
        base="http://test"
        nodes={nodes}
        graphSelection={[api.objectRef('visible')]}
        active
      />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it('defaults to CSV, selects only visible search matches, and retains choices after cancelled save', async () => {
  const user = setup();
  expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add data block' }));
  expect(screen.queryByRole('button', { name: 'hidden', exact: true })).not.toBeInTheDocument();
  await user.type(screen.getByPlaceholderText('Search data blocks…'), 'Unicode');
  await user.click(screen.getByRole('button', { name: 'Add all (1)' }));
  await user.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() =>
    expect(api.exportProject).toHaveBeenCalledWith('http://test', {
      kind: 'files',
      objects: [api.objectRef('Unicode 数据')],
      format: 'csv',
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeEnabled(),
  );
  expect(screen.getByText('Unicode 数据')).toBeVisible();
  expect(api.inspectExport).not.toHaveBeenCalled();
});
it('uses graph selection, explicitly includes hidden blocks and captures one multi-file request', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Use graph selection' }));
  await user.click(
    screen.getByRole('checkbox', { name: 'Include hidden and other schema objects' }),
  );
  await waitFor(() => expect(api.dependencyGraph).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Add data block' }));
  await user.click(screen.getByRole('button', { name: 'hidden', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() =>
    expect(api.exportProject).toHaveBeenCalledWith('http://test', {
      kind: 'files',
      objects: [api.objectRef('visible'), api.objectRef('hidden')],
      format: 'csv',
    }),
  );
});
it('blocks project export on dependency errors and allows retry after selection changes', async () => {
  vi.mocked(api.inspectExport).mockResolvedValue({
    summary: { data_blocks: 0, hidden_data_blocks: 0, analyses: 0, sql_cells: 0 },
    objects: [],
    blockers: [{ code: 'export_dependency', message: 'child requires parent' }],
  });
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Use graph selection' }));
  await user.click(screen.getByRole('tab', { name: 'Wordflow project' }));
  expect(await screen.findByText('child requires parent')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  vi.mocked(api.inspectExport).mockResolvedValue({
    summary: { data_blocks: 0, hidden_data_blocks: 0, analyses: 0, sql_cells: 0 },
    objects: [],
    blockers: [],
  });
  await user.click(screen.getByRole('combobox', { name: 'Project scope' }));
  await user.click(screen.getByRole('option', { name: 'Complete project' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() =>
    expect(api.exportProject).toHaveBeenCalledWith('http://test', { kind: 'complete_project' }),
  );
});
