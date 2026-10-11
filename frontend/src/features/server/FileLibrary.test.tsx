import { FileLibrary } from './FileLibrary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { useUploads } from './uploads';
const request = vi.hoisted(() => vi.fn());
const uploadFile = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), request }));
vi.mock('./api', async (original) => ({ ...(await original<object>()), uploadFile }));
vi.mock('@/lib/download', () => ({ saveGeneratedExport: download }));
let files = [{ name: 'corpus.csv', size: 2048, modified: null, is_directory: false }];
beforeEach(() => {
  vi.clearAllMocks();
  useUploads.setState({ cards: [], revision: 0, visibleLibraries: {} });
  files = [{ name: 'corpus.csv', size: 2048, modified: null, is_directory: false }];
  request.mockImplementation((_base, path) =>
    Promise.resolve({
      json: async () =>
        path === '/api/server/files/{library}'
          ? files
          : path === '/api/server/import/inspect'
            ? { files: [{ format: 'csv', sheets: [] }], collection: false }
            : { table_names: ['corpus'], skipped: [] },
      blob: async () => new Blob(['data']),
    }),
  );
  uploadFile.mockImplementation(async (_base, _library, file) => {
    const published = { name: file.name, size: file.size, modified: null, is_directory: false };
    files = [...files, published];
    return published;
  });
});
function mount(selected = false, props = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FileLibrary
        dropUpload
        base="/prefix"
        library="data"
        currentProject={
          selected
            ? {
                project_id: 'captured-session',
                project: { title: 'Research', path: '/projects/Research.wfpj', schema_version: 1 },
              }
            : undefined
        }
        {...props}
      />
    </QueryClientProvider>,
  );
}
it('uploads before project selection through persistent cards without importing', async () => {
  const user = userEvent.setup();
  mount();
  const file = new File(['text\nhello'], 'more.csv', { type: 'text/csv' });
  await user.upload(screen.getByLabelText('Upload data files'), file);
  await waitFor(() => expect(useUploads.getState().cards[0]?.status).toBe('success'));
  expect(uploadFile).toHaveBeenCalledWith(
    '/prefix',
    'data',
    file,
    expect.any(AbortSignal),
    expect.any(Function),
    'more.csv',
  );
  expect(request.mock.calls.some((call) => call[1] === '/api/server/import')).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Import more.csv into current project' }),
  ).toBeDisabled();
});
it('preserves original upload failures and existing files', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText('corpus.csv');
  uploadFile.mockRejectedValueOnce(new Error('A file with this name already exists.'));
  await user.upload(screen.getByLabelText('Upload data files'), new File(['text'], 'corpus.csv'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A file with this name already exists.',
  );
  expect(
    screen.getByRole('button', { name: 'Import corpus.csv into current project' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Upload data files' })).toBeEnabled();
});
it('inspects and atomically imports the captured selection', async () => {
  const user = userEvent.setup();
  mount(true);
  await user.click(
    await screen.findByRole('button', { name: 'Import corpus.csv into current project' }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/prefix', '/api/server/import', 'post', {
      body: { project_id: 'captured-session', names: ['corpus.csv'], selected: undefined },
    }),
  );
  expect(request).toHaveBeenCalledWith('/prefix', '/api/server/import/inspect', 'post', {
    body: { project_id: 'captured-session', names: ['corpus.csv'] },
  });
});
it('confirms deletion, focuses Cancel and preflights a batch', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: 'Actions for corpus.csv' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(request.mock.calls.some((call) => call[1] === '/api/server/files/delete-batch')).toBe(
    false,
  );
  await user.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/prefix', '/api/server/files/delete-batch', 'post', {
      body: { library: 'data', names: ['corpus.csv'] },
    }),
  );
});
it('downloads an individual file through the deployment prefix', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: 'Actions for corpus.csv' }));
  await user.click(screen.getByRole('menuitem', { name: 'Download' }));
  await waitFor(() => expect(download).toHaveBeenCalledWith(expect.any(Blob), 'corpus.csv'));
  expect(request).toHaveBeenCalledWith('/prefix', '/api/server/files/{library}/{name}', 'get', {
    path: { library: 'data', name: 'corpus.csv' },
  });
});
it('retains diagnostics and recovers a failed file list with Retry', async () => {
  const user = userEvent.setup();
  request.mockRejectedValueOnce(new Error('Disconnected'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Disconnected');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('corpus.csv')).toBeVisible();
});
it('returns confirmation focus to the row action after Cancel', async () => {
  const user = userEvent.setup();
  mount();
  const trigger = await screen.findByRole('button', { name: 'Actions for corpus.csv' });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('consumes multiple library drops without importing or reaching workspace handlers', async () => {
  mount(true);
  await screen.findByText('corpus.csv');
  const workspaceDrop = vi.fn();
  document.addEventListener('drop', workspaceDrop);
  try {
    fireEvent.drop(screen.getByLabelText('Drop data files to upload'), {
      dataTransfer: { files: [new File(['a'], 'first.csv'), new File(['b'], 'second.jsonl')] },
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    expect(workspaceDrop).not.toHaveBeenCalled();
    expect(request.mock.calls.some((call) => call[1] === '/api/server/import')).toBe(false);
  } finally {
    document.removeEventListener('drop', workspaceDrop);
  }
});
it('uploads .wfpj drops and rejects non-project inputs before upload', async () => {
  mount(false, { library: 'projects' });
  await screen.findByText('corpus.csv');
  const zone = screen.getByLabelText('Drop project files to upload');
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['project'], 'Study.wfpj')] } });
  await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['csv'], 'wrong.csv')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose Wordflow project files (.wfpj).',
  );
  expect(uploadFile).toHaveBeenCalledTimes(1);
});
it('does not upload while the server is unavailable', () => {
  mount(false, { ready: false });
  fireEvent.drop(screen.getByLabelText('Drop data files to upload'), {
    dataTransfer: { files: [new File(['data'], 'corpus.csv')] },
  });
  expect(uploadFile).not.toHaveBeenCalled();
});
it('leaves ordinary workspace drops to the existing window handler', async () => {
  mount(false, { dropUpload: false });
  await screen.findByText('corpus.csv');
  const workspaceDrop = vi.fn();
  document.addEventListener('drop', workspaceDrop);
  try {
    fireEvent.drop(screen.getByText('corpus.csv'), {
      dataTransfer: { files: [new File(['data'], 'more.csv')] },
    });
    expect(workspaceDrop).toHaveBeenCalledTimes(1);
    expect(uploadFile).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener('drop', workspaceDrop);
  }
});
it('shows permanent Untitled files with working metadata and protects every open project', async () => {
  const user = userEvent.setup();
  mount(false, {
    library: 'projects',
    projects: [
      {
        project_id: 'first',
        project: {
          title: 'Untitled-1',
          path: '/projects/Untitled-1.wfpj',
          schema_version: 1,
          size: 2048,
          modified: 1_700_000_000,
        },
      },
    ],
  });
  expect(await screen.findByText('Untitled-1.wfpj')).toBeVisible();
  expect(screen.getByText('Open · Saved project')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Actions for Untitled-1.wfpj' }));
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
});
