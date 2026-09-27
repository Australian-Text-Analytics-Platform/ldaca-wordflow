import { TooltipProvider } from '@/components/ui/tooltip';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentSession from './DocumentSession';
import { useFrequencyState } from '@/features/tools/token-frequency/frequencyState';
import type { ProjectTool } from './ProjectView';
const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  tabs: vi.fn(),
  listeners: new Map<string, () => void>(),
  stop: vi.fn(),
}));
vi.mock('./api', () => ({ projectStatus: mocks.status, listTabs: mocks.tabs }));
vi.mock('./NativeSettings', () => ({ default: () => null }));
vi.mock('./ProjectView', () => ({
  default: ({ setActiveTool }: { setActiveTool: (tool: ProjectTool) => void }) => (
    <div>
      <p>Project contents</p>
      <button
        onClick={() => {
          setActiveTool('token-frequency');
        }}
      >
        Frequency
      </button>
      <button
        onClick={() => {
          setActiveTool('data-loader');
        }}
      >
        Data Loader
      </button>
      <button
        onClick={() => {
          setActiveTool('filter');
        }}
      >
        Preprocessing
      </button>
    </div>
  ),
}));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    listen: async (event: string, callback: () => void) => {
      mocks.listeners.set(event, callback);
      return mocks.stop;
    },
  }),
}));
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DocumentSession base="http://backend" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  useFrequencyState.setState({ active: {}, drafts: {} });
  mocks.status.mockResolvedValue({
    path: null,
    title: 'Untitled',
    schema_version: 1,
  });
});
describe('native document snapshot', () => {
  it('only reads the project initialized by Tauri', async () => {
    mount();
    expect(await screen.findByText('Project contents')).toBeVisible();
    expect(mocks.status).toHaveBeenCalledWith('http://backend', expect.any(AbortSignal));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('refreshes the title after native Save As without remounting project contents', async () => {
    const view = mount();
    const contents = await screen.findByText('Project contents');
    mocks.status.mockResolvedValue({
      path: '/tmp/Saved.wfpj',
      title: 'Saved',
      schema_version: 1,
    });
    await act(async () => {
      mocks.listeners.get('project-changed')?.();
    });
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeVisible();
    });
    expect(screen.getByText('Project contents')).toBe(contents);
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledTimes(2);
  });
  it('does not create a project while the host is unbound', async () => {
    mocks.status.mockResolvedValue(null);
    mount();
    await waitFor(() => {
      expect(mocks.status).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Project contents')).not.toBeInTheDocument();
  });
  it('follows section, active tab and saved name changes without loading tabs itself', async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    const key = ['native', 'http://backend', 'tabs', 'frequency'];
    client.setQueryData(key, [
      { id: 'one', name: 'Frequency 1' },
      { id: 'two', name: 'Frequency 2' },
    ]);
    mount(client);
    await screen.findByText('Project contents');
    const location = screen.getByRole('navigation', { name: 'Current location' });
    expect(location).toHaveAttribute('title', 'Untitled ▸ Data Loader');
    await user.click(screen.getByRole('button', { name: 'Frequency' }));
    expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Frequency 1');
    act(() => {
      useFrequencyState.getState().activate('http://backend', 'two');
    });
    expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Frequency 2');
    act(() => {
      client.setQueryData(key, [
        { id: 'one', name: 'Frequency 1' },
        { id: 'two', name: 'My comparison' },
      ]);
    });
    await waitFor(() => {
      expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ My comparison');
    });
    act(() => {
      client.setQueryData(key, [{ id: 'one', name: 'Frequency 1' }]);
    });
    await waitFor(() => {
      expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Frequency 1');
    });
    await user.click(screen.getByRole('button', { name: 'Preprocessing' }));
    expect(location).toHaveAttribute('title', 'Untitled ▸ Preprocessing');
    await user.click(screen.getByRole('button', { name: 'Data Loader' }));
    expect(location).toHaveAttribute('title', 'Untitled ▸ Data Loader');
    expect(mocks.tabs).not.toHaveBeenCalled();
  });
});
