import { ProjectError } from '@/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { ServerControls } from './ServerControls';
import { ServerContext } from './context';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), request }));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: vi.fn() }));
beforeEach(() => request.mockReset());
function mount(select = vi.fn()) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
        })
      }
    >
      <ServerContext
        value={{
          base: '/user/me/proxy/8002',
          status: {
            project_id: 'session-1',

            project: { title: 'Untitled-1', path: '/projects/Untitled-1.wfpj', schema_version: 1 },
          },
          projects: [],
          select,
          refresh: async () => {
            return undefined;
          },
        }}
      >
        <ServerControls projectBase="/project/session-1" />
      </ServerContext>
    </QueryClientProvider>,
  );
}
it('renames the captured session and retains an editable name after failure', async () => {
  const user = userEvent.setup();
  mount();
  request.mockRejectedValueOnce(new ProjectError('Exists', '{"error":{"code":"file_exists"}}'));
  await user.click(screen.getByRole('button', { name: 'Project', exact: true }));
  expect(screen.queryByRole('menuitem', { name: 'Save', exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Rename…' }));
  const input = screen.getByRole('textbox', { name: 'Project name' });
  await user.clear(input);
  await user.type(input, '研究');
  await user.click(screen.getByRole('button', { name: 'Rename', exact: true }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/user/me/proxy/8002',
      '/api/server/project/rename',
      'post',
      { body: { project_id: 'session-1', name: '研究.wfpj' } },
    ),
  );
  expect(input).toHaveValue('研究');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not rename project');
  request.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('duplicates without changing the selected project', async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  mount(select);
  request.mockResolvedValueOnce({ json: async () => ({ name: 'Untitled-1_copy.wfpj' }) });
  await user.click(screen.getByRole('button', { name: 'Project', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Duplicate project' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Created Untitled-1_copy.wfpj');
  expect(select).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith(
    '/user/me/proxy/8002',
    '/api/server/project/duplicate',
    'post',
    {
      body: { project_id: 'session-1' },
    },
  );
});
it('confirms cancellation before closing active work, without a Save prompt', async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  mount(select);
  request.mockRejectedValueOnce(
    new ProjectError('Work active', '{"error":{"code":"task_active"}}'),
  );
  await user.click(screen.getByRole('button', { name: 'Project', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Close project…' }));
  await user.click(screen.getByRole('button', { name: 'Close project', exact: true }));
  await screen.findByRole('button', { name: 'Cancel work and close' });
  expect(select).not.toHaveBeenCalled();
  request.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Cancel work and close' }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      '/user/me/proxy/8002',
      '/api/server/project/close',
      'post',
      { body: { project_id: 'session-1', interrupt: true } },
    ),
  );
  expect(select).toHaveBeenCalledWith(null);
});
