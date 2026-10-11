import ServerApp from './ServerApp';
import { ServerControls } from './ServerControls';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { ServerStatus } from './context';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), request }));
vi.mock('./events', () => ({ subscribeServerEvents: () => () => undefined }));
vi.mock('./projectWindowState', () => ({
  captureProjectWindowState: vi.fn(),
  restoreProjectWindowState: vi.fn(),
}));
vi.mock('@/features/project/ProjectApp', () => ({
  default: ({ queryClient }: { queryClient: import('@tanstack/react-query').QueryClient }) => (
    <QueryClientProvider client={queryClient}>
      <input aria-label="Workspace draft" defaultValue="Original draft" />
      <ServerControls />
    </QueryClientProvider>
  ),
}));
let projects: ServerStatus[];
beforeEach(() => {
  projects = [];
  window.history.replaceState(null, '', '/');
  request.mockReset().mockImplementation((_base, path, method) => {
    if (path === '/api/server')
      return Promise.resolve({
        json: async () => ({ projects: [...projects], public_base_path: '/' }),
      });
    if (path === '/api/server/files/{library}') return Promise.resolve({ json: async () => [] });
    if (path === '/api/server/project' && method === 'post') {
      const project = {
        project_id: 'session-new',
        project: { title: 'Untitled', path: null, schema_version: 1 },
      };
      projects.push(project);
      return Promise.resolve({ json: async () => project });
    }
    if (path === '/api/server/project/close') {
      projects = [];
      return Promise.resolve({});
    }
    throw new Error(`Unexpected request ${String(path)}`);
  });
});
it('creates only on request, enters the workspace, and returns to welcome after close', async () => {
  const user = userEvent.setup();
  render(<ServerApp base="/prefix" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'New project' })).toBeEnabled());
  expect(request.mock.calls.some((call) => call[2] === 'post')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'New project' }));
  await screen.findByRole('textbox', { name: 'Workspace draft' });
  expect(window.location.search).toBe('?project=session-new');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Project & Data' }));
  await user.click(screen.getByRole('button', { name: 'Current project actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Close project…' }));
  await user.click(screen.getByRole('button', { name: 'Close project', exact: true }));
  await screen.findByRole('dialog', { name: 'Welcome to Wordflow' });
  expect(window.location.search).toBe('');
  expect(screen.queryByRole('textbox', { name: 'Workspace draft' })).not.toBeInTheDocument();
});
it('reconnects to the URL project and keeps the workspace mounted under the manager', async () => {
  const user = userEvent.setup();
  projects = [
    {
      project_id: 'session-open',
      project: { title: 'Research', path: '/projects/Research.wfpj', schema_version: 1 },
    },
  ];
  window.history.replaceState(null, '', '/?project=session-open');
  render(<ServerApp base="/prefix" />);
  const draft = await screen.findByRole('textbox', { name: 'Workspace draft' });
  await user.clear(draft);
  await user.type(draft, 'An unsaved draft');
  await user.click(screen.getByRole('button', { name: 'Project & Data' }));
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'Workspace draft' })).toBe(draft);
  expect(draft).toHaveValue('An unsaved draft');
  expect(window.location.search).toBe('?project=session-open');
});
it('shows explicit recovery for a stale project URL rather than selecting another runtime', async () => {
  projects = [
    {
      project_id: 'another-session',
      project: { title: 'Untitled', path: null, schema_version: 1 },
    },
  ];
  window.history.replaceState(null, '', '/?project=closed-session');
  render(<ServerApp base="/prefix" />);
  expect(
    await screen.findByText(
      'This project is closed or its worker restarted. Reopen it from the library.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('dialog', { name: 'Welcome to Wordflow' })).toBeVisible();
  expect(window.location.search).toBe('?project=closed-session');
});
