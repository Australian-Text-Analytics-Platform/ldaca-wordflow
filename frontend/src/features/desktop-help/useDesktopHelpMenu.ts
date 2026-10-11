/**
 * Connects the desktop Help menu to Wordflow's help (Chao, 2026-10-12): sends
 * the help topics for its search field, and opens the page chosen there, or
 * the help home for Help > Wordflow Help. Does nothing in a browser.
 */
import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { isTauri } from '@/lib/isTauri';
import { useUIStore } from '@/stores/uiStore';
import { getDocumentTarget, tutorialIndexTarget } from '@/tutorials/documentationRegistry';
import { useRegistryStore } from '@/tutorials/registryStore';
import { helpMenuTopics, parseHelpMenuTopic } from './helpMenuTopics';

export function useDesktopHelpMenu() {
  const registry = useRegistryStore((state) => state.registry);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke('set_help_topics', { topics: helpMenuTopics(registry) }).catch(() => undefined);
  }, [registry]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisteners = [
      listen<string>('open-help-topic', ({ payload }) => {
        const topic = parseHelpMenuTopic(payload);
        const target = topic ? getDocumentTarget(topic.kind, topic.key) : null;
        if (target) useUIStore.getState().openDocument(target);
      }),
      listen('open-help-home', () => {
        useUIStore.getState().openDocument(tutorialIndexTarget);
      }),
    ];
    return () => {
      for (const unlisten of unlisteners) {
        void unlisten.then((stop) => {
          stop();
        });
      }
    };
  }, []);
}
