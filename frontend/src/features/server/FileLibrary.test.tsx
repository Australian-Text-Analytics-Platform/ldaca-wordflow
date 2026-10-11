import { FileLibrary } from './FileLibrary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test';
const request = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), request }));
vi.mock('@/lib/download', () => ({ saveGeneratedExport: download }));
const fetch = vi.fn();
let files = [{ name: 'corpus.csv', size: 2048, modified: null }];
beforeEach(() => {
  vi.clearAllMocks();
  files = [{ name: 'corpus.csv', size: 2048, modified: null }];
  vi.stubGlobal('fetch', fetch);
  request.mockImplementation((_base, _path, method) =>
    Promise.resolve({
      json: async () => (method === 'get' ? files : {}),
      blob: async () => new Blob(['data']),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function mount(selected = false) {
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
                project: { title: 'Research', path: null, schema_version: 1 },
              }
            : undefined
        }
      />
    </QueryClientProvider>,
  );
}
it('uploads into the library before project selection without importing', async () => {
  const user = userEvent.setup();
  mount();
  fetch.mockImplementationOnce(async () => {
    files = [...files, { name: 'more.csv', size: 9, modified: null }];
    return new Response(JSON.stringify({ name: 'more.csv', size: 9, modified: null }));
  });
  await user.upload(
    screen.getByLabelText('Upload data files'),
    new File(['text\nhello'], 'more.csv', { type: 'text/csv' }),
  );
  await screen.findByText('more.csv');
  expect(fetch).toHaveBeenCalledWith(
    '/prefix/api/server/files/data/more.csv',
    expect.objectContaining({ method: 'PUT', body: expect.any(File) }),
  );
  expect(request.mock.calls.some((call) => call[1] === '/api/server/import')).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Import more.csv into current project' }),
  ).toBeDisabled();
});
it('retains existing files and explains duplicate upload failures', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText('corpus.csv');
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: { code: 'file_exists', message: 'A file with this name already exists.' },
      }),
      { status: 409 },
    ),
  );
  await user.upload(
    screen.getByLabelText('Upload data files'),
    new File(['text\nhello'], 'corpus.csv', { type: 'text/csv' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A file with this name already exists.',
  );
  expect(screen.getByText('corpus.csv')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Upload data files' })).toBeEnabled();
});
it('imports into the captured project and leaves the library available', async () => {
  const user = userEvent.setup();
  mount(true);
  await user.click(
    await screen.findByRole('button', { name: 'Import corpus.csv into current project' }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/prefix', '/api/server/import', 'post', {
      body: { project_id: 'captured-session', name: 'corpus.csv' },
    }),
  );
  expect(await screen.findByText('corpus.csv imported into Research.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Upload data files' })).toBeEnabled();
});
it('requires confirmation before deletion and focuses the safe action', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: 'Actions for corpus.csv' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(request.mock.calls.some((call) => call[2] === 'delete')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/prefix',
      '/api/server/files/{library}/{name}',
      'delete',
      { path: { library: 'data', name: 'corpus.csv' } },
    ),
  );
});
it('downloads a file through the deployment prefix', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: 'Actions for corpus.csv' }));
  await user.click(screen.getByRole('menuitem', { name: 'Download' }));
  await waitFor(() => expect(download).toHaveBeenCalledWith(expect.any(Blob), 'corpus.csv'));
  expect(request).toHaveBeenCalledWith('/prefix', '/api/server/files/{library}/{name}', 'get', {
    path: { library: 'data', name: 'corpus.csv' },
  });
});
it('recovers from a failed file-list request with an explicit retry', async () => {
  const user = userEvent.setup();
  request.mockRejectedValueOnce(new Error('Disconnected'));
  mount();
  await user.click(await screen.findByRole('button', { name: 'Retry data files' }));
  expect(await screen.findByText('corpus.csv')).toBeVisible();
});

it('returns confirmation focus to the row action when deletion is cancelled', async () => {
  const user = userEvent.setup();
  mount();
  const trigger = await screen.findByRole('button', { name: 'Actions for corpus.csv' });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(request.mock.calls.some((call) => call[2] === 'delete')).toBe(false);
});

