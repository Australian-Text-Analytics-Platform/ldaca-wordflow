import { beforeEach, expect, it, vi } from 'vite-plus/test';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), native: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@/lib/isTauri', () => ({ isTauri: mocks.native }));
import {
  acceptPreferences,
  defaultPreferences,
  getPreferences,
  initializePreferences,
  patchPreferences,
} from './preferences';
beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.listen.mockResolvedValue(vi.fn());
  acceptPreferences(defaultPreferences);
});
it('loads before use and rereads confirmed native changes across windows', async () => {
  mocks.invoke.mockResolvedValue({ ...defaultPreferences, theme: 'dark-2026' });
  await initializePreferences('');
  expect(getPreferences().theme).toBe('dark-2026');
  mocks.invoke.mockResolvedValue({
    ...defaultPreferences,
    layout: { ...defaultPreferences.layout, sidebarWidth: 300 },
  });
  const listener = mocks.listen.mock.calls[0][1] as () => void;
  listener();
  await vi.waitFor(() => expect(getPreferences().layout.sidebarWidth).toBe(300));
  expect(getPreferences().layout.sidebarWidth).toBe(300);
});
it('serializes field patches and preserves the confirmed state after a failed save', async () => {
  mocks.invoke.mockResolvedValueOnce(defaultPreferences);
  await initializePreferences('');
  const before = getPreferences();
  mocks.invoke.mockRejectedValueOnce(new Error('disk full'));
  await expect(patchPreferences({ theme: 'dark-2026' })).rejects.toThrow('disk full');
  expect(getPreferences()).toBe(before);
  mocks.invoke.mockResolvedValueOnce({ ...before, theme: 'dark-2026' });
  await patchPreferences({ theme: 'dark-2026' });
  expect(mocks.invoke).toHaveBeenLastCalledWith('patch_preferences', {
    patch: { theme: 'dark-2026' },
  });
  expect(getPreferences().theme).toBe('dark-2026');
});
it('reports invalid initial files without overwriting them', async () => {
  mocks.invoke.mockRejectedValueOnce(new Error('Unsupported preferences schema'));
  await expect(initializePreferences('')).rejects.toThrow('Unsupported preferences schema');
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).toHaveBeenCalledWith('get_preferences');
});
