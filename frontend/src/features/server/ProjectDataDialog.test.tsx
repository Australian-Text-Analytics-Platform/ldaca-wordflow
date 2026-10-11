import { ProjectDataDialog } from './ProjectDataDialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), request }));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: vi.fn() }));
const select = vi.fn();
const refresh = vi.fn(async () => undefined);
const close = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  request.mockImplementation((_base, path, method, options) => {
    if (path === '/api/server/files/{library}')
      return Promise.resolve({
        json: async () =>
          options.path.library === 'data'
            ? [{ name: 'corpus.csv', size: 2048, modified: null }]
            : [{ name: 'Research.wfpj', size: 4096, modified: null }],
      });
    if (path === '/api/server/project' && method === 'post')
      return Promise.resolve({ json: async () => ({ project_id: 'new-session' }) });
    return Promise.resolve({ json: async () => ({}) });
  });
});
function mount(
  projects: {
    project_id: string;
    project: { title: string; path: string | null; schema_version: number };
  }[] = [],
) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProjectDataDialog
        base="/wordflow"
        projects={projects}
        open
        onOpenChange={close}
        select={select}
        refresh={refresh}
      />
    </QueryClientProvider>,
  );
}
it('starts with both libraries available, blocks dismissal and never creates a project automatically', async () => {
  const user = userEvent.setup();
  mount();
  const dialog = screen.getByRole('dialog', { name: 'Welcome to Wordflow' });
  await screen.findByText('corpus.csv');
  expect(within(dialog).getByRole('region', { name: 'Projects' })).toBeVisible();
  expect(within(dialog).getByRole('region', { name: 'Data files' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Import corpus.csv into current project' }),
  ).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Close', exact: true })).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  expect(request.mock.calls.every((call) => call[2] === 'get')).toBe(true);
});
it.each([
  ['New project', null],
  ['Open Research.wfpj', 'Research.wfpj'],
])('opens a project explicitly using %s and the deployment prefix', async (label, name) => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: label, exact: true }));
  await waitFor(() => expect(select).toHaveBeenCalledWith('new-session'));
  expect(request).toHaveBeenCalledWith('/wordflow', '/api/server/project', 'post', {
    body: { name },
  });
  expect(refresh).toHaveBeenCalled();
});
it('searches filenames and shows matching empty states', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText('Research.wfpj');
  await user.type(screen.getByRole('textbox', { name: 'Search projects' }), 'missing');
  expect(screen.queryByText('Research.wfpj')).not.toBeInTheDocument();
  expect(screen.getByText('No matching projects.')).toBeVisible();
  expect(screen.getByText('corpus.csv')).toBeVisible();
  await user.clear(screen.getByRole('textbox', { name: 'Search projects' }));
  expect(screen.getByText('Research.wfpj')).toBeVisible();
});
it('merges open saved projects with library rows and prevents deletion while open', async () => {
  const user = userEvent.setup();
  mount([
    {
      project_id: 'existing-session',
      project: { title: 'Research', path: '/data/projects/Research.wfpj', schema_version: 1 },
    },
  ]);
  await screen.findByText('Research.wfpj');
  await waitFor(() => expect(screen.getAllByText('Research.wfpj')).toHaveLength(1));
  await user.click(screen.getByRole('button', { name: 'Actions for Research.wfpj' }));
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Open Research.wfpj' }));
  expect(select).toHaveBeenCalledWith('existing-session');
  expect(request.mock.calls.some((call) => call[2] === 'post')).toBe(false);
});

it('does not label an open saved runtime as unsaved while file metadata is refreshing', async () => {
  request.mockImplementation(() => Promise.resolve({ json: async () => [] }));
  mount([
    {
      project_id: 'existing-session',
      project: { title: 'Research', path: '/data/projects/Research.wfpj', schema_version: 1 },
    },
  ]);
  expect(await screen.findByText('Saved project')).toBeVisible();
  expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
});
