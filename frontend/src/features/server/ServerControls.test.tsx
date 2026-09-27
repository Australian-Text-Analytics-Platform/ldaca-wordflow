import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ServerControls } from './ServerControls';
import { ServerContext } from './context';
import { ProjectError } from '@/features/project/api';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/features/project/api', async (original) => ({ ...(await original<object>()), request }));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: vi.fn() }));
beforeEach(() => request.mockReset());
function mount() {
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
            session_id: 'session-1',
            public_base_path: '/user/me/proxy/8002/',
            project: { title: 'Untitled', path: null, schema_version: 1 },
          },
          refresh: async () => {
            return undefined;
          },
        }}
      >
        <ServerControls projectBase="/session/session-1" />
      </ServerContext>
    </QueryClientProvider>,
  );
}
it('saves Untitled with a captured session and retains a failed filename', async () => {
  const user = userEvent.setup();
  mount();
  request.mockRejectedValueOnce(new ProjectError('Exists', '{"error":{"code":"file_exists"}}'));
  await user.click(screen.getByRole('button', { name: 'Project', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'Save', exact: true }));
  await user.type(screen.getByRole('textbox', { name: 'Filename' }), '研究');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/user/me/proxy/8002',
      '/api/server/project/save',
      'post',
      { body: { session_id: 'session-1', name: '研究.wfpj' } },
    ),
  );
  expect(screen.getByRole('textbox', { name: 'Filename' })).toHaveValue('研究');
  request.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('requires explicit discard after the host reports an Untitled project', async () => {
  const user = userEvent.setup();
  mount();
  request.mockRejectedValueOnce(
    new ProjectError('Save first', '{"error":{"code":"save_required"}}'),
  );
  await user.click(screen.getByRole('button', { name: 'Project', exact: true }));
  await user.click(screen.getByRole('menuitem', { name: 'New project' }));
  await screen.findByRole('button', { name: 'Discard' });
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Discard' }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith('/user/me/proxy/8002', '/api/server/project', 'post', {
      body: { session_id: 'session-1', name: null, discard_untitled: true, interrupt: false },
    }),
  );
});
