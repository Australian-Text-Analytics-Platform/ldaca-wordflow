import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { ServerContext } from '@/features/server/context';
import { useUploads } from '@/features/server/uploads';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';

const api = vi.hoisted(() => ({
  request: vi.fn(),
  upload: vi.fn(),
  import: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock('@/api/client', async (load) => ({ ...(await load<object>()), request: api.request }));
vi.mock('@/features/server/api', () => ({
  uploadFile: api.upload,
  importFiles: api.import,
  inspectImport: api.inspect,
}));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => false }));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('./NativeSampleImport', () => ({ default: () => null }));
vi.mock('./NativeLdacaImport', () => ({ default: () => null }));

let files: { name: string; size: number; modified: null }[];
beforeEach(() => {
  vi.clearAllMocks();
  useUploads.setState({ cards: [], revision: 0, visibleLibraries: {} });
  files = [];
  api.request.mockResolvedValue({ json: async () => files });
  api.upload.mockImplementation(async (_base, _library, file: File) => {
    const stored = { name: file.name, size: file.size, modified: null };
    files.push(stored);
    return stored;
  });
  api.inspect.mockResolvedValue({ files: [{ format: 'csv', sheets: [] }], collection: false });
  api.import.mockResolvedValue({ table_names: ['corpus'], skipped: [] });
});

function mount() {
  const onActivate = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ServerContext
        value={{
          base: '/prefix',
          status: {
            project_id: 'current-session',
            project: { title: 'Research', path: null, schema_version: 1 },
          },
          projects: [],
          select: vi.fn(),
          refresh: vi.fn(),
        }}
      >
        <DataLoaderWorkspace
          base="/prefix/project/current-session"
          active
          onActivate={onActivate}
        />
        <div data-project-file-drop="graph" aria-label="Data Block graph">
          Graph
        </div>
      </ServerContext>
    </QueryClientProvider>,
  );
  return { onActivate };
}

it('uploads rounded-area drops without importing and explains direct graph imports', async () => {
  mount();
  await screen.findByText(
    'Drop files here to upload, or onto the graph to add them directly to your project.',
  );
  expect(screen.queryByRole('heading', { name: 'Data files' })).not.toBeInTheDocument();
  expect(
    screen.queryByText('Drop files here or onto the graph to upload and import them.'),
  ).not.toBeInTheDocument();
  const file = new File(['text\nhello'], 'corpus.csv');
  fireEvent.drop(screen.getByLabelText('Drop data files to upload'), {
    dataTransfer: { files: [file], types: ['Files'] },
  });
  await screen.findByText('corpus.csv');
  expect(api.upload).toHaveBeenCalledExactlyOnceWith(
    '/prefix',
    'data',
    file,
    expect.any(AbortSignal),
    expect.any(Function),
    'corpus.csv',
  );
  expect(api.import).not.toHaveBeenCalled();
});

it('rejects file drops on the tab and controls without navigating away', async () => {
  mount();
  const file = new File(['text\nhello'], 'corpus.csv');
  const dataTransfer = { files: [file], types: ['Files'], dropEffect: 'copy' };
  const heading = screen.getByRole('heading', { name: 'Data Loader' });
  expect(fireEvent.dragOver(heading, { dataTransfer })).toBe(false);
  expect(dataTransfer.dropEffect).toBe('none');
  expect(fireEvent.drop(heading, { dataTransfer })).toBe(false);
  fireEvent.drop(screen.getByRole('textbox', { name: 'Search data files' }), { dataTransfer });
  expect(api.upload).not.toHaveBeenCalled();
  expect(api.import).not.toHaveBeenCalled();
});

it('uploads and imports graph drops once into the current project', async () => {
  const { onActivate } = mount();
  const file = new File(['text\nhello'], 'corpus.csv');
  fireEvent.drop(screen.getByLabelText('Data Block graph'), {
    dataTransfer: { files: [file], types: ['Files'] },
  });
  await waitFor(() =>
    expect(api.import).toHaveBeenCalledExactlyOnceWith('/prefix', 'current-session', [
      'corpus.csv',
    ]),
  );
  expect(api.upload).toHaveBeenCalledExactlyOnceWith(
    '/prefix',
    'data',
    file,
    expect.any(AbortSignal),
    expect.any(Function),
    'corpus.csv',
  );
  expect(onActivate).toHaveBeenCalledOnce();
});
