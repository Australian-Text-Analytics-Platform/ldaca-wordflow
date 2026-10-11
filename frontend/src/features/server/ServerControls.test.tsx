import { ProjectError } from '@/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { ServerControls } from './ServerControls';
import { ServerContext } from './context';
import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import { useEditingGuard, type Guard } from '@/features/table-editing/useEditingNavigation';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', async (original) => ({ ...(await original<object>()), request }));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: vi.fn() }));
const mutation = vi.fn();
beforeEach(() => {
  mutation.mockReset();
  request.mockReset().mockImplementation((_base, path, method, options) => {
    if (method === 'get') return Promise.resolve({ json: async () => [] });
    return mutation(path, options);
  });
});
function DraftGuard({ guard }: { guard: Guard }) {
  useEditingGuard('draft', guard);
  return null;
}
function mount(guard?: Guard, path: string | null = null) {
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
            project: { title: 'Untitled', path, schema_version: 1 },
          },
          projects: [],
          select: vi.fn(),
          refresh: async () => undefined,
        }}
      >
        <EditingNavigation>
          {guard && <DraftGuard guard={guard} />}
          <input aria-label="Workspace draft" defaultValue="Keep this draft" />
          <ServerControls />
        </EditingNavigation>
      </ServerContext>
    </QueryClientProvider>,
  );
}
it('saves Untitled with a captured session and retains a failed filename', async () => {
  const user = userEvent.setup();
  mount();
  mutation.mockRejectedValueOnce(new ProjectError('Exists', '{"error":{"code":"file_exists"}}'));
  await user.click(screen.getByRole('button', { name: 'Project & Data', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await user.type(screen.getByRole('textbox', { name: 'Filename' }), '研究');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/user/me/proxy/8002',
      '/api/server/project/save',
      'post',
      { body: { project_id: 'session-1', name: '研究.wfpj' } },
    ),
  );
  expect(screen.getByRole('textbox', { name: 'Filename' })).toHaveValue('研究');
  mutation.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Filename' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('dialog', { name: 'Project & Data' })).toBeVisible();
});
it('requires explicit discard when closing a shared Untitled project', async () => {
  const user = userEvent.setup();
  mount();
  mutation.mockRejectedValueOnce(
    new ProjectError('Save first', '{"error":{"code":"save_required"}}'),
  );
  await user.click(screen.getByRole('button', { name: 'Project & Data', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Current project actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Close project…' }));
  expect(
    screen.getByText('This closes the project in every window that has it open.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close project', exact: true }));
  await screen.findByRole('button', { name: 'Discard' });
  expect(mutation).toHaveBeenCalledTimes(1);
  mutation.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Discard' }));
  await waitFor(() =>
    expect(mutation).toHaveBeenLastCalledWith('/api/server/project/close', {
      body: { project_id: 'session-1', discard_untitled: true, interrupt: false },
    }),
  );
});
it.each(['Close', 'Escape'])(
  'returns to the unchanged workspace using %s and restores focus',
  async (action) => {
    const user = userEvent.setup();
    mount();
    const trigger = screen.getByRole('button', { name: 'Project & Data', exact: true });
    const draft = screen.getByRole('textbox', { name: 'Workspace draft' });
    await user.click(trigger);
    expect(screen.getByRole('heading', { name: 'Project & Data' })).toHaveFocus();
    if (action === 'Escape') await user.keyboard('{Escape}');
    else await user.click(screen.getByRole('button', { name: action }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole('textbox', { name: 'Workspace draft' })).toBe(draft);
    expect(draft).toHaveValue('Keep this draft');
    expect(mutation).not.toHaveBeenCalled();
  },
);
it('shows a single disabled manager button in the API-only browser preview', () => {
  render(<ServerControls />);
  expect(screen.getByRole('button', { name: 'Project & Data' })).toBeDisabled();
});

it('leaves the draft alone on manager entry and respects an editor refusing a project switch', async () => {
  const user = userEvent.setup();
  const guard = vi.fn(async () => false);
  mount(guard);
  await user.click(screen.getByRole('button', { name: 'Project & Data' }));
  expect(guard).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'New project' }));
  await waitFor(() => expect(guard).toHaveBeenCalledOnce());
  expect(mutation).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('textbox', { name: 'Workspace draft' })).toHaveValue('Keep this draft');
});

