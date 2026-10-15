import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { invoke } from '@tauri-apps/api/core';
import * as projectErrors from '../project/projectErrors';
import DesktopApp from './DesktopApp';

vi.mock('../project/ProjectApp', () => ({ default: () => <div>Wordflow is ready</div> }));
const events = vi.hoisted(() => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ listen: events.listen }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('desktop lifecycle screen', () => {
  it('trusts the native ready snapshot without a second HTTP probe', async () => {
    vi.mocked(invoke).mockResolvedValue({ status: 'ready', url: 'http://127.0.0.1:49152' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ready', version: '0.8.0' }) });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<DesktopApp />);
    expect(await screen.findByText('Wordflow is ready')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('get_backend_status');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/data root|sign in|project/i)).not.toBeInTheDocument();
    view.unmount();
  });

  it('shows startup failures without making HTTP requests', async () => {
    vi.mocked(invoke).mockResolvedValue({
      status: 'failed',
      error: { code: 'io_error', message: 'Address could not be bound' },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DesktopApp />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Address could not be bound');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks readiness for the browser preview and reports HTTP failure', async () => {
    vi.mocked(invoke).mockResolvedValue({ status: 'ready', url: 'http://127.0.0.1:49152' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    render(<DesktopApp backendUrl="http://127.0.0.1:49152" />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Connection refused');
    });
  });

  it.each(['request', 'body'])(
    'does not report a cancelled readiness %s as a backend failure',
    async (stage) => {
      const error = new DOMException('signal is aborted without reason', 'AbortError');
      const report = vi
        .spyOn(projectErrors, 'reportProjectError')
        .mockImplementation(() => undefined);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          if (stage === 'request') throw error;
          return {
            ok: true,
            json: async () => {
              throw error;
            },
          };
        }),
      );
      render(<DesktopApp backendUrl="http://127.0.0.1:49152" />);
      await act(async () => undefined);
      expect(report).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Starting Wordflow');
    },
  );

  it('keeps the mounted project after a later backend failure event', async () => {
    let event: ((value: { payload: unknown }) => void) | undefined;
    events.listen.mockImplementationOnce((_name: string, callback: typeof event) => {
      event = callback;
      return Promise.resolve(() => undefined);
    });
    vi.mocked(invoke).mockResolvedValue({ status: 'ready', url: 'http://127.0.0.1:49152' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ready' }) }),
    );
    render(<DesktopApp />);
    const project = await screen.findByText('Wordflow is ready');
    act(() => {
      event?.({
        payload: { status: 'failed', error: { code: 'io_error', message: 'Connection lost' } },
      });
    });
    expect(screen.getByText('Wordflow is ready')).toBe(project);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
