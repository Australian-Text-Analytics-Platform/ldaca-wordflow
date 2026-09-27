import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useProjectFileDrop } from './useProjectFileDrop';
const native = vi.hoisted(() => ({
  listen: vi.fn(),
  stop: vi.fn(),
  receive: undefined as
    | undefined
    | ((event: {
        payload:
          | { type: 'drop' | 'over'; position: { x: number; y: number }; paths: string[] }
          | { type: 'leave' };
      }) => void),
}));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => true }));
vi.mock('@/lib/isMacOSDesktop', () => ({ isMacOSDesktop: () => true }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ scaleFactor: async () => 2 }),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    size: async () => ({ width: 2048, height: 1536 }),
    onDragDropEvent: native.listen,
  }),
}));
function Harness({ onDrop }: { onDrop: (paths: string[]) => void }) {
  useProjectFileDrop(onDrop);
  return (
    <>
      <div data-project-file-drop="loader" data-testid="loader">
        <span>Local</span>
      </div>
      <div data-project-file-drop="graph" data-testid="graph">
        Graph
      </div>
      <div data-testid="overlay">Overlay</div>
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  native.listen.mockImplementation((receive: typeof native.receive) => {
    native.receive = receive;
    return Promise.resolve(native.stop);
  });
});
it('routes each accepted native drop once, maps coordinates, and ignores overlays even when a leave follows a drop', async () => {
  const dropped = vi.fn();
  const { unmount } = render(<Harness onDrop={dropped} />);
  const at = vi.fn().mockReturnValue(screen.getByText('Local'));
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: at });
  await act(async () => {
    native.receive?.({ payload: { type: 'over', position: { x: 120, y: 80 }, paths: [] } });
  });
  expect(at).toHaveBeenLastCalledWith(120, 80);
  expect(screen.getByTestId('loader')).toHaveAttribute('data-file-hover', 'true');
  await act(async () => {
    native.receive?.({
      payload: { type: 'drop', position: { x: 120, y: 80 }, paths: ['/tmp/a.csv'] },
    });
    native.receive?.({ payload: { type: 'leave' } });
  });
  expect(dropped).toHaveBeenCalledExactlyOnceWith(['/tmp/a.csv']);
  expect(screen.getByTestId('loader')).not.toHaveAttribute('data-file-hover');
  at.mockReturnValue(screen.getByTestId('overlay'));
  await act(async () => {
    native.receive?.({
      payload: { type: 'drop', position: { x: 120, y: 80 }, paths: ['/tmp/b.csv'] },
    });
  });
  expect(dropped).toHaveBeenCalledTimes(1);
  unmount();
  expect(native.stop).toHaveBeenCalledOnce();
});
it('routes recent-file drags to either surface with no import outside them', async () => {
  const dropped = vi.fn();
  render(<Harness onDrop={dropped} />);
  const dataTransfer = { types: ['application/x-wordflow-file'], getData: () => '/tmp/recent.csv' };
  fireEvent.drop(screen.getByTestId('graph'), { dataTransfer });
  fireEvent.drop(screen.getByTestId('loader'), { dataTransfer });
  fireEvent.drop(screen.getByTestId('overlay'), { dataTransfer });
  await waitFor(() => expect(dropped).toHaveBeenCalledTimes(2));
});
