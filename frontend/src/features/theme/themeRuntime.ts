import { useSyncExternalStore } from 'react';
import { patchPreferences } from '@/features/preferences/preferences';

export const LIGHT_THEME = 'light-2026' as const;
export const DARK_THEME = 'dark-2026' as const;

export type ColorTheme = typeof LIGHT_THEME | typeof DARK_THEME;

const listeners = new Set<() => void>();
let activeTheme: ColorTheme = readThemeFromDocument();

function isColorTheme(value: unknown): value is ColorTheme {
  return value === LIGHT_THEME || value === DARK_THEME;
}

function readThemeFromDocument(): ColorTheme {
  if (typeof document === 'undefined') return LIGHT_THEME;
  const value = document.documentElement.dataset.theme;
  return isColorTheme(value) ? value : LIGHT_THEME;
}

function updateThemeColor(theme: ColorTheme) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === DARK_THEME ? '#191A1B' : '#FAFAFD');
}

export function applyColorTheme(theme: ColorTheme, persist = true) {
  if (typeof document === 'undefined') return;
  if (persist) {
    void patchPreferences({ theme }).catch(() => undefined);
    return;
  }

  const changed = activeTheme !== theme;
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === DARK_THEME ? 'dark' : 'light';
  updateThemeColor(theme);

  if (changed) {
    listeners.forEach((listener) => {
      listener();
    });
  }
}

export function getActiveTheme(): ColorTheme {
  return activeTheme;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveTheme(): ColorTheme {
  return useSyncExternalStore(subscribe, getActiveTheme, () => LIGHT_THEME);
}
