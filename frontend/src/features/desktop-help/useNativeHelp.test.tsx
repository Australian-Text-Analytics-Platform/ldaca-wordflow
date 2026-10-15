import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '@/stores/uiStore';
import { useNativeHelp } from './useNativeHelp';
const native = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn(), desktop: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ listen: native.listen }) }));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => native.desktop }));
beforeEach(() => {
  vi.clearAllMocks();
  native.desktop = true;
  native.listen.mockResolvedValue(native.stop);
  vi.mocked(invoke).mockResolvedValue(null);
  useUIStore.setState({ documentTarget: null });
});
it('opens queued home after subscribing and ignores superseded native deliveries', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    revision: 1,
    target: { kind: 'tutorial', key: 'index' },
  });
  const view = renderHook(useNativeHelp);
  await waitFor(() =>
    expect(useUIStore.getState().documentTarget?.file).toBe('tutorials/index.md'),
  );
  const receive = native.listen.mock.calls[0]![1] as () => void;
  let finish: (value: unknown) => void = () => {};
  vi.mocked(invoke)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce({ revision: 3, target: { kind: 'tutorial', key: 'ui.data-selection' } });
  act(() => {
    receive();
    receive();
  });
  await waitFor(() => expect(useUIStore.getState().documentTarget?.key).toBe('ui.data-selection'));
  await act(async () => {
    finish({ revision: 2, target: { kind: 'tutorial', key: 'ui.tool-choice' } });
  });
  expect(useUIStore.getState().documentTarget?.key).toBe('ui.data-selection');
  view.unmount();
  expect(native.stop).toHaveBeenCalledOnce();
});
it('cleans up a listener that resolves after unmount and leaves the browser unchanged', async () => {
  let finish: (value: () => void) => void = () => {};
  native.listen.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = renderHook(useNativeHelp);
  view.unmount();
  await act(async () => {
    finish(native.stop);
  });
  expect(native.stop).toHaveBeenCalledOnce();
  expect(invoke).not.toHaveBeenCalled();
  native.desktop = false;
  renderHook(useNativeHelp);
  expect(native.listen).toHaveBeenCalledOnce();
});
