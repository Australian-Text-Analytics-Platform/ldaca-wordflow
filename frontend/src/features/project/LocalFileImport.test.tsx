import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import * as api from './api';
import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from '@/lib/isTauri';
import { useProjectFileDrop } from './useProjectFileDrop';
vi.mock('./useProjectFileDrop', () => ({ useProjectFileDrop: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@/lib/isTauri', () => ({ isTauri: vi.fn(() => false) }));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('./api', async (load) => ({
  ...(await load<typeof api>()),
  localFileMetadata: vi.fn(),
  querySql: vi.fn(),
  importTables: vi.fn(),
  sampleCatalogue: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(api.localFileMetadata).mockImplementation(async (_base, paths) =>
    paths.map((path) => ({ path, size_bytes: 2048 })),
  );
  vi.mocked(api.importTables).mockResolvedValue({ table_names: ['first', 'second'] });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const props = {
    base: 'http://project',
    active: true,
    onActivate: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={client}>
      <DataLoaderWorkspace {...props} />
    </QueryClientProvider>,
  );
  return {
    ...view,
    props,
    update: (patch: Partial<typeof props>) => {
      Object.assign(props, patch);
      view.rerender(
        <QueryClientProvider client={client}>
          <DataLoaderWorkspace {...props} />
        </QueryClientProvider>,
      );
    },
  };
}
async function add(user: ReturnType<typeof userEvent.setup>, path: string) {
  const input = screen.getByRole('textbox', { name: /Data file path/ });
  await user.clear(input);
  await user.type(input, path);
  await user.click(screen.getByRole('button', { name: 'Choose files…' }));
}
it('imports all columns immediately from a path and recent click, without schema preparation or staging', async () => {
  const user = userEvent.setup();
  setup();
  await add(user, '/tmp/first.csv');
  await waitFor(() =>
    expect(api.importTables).toHaveBeenCalledExactlyOnceWith('http://project', [
      {
        table_name: 'first',
        sql: 'SELECT * FROM read_csv(?)',
        parameters: ['/tmp/first.csv'],
      },
    ]),
  );
  expect(api.querySql).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Import files' })).not.toBeInTheDocument();
  const recent = await screen.findByRole('button', { name: 'Import first.csv' });
  expect(await screen.findByText('2 KB')).toBeInTheDocument();
  expect(within(recent).getByAltText('')).toHaveAttribute('src', '/icons/material/table.svg');
  expect(recent).toHaveAttribute('title', '/tmp/first.csv');
  await user.click(recent);
  await waitFor(() => expect(api.importTables).toHaveBeenCalledTimes(2));
  expect(JSON.parse(localStorage.getItem('wordflow.desktop.recentDataFiles') ?? '[]')).toEqual([
    '/tmp/first.csv',
  ]);
});
it('native chooser and drops import once immediately; cancellation does nothing and a drop opens Local files', async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const user = userEvent.setup();
  const view = setup();
  vi.mocked(open)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(['/tmp/first.csv', '/tmp/second.parquet', '/tmp/first.csv']);
  await user.click(screen.getByRole('button', { name: 'Choose files…' }));
  expect(api.importTables).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Choose files…' }));
  await waitFor(() =>
    expect(api.importTables).toHaveBeenCalledExactlyOnceWith('http://project', [
      { table_name: 'first', sql: 'SELECT * FROM read_csv(?)', parameters: ['/tmp/first.csv'] },
      {
        table_name: 'second',
        sql: 'SELECT * FROM read_parquet(?)',
        parameters: ['/tmp/second.parquet'],
      },
    ]),
  );
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await act(async () => {
    vi.mocked(useProjectFileDrop).mock.calls.at(-1)?.[0](['/tmp/third.JSONL']);
  });
  await waitFor(() =>
    expect(api.importTables).toHaveBeenLastCalledWith('http://project', [
      {
        table_name: 'third',
        sql: 'SELECT * FROM read_json(?)',
        parameters: ['/tmp/third.JSONL'],
      },
    ]),
  );
  expect(screen.getByRole('tab', { name: 'Local files' })).toHaveAttribute('aria-selected', 'true');
  expect(view.props.onActivate).toHaveBeenCalledOnce();
  expect(api.importTables).toHaveBeenCalledTimes(2);
});
it('keeps failed paths for explicit retry and only adds successful imports to recents', async () => {
  vi.mocked(api.importTables).mockRejectedValueOnce(new Error('missing file'));
  const user = userEvent.setup();
  setup();
  await add(user, '/tmp/first.csv');
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: /Data file path/ })).toHaveValue('/tmp/first.csv');
  expect(screen.queryByRole('region', { name: 'Recent files' })).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: /Data file path/ }), '{Enter}');
  await screen.findByRole('button', { name: 'Import first.csv' });
  expect(api.importTables).toHaveBeenCalledTimes(2);
});
it('keeps import actions available during overlapping work and retains progress until all requests finish', async () => {
  let finishFirst!: (value: { table_names: string[] }) => void;
  let finishSecond!: (value: { table_names: string[] }) => void;
  vi.mocked(api.importTables)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    );
  const user = userEvent.setup();
  setup();
  await add(user, '/tmp/first.csv');
  await add(user, '/tmp/second.csv');
  expect(api.importTables).toHaveBeenCalledTimes(2);
  await act(async () => {
    finishSecond({ table_names: ['second'] });
  });
  expect(await screen.findByRole('button', { name: 'Import second.csv' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('Importing files');
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await act(async () => {
    finishFirst({ table_names: ['first'] });
  });
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  await screen.findByRole('button', { name: 'Import first.csv' });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(JSON.parse(localStorage.getItem('wordflow.desktop.recentDataFiles') ?? '[]')).toEqual([
    '/tmp/first.csv',
    '/tmp/second.csv',
  ]);
});
it('shows filesystem sizes and file type icons, with unavailable sizes distinct from empty files', async () => {
  localStorage.setItem(
    'wordflow.desktop.recentDataFiles',
    JSON.stringify(['/a/data.parquet', '/b/data.json', '/c/empty.tsv', '/d/missing.csv']),
  );
  vi.mocked(api.localFileMetadata).mockResolvedValue([
    { path: '/a/data.parquet', size_bytes: 1048576 },
    { path: '/b/data.json', size_bytes: 42 },
    { path: '/c/empty.tsv', size_bytes: 0 },
    { path: '/d/missing.csv', size_bytes: null },
  ]);
  setup();
  expect(await screen.findByText('1 MB')).toBeInTheDocument();
  expect(screen.getByText('42 B')).toBeInTheDocument();
  expect(screen.getByText('0 B')).toBeInTheDocument();
  expect(screen.getByText('File unavailable')).toBeInTheDocument();
  expect(
    within(screen.getByRole('button', { name: 'Import data.parquet' })).getByAltText(''),
  ).toHaveAttribute('src', '/icons/material/database.svg');
  expect(
    within(screen.getByRole('button', { name: 'Import data.json' })).getByAltText(''),
  ).toHaveAttribute('src', '/icons/material/json.svg');
  expect(api.importTables).not.toHaveBeenCalled();
});