it('offers Save As for a named project and restores the manager action after cancelling', async () => {
  const user = userEvent.setup();
  mount(undefined, '/projects/Untitled.wfpj');
  await user.click(screen.getByRole('button', { name: 'Project & Data' }));
  const trigger = screen.getByRole('button', { name: 'Current project actions' });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Save As…' }));
  await user.type(screen.getByRole('textbox', { name: 'Filename' }), 'Another study');
  await user.click(screen.getByRole('button', { name: 'Stay' }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(mutation).not.toHaveBeenCalled();
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Save As…' }));
  await user.type(screen.getByRole('textbox', { name: 'Filename' }), 'Another study');
  mutation.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(mutation).toHaveBeenCalledWith('/api/server/project/save', {
      body: { project_id: 'session-1', name: 'Another study.wfpj' },
    }),
  );
});
it('keeps the browser manager out of the native desktop toolbar', () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  try {
    render(<ServerControls />);
    expect(screen.queryByRole('button', { name: 'Project & Data' })).not.toBeInTheDocument();
  } finally {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  }
});

it('saves a named project directly from the toolbar without opening the manager', async () => {
  const user = userEvent.setup();
  mount(undefined, '/projects/Research.wfpj');
  mutation.mockResolvedValueOnce({});
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(mutation).toHaveBeenCalledWith('/api/server/project/save', {
      body: { project_id: 'session-1', name: null },
    }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it.each(['metaKey', 'ctrlKey'])(
  'saves with %s and prevents the browser Save Page action',
  async (modifier) => {
    mount(undefined, '/projects/Research.wfpj');
    mutation.mockResolvedValueOnce({});
    const event = new KeyboardEvent('keydown', { key: 's', [modifier]: true, cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
    expect(mutation).toHaveBeenCalledWith('/api/server/project/save', {
      body: { project_id: 'session-1', name: null },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);
it('prompts for an Untitled filename from the toolbar and restores Save focus after cancellation', async () => {
  const user = userEvent.setup();
  mount();
  const save = screen.getByRole('button', { name: 'Save', exact: true });
  await user.click(save);
  expect(screen.getByRole('dialog', { name: 'Save project' })).toBeVisible();
  expect(screen.queryByRole('dialog', { name: 'Project & Data' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Stay' }));
  await waitFor(() => expect(save).toHaveFocus());
  expect(mutation).not.toHaveBeenCalled();
});
it('uses the editor guard for Save and ignores repeat, shifted, and composing shortcuts', async () => {
  const guard = vi.fn(async () => false);
  mount(guard, '/projects/Research.wfpj');
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true, repeat: true });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true, isComposing: true });
  await waitFor(() => expect(guard).toHaveBeenCalledOnce());
  expect(mutation).not.toHaveBeenCalled();
});

it('opens the Untitled save prompt with Ctrl+S and saves without opening the manager', async () => {
  const user = userEvent.setup();
  mount();
  mutation.mockResolvedValueOnce({});
  const draft = screen.getByRole('textbox', { name: 'Workspace draft' });
  await user.click(draft);
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await user.type(screen.getByRole('textbox', { name: 'Filename' }), 'Research');
  await user.click(
    within(screen.getByRole('dialog', { name: 'Save project' })).getByRole('button', {
      name: 'Save',
      exact: true,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mutation).toHaveBeenCalledWith('/api/server/project/save', {
    body: { project_id: 'session-1', name: 'Research.wfpj' },
  });
  expect(draft).toHaveValue('Keep this draft');
  await waitFor(() => expect(draft).toHaveFocus());
});

it.each([
  ['Save', 'Test'],
  ['Save', 'Test.wfpj'],
  ['Save As', 'Test'],
  ['Save As', 'Test.wfpj'],
])('%s saves %s as Test.wfpj without duplicating the extension', async (action, filename) => {
  const user = userEvent.setup();
  mount(undefined, action === 'Save As' ? '/projects/Original.wfpj' : null);
  mutation.mockResolvedValueOnce({});
  if (action === 'Save As') {
    await user.click(screen.getByRole('button', { name: 'Project & Data', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Current project actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save As…' }));
  } else {
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  }
  const dialog = screen.getByRole('dialog', { name: 'Save project' });
  await user.type(within(dialog).getByRole('textbox', { name: 'Filename' }), filename);
  await user.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Filename' })).not.toBeInTheDocument(),
  );
  expect(mutation).toHaveBeenCalledOnce();
  expect(mutation).toHaveBeenCalledWith('/api/server/project/save', {
    body: { project_id: 'session-1', name: 'Test.wfpj' },
  });
});
