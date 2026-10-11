import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import type { components } from '@/api/generated/native';
import { request } from '@/api/client';
import { isTauri } from '@/lib/isTauri';
import { applyColorTheme } from '@/features/theme/themeRuntime';
import { serverBase as standaloneBase } from '@/features/server/context';
import { subscribeServerEvents } from '@/features/server/events';

type WirePreferences = components['schemas']['Preferences'];
export type Preferences = WirePreferences &
  Required<Pick<WirePreferences, 'hiddenTools' | 'guidance'>>;
export type PreferencesPatch = components['schemas']['PreferencesPatch'];
export const defaultPreferences: Preferences = {
  schemaVersion: 2,
  theme: 'light-2026',
  layout: { sidebarWidth: 208, asidePanelRatio: 0.3, projectGraphRatio: 0.5 },
  recentDataFiles: [],
  hiddenTools: [],
  guidance: { enabled: true, acknowledgments: {} },
};
let current = defaultPreferences;
let base = '';
let ready = false;
let writer = Promise.resolve();
const listeners = new Set<() => void>();
export function getPreferences() {
  return current;
}
export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function acceptPreferences(next: WirePreferences) {
  current = {
    ...next,
    hiddenTools: next.hiddenTools ?? [],
    guidance: next.guidance ?? defaultPreferences.guidance,
  };
  applyColorTheme(next.theme, false);
  listeners.forEach((listener) => {
    listener();
  });
}
export function usePreferences() {
  return useSyncExternalStore(subscribePreferences, getPreferences);
}
async function read() {
  return isTauri()
    ? invoke<Preferences>('get_preferences')
    : (await request(base, '/api/preferences', 'get', {})).json();
}
function refreshPreferences() {
  const result = writer.then(async () => {
    acceptPreferences(await read());
  });
  writer = result.catch(() => {});
  return result;
}
export async function initializePreferences(serverBase: string) {
  base = serverBase;
  ready = false;
  const changed = () => {
    void refreshPreferences().catch(reportPreferenceFailure);
  };
  // Subscribe before reading so no change between the initial read and listener setup is lost.
  const stop = isTauri()
    ? await listen<Preferences>('preferences-changed', changed)
    : standaloneBase() !== null
      ? subscribeServerEvents(base, changed)
      : (() => {
          const events = new EventSource(`${base}/api/preferences/events`);
          events.onmessage = changed;
          events.onerror = () => {
            // A revoked or expired stream must clear this window's account state.
            // Transient network failures retain EventSource's normal reconnect behavior.
            void request(base, '/api/account', 'get', {}).catch(() => {});
          };
          return () => {
            events.close();
          };
        })();
  try {
    await refreshPreferences();
    ready = true;
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
export function patchPreferences(patch: PreferencesPatch): Promise<void> {
  // Serialize local requests; every host applies only these fields to its latest state.
  const result = writer.then(async () => {
    if (!ready) throw new Error('Preferences have not been loaded');
    const next = isTauri()
      ? await invoke<Preferences>('patch_preferences', { patch })
      : await (await request(base, '/api/preferences', 'patch', { body: patch })).json();
    acceptPreferences(next);
  });
  writer = result.catch(reportPreferenceFailure);
  return result;
}
export function reportPreferenceFailure(error: unknown) {
  toast.error('Preferences could not be saved or loaded', {
    description: error instanceof Error ? error.message : String(error),
  });
}
export async function resetPreferences(serverBase: string) {
  base = serverBase;
  const next = isTauri()
    ? await invoke<Preferences>('reset_preferences')
    : await (await request(base, '/api/preferences/reset', 'post', {})).json();
  acceptPreferences(next);
}
export type LayoutKey = keyof Preferences['layout'];
export function layoutKey(key: string | undefined): LayoutKey | undefined {
  if (key === 'ldaca.layout.sidebarWidth') return 'sidebarWidth';
  if (key === 'ldaca.layout.asidePanelRatio') return 'asidePanelRatio';
  if (key === 'ldaca.layout.projectGraphRatio') return 'projectGraphRatio';
  return undefined;
}
