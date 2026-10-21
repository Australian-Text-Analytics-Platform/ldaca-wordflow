import {
  acceptPreferences,
  defaultPreferences,
  getPreferences,
} from '@/features/preferences/preferences';
import * as projectApi from '@/features/project/api';
import * as filesApi from '@/features/project/filesApi';
import { isTauri } from '@/lib/isTauri';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import { useProjectFileDrop } from './useProjectFileDrop';
vi.mock('./useProjectFileDrop', () => ({ useProjectFileDrop: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@/lib/isTauri', () => ({ isTauri: vi.fn(() => false) }));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('@/features/project/filesApi', async (load) => ({
  ...(await load<object>()),
  localFileMetadata: vi.fn(),
  importFiles: vi.fn(),
  inspectFileImport: vi.fn(),
  sampleCatalogue: vi.fn(),
  browseLdaca: vi.fn(async () => []),
}));
vi.mock('@/features/project/api', async (load) => ({
  ...(await load<object>()),
  querySql: vi.fn(),
}));
beforeEach(() => {
  acceptPreferences(defaultPreferences);
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(filesApi.localFileMetadata).mockImplementation(async (_base, paths) =>
    paths.map((path) => ({ path, size_bytes: 2048 })),
  );
  vi.mocked(filesApi.inspectFileImport).mockImplementation(async (_base, input) => ({
    collection: false,
    text_name: 'selected_files',
    skipped: [],
    files: input.paths.map((path) => ({
      path: path.split('/').at(-1) ?? path,
      format: path.split('.').at(-1) ?? 'csv',
      sheets: [],
    })),
  }));
  vi.mocked(filesApi.importFiles).mockResolvedValue({
    table_names: ['first', 'second'],
    skipped: [],
  });
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
    client,
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
it('uses the preparation task diagnostic for accepted inspection failures and allows retry', async () => {
  const user = userEvent.setup();
  const view = setup();
  view.client.setQueryData(['native', 'http://project', 'tasks'], {
    revision: 1,
    tasks: [
      {
        id: 'prepare-import',
        label: 'Prepare data import',
        state: 'failed',
        created_at: 1,
        started_at: 1,
        finished_at: 2,
        tab_id: null,
        progress: { message: 'Inspecting files and archives', fraction: null },
        notice: null,
        error: { code: 'import_error', message: 'The archive could not be read.' },
      },
    ],
  });
  vi.mocked(filesApi.inspectFileImport).mockRejectedValueOnce(
    Object.assign(new Error('Request failed'), { taskId: 'prepare-import' }),
  );
  await add(user, '/tmp/corpus.zip');
  expect(await screen.findByRole('alert', { name: 'Could not inspect files' })).toHaveTextContent(
    'The archive could not be read.',
  );
  expect(document.querySelector('[data-task-label="Prepare data import"]')).toBeInTheDocument();
  expect(filesApi.importFiles).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(filesApi.importFiles).toHaveBeenCalledOnce());
  expect(filesApi.inspectFileImport).toHaveBeenCalledTimes(2);
});
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
    expect(filesApi.importFiles).toHaveBeenCalledExactlyOnceWith('http://project', {
      paths: ['/tmp/first.csv'],
    }),
  );
  expect(projectApi.querySql).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Import files' })).not.toBeInTheDocument();
  const recent = await screen.findByRole('button', { name: 'Import first.csv' });
  expect(await screen.findByText('2 KB')).toBeInTheDocument();
  expect(within(recent).getByAltText('')).toHaveAttribute('src', '/icons/material/table.svg');
  expect(recent).toHaveAttribute('title', '/tmp/first.csv');
  await user.click(recent);
  await waitFor(() => expect(filesApi.importFiles).toHaveBeenCalledTimes(2));
  expect(getPreferences().recentDataFiles).toEqual(['/tmp/first.csv']);
});
it('native chooser and drops import once immediately; cancellation does nothing and a drop opens Local files', async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const user = userEvent.setup();
  const view = setup();
  vi.mocked(open)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(['/tmp/first.csv', '/tmp/second.parquet', '/tmp/first.csv']);
  await user.click(screen.getByRole('button', { name: 'Choose files…' }));
  expect(filesApi.importFiles).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Choose files…' }));
  await waitFor(() =>
    expect(filesApi.importFiles).toHaveBeenCalledExactlyOnceWith('http://project', {
      paths: ['/tmp/first.csv', '/tmp/second.parquet'],
    }),
  );
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await act(async () => {
    vi.mocked(useProjectFileDrop).mock.calls.at(-1)?.[0](['/tmp/third.JSONL']);
  });
  await waitFor(() =>
    expect(filesApi.importFiles).toHaveBeenLastCalledWith('http://project', {
      paths: ['/tmp/third.JSONL'],
    }),
  );
  expect(screen.getByRole('tab', { name: 'Local files' })).toHaveAttribute('aria-selected', 'true');
  expect(view.props.onActivate).toHaveBeenCalledOnce();
  expect(filesApi.importFiles).toHaveBeenCalledTimes(2);
});
it('keeps failed paths for explicit retry and only adds successful imports to recents', async () => {
  vi.mocked(filesApi.importFiles).mockRejectedValueOnce(new Error('missing file'));
  const user = userEvent.setup();
  setup();
  await add(user, '/tmp/first.csv');
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: /Data file path/ })).toHaveValue('/tmp/first.csv');
  expect(screen.queryByRole('region', { name: 'Recent files' })).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: /Data file path/ }), '{Enter}');
  await screen.findByRole('button', { name: 'Import first.csv' });
  expect(filesApi.importFiles).toHaveBeenCalledTimes(2);
});
it('keeps import actions available during overlapping work and retains progress until all requests finish', async () => {
  let finishFirst!: (value: filesApi.FileImportResult) => void;
  let finishSecond!: (value: filesApi.FileImportResult) => void;
  vi.mocked(filesApi.importFiles)
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
  expect(filesApi.importFiles).toHaveBeenCalledTimes(2);
  await act(async () => {
    finishSecond({ table_names: ['second'], skipped: [] });
  });
  expect(await screen.findByRole('button', { name: 'Import second.csv' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('Importing files');
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await act(async () => {
    finishFirst({ table_names: ['first'], skipped: [] });
  });
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  await screen.findByRole('button', { name: 'Import first.csv' });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(getPreferences().recentDataFiles).toEqual(['/tmp/first.csv', '/tmp/second.csv']);
});
it('shows filesystem sizes and file type icons, with unavailable sizes distinct from empty files', async () => {
  acceptPreferences({
    ...defaultPreferences,
    recentDataFiles: ['/a/data.parquet', '/b/data.json', '/c/empty.tsv', '/d/missing.csv'],
  });
  vi.mocked(filesApi.localFileMetadata).mockResolvedValue([
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
  expect(filesApi.importFiles).not.toHaveBeenCalled();
});

vi.mock('@/features/preferences/preferences', async (load) => {
  const actual = await load<typeof import('@/features/preferences/preferences')>();
  return {
    ...actual,
    patchPreferences: vi.fn(async (patch) => {
      const current = actual.getPreferences();
      actual.acceptPreferences({
        ...current,
        ...patch,
        layout: { ...current.layout, ...patch.layout },
        recentDataFiles: patch.recentDataFiles ?? current.recentDataFiles,
      });
    }),
  };
});

it('defaults to all workbook sheets and imports the chosen contents in one request', async () => {
  vi.mocked(filesApi.inspectFileImport).mockResolvedValue({
    collection: true,
    text_name: 'corpus',
    skipped: [],
    files: [
      { path: 'a.txt', format: 'txt', sheets: [] },
      { path: 'book.xlsx', format: 'xlsx', sheets: ['First', 'Second'] },
      { path: 'single.ods', format: 'ods', sheets: ['Only'] },
    ],
  });
  const user = userEvent.setup();
  setup();
  await add(user, '/tmp/corpus');
  const choices = await screen.findByRole('region', { name: 'Choose import contents' });
  expect(filesApi.importFiles).not.toHaveBeenCalled();
  const checks = within(choices).getAllByRole('checkbox');
  for (const check of checks) expect(check).toBeChecked();
  expect(within(choices).queryByText('Only')).not.toBeInTheDocument();
  await user.click(within(choices).getByLabelText('First'));
  await user.click(within(choices).getByRole('button', { name: 'Import selected' }));
  await waitFor(() =>
    expect(filesApi.importFiles).toHaveBeenCalledExactlyOnceWith('http://project', {
      paths: ['/tmp/corpus'],
      selected: [
        { path: 'a.txt', sheet: null },
        { path: 'book.xlsx', sheet: 'Second' },
        { path: 'single.ods', sheet: 'Only' },
      ],
    }),
  );
});
it('uses the native folder picker and keeps inspection failures beside the import controls', async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(open).mockResolvedValueOnce(['/tmp/corpus']);
  vi.mocked(filesApi.inspectFileImport).mockRejectedValueOnce(new Error('No supported input'));
  const user = userEvent.setup();
  setup();
  await user.click(screen.getByRole('button', { name: 'Choose folders…' }));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true, multiple: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No supported input');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(filesApi.importFiles).toHaveBeenCalledOnce());
});
