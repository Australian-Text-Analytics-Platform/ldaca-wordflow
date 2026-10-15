import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/isTauri';
import { reportProjectError } from '@/features/project/projectErrors';
import {
  getDocumentTarget,
  tutorialIndexTarget,
  type DocumentTarget,
} from '@/tutorials/documentationRegistry';
import { useUIStore } from '@/stores/uiStore';

/** Native intent is a window-scoped delivery queue; the existing viewer and
 * bundled registry remain the content/navigation owners. */
export function useNativeHelp() {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false,
      revision = 0;
    let stop: (() => void) | undefined;
    const read = async () => {
      const intent = await invoke<{
        revision: number;
        target: Pick<DocumentTarget, 'kind' | 'key'>;
      } | null>('take_pending_help');
      if (!intent || disposed || intent.revision < revision) return;
      revision = intent.revision;
      const target =
        intent.target.kind === 'tutorial' && intent.target.key === 'index'
          ? tutorialIndexTarget
          : getDocumentTarget(intent.target.kind, intent.target.key);
      if (target) useUIStore.getState().openDocument(target);
    };
    void getCurrentWindow()
      .listen('open-help', () => {
        void read().catch(reportProjectError);
      })
      .then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        stop = unlisten;
        await read();
      })
      .catch(reportProjectError);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
}
