import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { HostSettings, useHostServices } from './HostSettings';
import NativeSettings from '@/features/project/NativeSettings';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProviderSelector } from '@/features/ai/ProviderSelector';
import { acceptPreferences, defaultPreferences } from '@/features/preferences/preferences';
import * as aiApi from '@/features/ai/api';
import { request } from '@/api/client';
vi.mock('@/api/client', () => ({ request: vi.fn() }));
vi.mock('@/features/ai/api', () => ({
  aiConnections: vi.fn(),
  aiModels: vi.fn(),
  aiCapabilities: vi.fn(),
  deleteAiConnection: vi.fn(),
  saveAiConnection: vi.fn(),
}));
const connection: aiApi.AiConnection = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Synthetic connection',
  provider: 'custom',
  endpoint: 'http://127.0.0.1:9000/v1',
  credential_mode: 'none',
  has_credential: false,
  credential_error: null,
  built_in: false,
  revision: 'revision',
};
beforeEach(() => {
  vi.clearAllMocks();
  acceptPreferences(defaultPreferences);
  vi.mocked(aiApi.aiConnections).mockResolvedValue([connection]);
  vi.mocked(aiApi.aiModels).mockResolvedValue(['synthetic-model']);
  vi.mocked(request).mockResolvedValue({
    json: async () => ({
      location_scope: 'server',
      directories: [{ category: 'cache', path: '/isolated/cache', exists: true }],
      project_library: '/isolated/projects',
      data_library: '/isolated/data',
    }),
  } as never);
});
function Shortcut() {
  const host = useHostServices();
  return (
    <button onClick={(event) => host?.openSettings('portal', event.currentTarget)}>
      Manage Portal access
    </button>
  );
}
function setup(
  children = (
    <>
      <NativeSettings />
      <input aria-label="Workspace draft" defaultValue="draft" />
      <ProviderSelector
        base="/prefix/project/session"
        provider={connection.id}
        model="synthetic-model"
        onChange={vi.fn()}
      />
      <Shortcut />
    </>
  ),
) {
  const host = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const project = new QueryClient();
  return {
    host,
    project,
    ...render(
      <QueryClientProvider client={host}>
        <TooltipProvider>
          <HostSettings base="/prefix" client={host}>
            <QueryClientProvider client={project}>{children}</QueryClientProvider>
          </HostSettings>
        </TooltipProvider>
      </QueryClientProvider>,
    ),
  };
}
it('opens before project selection and uses the explicit host base for storage', async () => {
  const user = userEvent.setup();
  setup(<NativeSettings />);
  await user.click(screen.getByRole('button', { name: 'Open settings' }));
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(within(dialog).getByText('Preferences for this single-user web host.')).toBeVisible();
  await user.click(within(dialog).getByRole('button', { name: 'Storage', exact: true }));
  expect(await screen.findByText('/isolated/cache')).toBeVisible();
  expect(request).toHaveBeenCalledWith(
    '/prefix',
    '/api/storage/locations',
    'get',
    expect.any(Object),
  );
  expect(screen.getByRole('button', { name: 'Copy Cache path' })).toBeEnabled();
});
it('restores opener focus and preserves a mounted workspace draft on Escape', async () => {
  const user = userEvent.setup();
  setup();
  const draft = screen.getByRole('textbox', { name: 'Workspace draft' });
  await user.type(draft, ' remains');
  const opener = screen.getByRole('button', { name: 'Open settings' });
  await user.click(opener);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.getByRole('textbox', { name: 'Workspace draft' })).toBe(draft);
  expect(draft).toHaveValue('draft remains');
});
it('uses one AI manager from Annotation without changing provider selection and confirms deletion', async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const { host, project } = setup(
    <ProviderSelector
      base="/prefix/project/session"
      provider={connection.id}
      model="synthetic-model"
      onChange={changed}
    />,
  );
  const opener = screen.getByRole('button', { name: 'Manage connections' });
  await user.click(opener);
  expect(await screen.findByRole('heading', { name: 'AI connections' })).toBeVisible();
  expect(aiApi.aiConnections).toHaveBeenCalledWith('/prefix', expect.any(AbortSignal));
  expect(host.getQueryData(['host', '/prefix', 'ai-providers'])).toEqual([connection]);
  expect(project.getQueryCache().getAll()).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Delete Synthetic connection' }));
  expect(screen.getByRole('alertdialog')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancel', exact: true })).toHaveFocus();
  expect(aiApi.deleteAiConnection).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Delete connection', exact: true }));
  await waitFor(() =>
    expect(aiApi.deleteAiConnection).toHaveBeenCalledWith('/prefix', connection.id),
  );
  await user.click(screen.getByRole('button', { name: 'Close', exact: true }));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(changed).not.toHaveBeenCalled();
});
it('Portal shortcut opens the Portal section without changing project state', async () => {
  vi.mocked(request).mockResolvedValue({
    json: async () => ({ has_credential: false, credential_mode: 'none', credential_error: null }),
  } as never);
  const user = userEvent.setup();
  setup(<Shortcut />);
  await user.click(screen.getByRole('button', { name: 'Manage Portal access' }));
  expect(await screen.findByRole('heading', { name: 'Portal access' })).toBeVisible();
  expect(request).toHaveBeenCalledWith(
    '/prefix',
    '/api/portal/credential',
    'get',
    expect.any(Object),
  );
});
