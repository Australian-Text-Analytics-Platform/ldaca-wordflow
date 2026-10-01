import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const patch = vi.hoisted(() => vi.fn());
vi.mock('@/features/preferences/preferences', () => ({ patchPreferences: patch }));
import {
  applyColorTheme,
  DARK_THEME,
  getActiveTheme,
  LIGHT_THEME,
  useActiveTheme,
} from '../themeRuntime';
describe('theme runtime', () => {
  beforeEach(() => {
    patch.mockResolvedValue(undefined);
    applyColorTheme(LIGHT_THEME, false);
    localStorage.clear();
  });
  it('publishes a confirmed host theme to the root and subscribers', () => {
    const view = renderHook(() => useActiveTheme());
    act(() => applyColorTheme(DARK_THEME, false));
    expect(view.result.current).toBe(DARK_THEME);
    expect(getActiveTheme()).toBe(DARK_THEME);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.length).toBe(0);
  });
  it('requests a field patch and waits for host confirmation', () => {
    applyColorTheme(DARK_THEME);
    expect(patch).toHaveBeenCalledWith({ theme: DARK_THEME });
    expect(getActiveTheme()).toBe(LIGHT_THEME);
  });
  it('ignores obsolete browser-local theme events', () => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'ldaca-color-theme-v1', newValue: DARK_THEME }),
    );
    expect(getActiveTheme()).toBe(LIGHT_THEME);
  });
});