it('uploads multiple dropped data files without importing', async () => {
  mount();
  await screen.findByText('corpus.csv');
  fetch.mockImplementation(async () => new Response('{}'));
  fireEvent.drop(screen.getByLabelText('Drop data files to upload'), {
    dataTransfer: { files: [new File(['a'], 'first.csv'), new File(['b'], 'second.jsonl')] },
  });
  await screen.findByText('Files uploaded. Import into a project when you are ready.');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    '/prefix/api/server/files/data/first.csv',
    '/prefix/api/server/files/data/second.jsonl',
  ]);
  expect(request.mock.calls.some((call) => call[1] === '/api/server/import')).toBe(false);
});

it('uploads dropped projects and reports duplicate upload errors', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FileLibrary dropUpload base="/prefix" library="projects" />
    </QueryClientProvider>,
  );
  await screen.findByText('corpus.csv');
  fetch.mockResolvedValueOnce(new Response('{}'));
  const zone = screen.getByLabelText('Drop project files to upload');
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['project'], 'Study.wfpj')] } });
  await screen.findByText('File uploaded. Choose Open to start working.');
  expect(fetch).toHaveBeenCalledWith(
    '/prefix/api/server/files/projects/Study.wfpj',
    expect.anything(),
  );
  fetch.mockResolvedValueOnce(
    new Response('A file with this name already exists.', { status: 409 }),
  );
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['project'], 'Study.wfpj')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A file with this name already exists.',
  );
});

it('rejects non-project files dropped into the project library', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FileLibrary dropUpload base="/prefix" library="projects" />
    </QueryClientProvider>,
  );
  await screen.findByText('corpus.csv');
  fireEvent.drop(screen.getByLabelText('Drop project files to upload'), {
    dataTransfer: { files: [new File(['data'], 'corpus.csv')] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose Wordflow project files (.wfpj).',
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('does not upload dropped files while the server is unavailable', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FileLibrary dropUpload base="/prefix" library="data" ready={false} />
    </QueryClientProvider>,
  );
  fireEvent.drop(screen.getByLabelText('Drop data files to upload'), {
    dataTransfer: { files: [new File(['data'], 'corpus.csv')] },
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('consumes library drops before the workspace upload-and-import handler', async () => {
  mount(true);
  await screen.findByText('corpus.csv');
  fetch.mockResolvedValueOnce(new Response('{}'));
  const workspaceDrop = vi.fn();
  document.addEventListener('drop', workspaceDrop);
  try {
    fireEvent.drop(screen.getByLabelText('Drop data files to upload'), {
      dataTransfer: { files: [new File(['data'], 'more.csv')] },
    });
    await screen.findByText('File uploaded. Import into a project when you are ready.');
    expect(workspaceDrop).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    document.removeEventListener('drop', workspaceDrop);
  }
});

it('leaves ordinary workspace drops to the existing window-level handler', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FileLibrary base="/prefix" library="data" />
    </QueryClientProvider>,
  );
  await screen.findByText('corpus.csv');
  const workspaceDrop = vi.fn();
  document.addEventListener('drop', workspaceDrop);
  try {
    fireEvent.drop(screen.getByText('corpus.csv'), {
      dataTransfer: { files: [new File(['data'], 'more.csv')] },
    });
    expect(workspaceDrop).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener('drop', workspaceDrop);
  }
});

it('shows distinct unsaved project names with working size and modification time', async () => {
  const modified = 1_700_000_000;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FileLibrary
        base="/prefix"
        library="projects"
        projects={[
          {
            project_id: 'first',
            project: { title: 'Untitled-1', path: null, schema_version: 1, size: 2048, modified },
          },
          {
            project_id: 'second',
            project: { title: 'Untitled-2', path: null, schema_version: 1, size: 4096, modified },
          },
        ]}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Untitled-1')).toBeVisible();
  expect(screen.getByText('Untitled-2')).toBeVisible();
  expect(screen.getByText('2 KB')).toBeVisible();
  expect(screen.getByText('4 KB')).toBeVisible();
  expect(
    screen.getAllByText(`Modified ${new Date(modified * 1000).toLocaleString()}`),
  ).toHaveLength(2);
});
