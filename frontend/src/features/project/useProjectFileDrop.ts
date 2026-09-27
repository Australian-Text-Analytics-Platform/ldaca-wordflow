import { useEffect, useEffectEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isTauri } from '@/lib/isTauri';
import { isMacOSDesktop } from '@/lib/isMacOSDesktop';
import { reportProjectError } from './projectErrors';

/** One window-level owner routes both native files and recent-file drags. */
export function useProjectFileDrop(
  onDrop: (paths: string[]) => void,
  onBrowserDrop?: (files: File[]) => void,
) {
  const receive = useEffectEvent(onDrop);
  const receiveFiles = useEffectEvent((files: File[]) => onBrowserDrop?.(files));
  const browserEnabled = Boolean(onBrowserDrop);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let highlighted: Element | null = null;
    let unlisten: (() => void) | undefined;
    const targetAt = (target: EventTarget | null) =>
      target instanceof Element ? target.closest('[data-project-file-drop]') : null;
    const highlight = (target: Element | null) => {
      highlighted?.removeAttribute('data-file-hover');
      highlighted = target;
      highlighted?.setAttribute('data-file-hover', 'true');
    };
    const dragOver = (event: DragEvent) => {
      if (
        !event.dataTransfer?.types.includes('application/x-wordflow-file') &&
        !(browserEnabled && event.dataTransfer?.types.includes('Files'))
      )
        return;
      const target = targetAt(event.target);
      highlight(target);
      if (target) event.preventDefault();
    };
    const leave = (event: DragEvent) => {
      if (!event.relatedTarget) highlight(null);
    };
    const end = () => {
      highlight(null);
    };
    const drop = (event: DragEvent) => {
      highlight(null);
      if (browserEnabled && event.dataTransfer?.files.length && targetAt(event.target)) {
        event.preventDefault();
        receiveFiles(Array.from(event.dataTransfer.files));
        return;
      }
      const path = event.dataTransfer?.getData('application/x-wordflow-file');
      if (path && targetAt(event.target)) {
        event.preventDefault();
        receive([path]);
      }
    };
    document.addEventListener('dragover', dragOver);
    document.addEventListener('dragleave', leave);
    document.addEventListener('dragend', end);
    document.addEventListener('drop', drop);
    if (isTauri()) {
      const webview = getCurrentWebview();
      void webview
        .onDragDropEvent((event) => {
          const current = ++revision;
          const payload = event.payload;
          if (disposed) return;
          if (payload.type === 'leave') {
            highlight(null);
            return;
          }
          // Wry reports AppKit points on macOS and physical pixels on Windows.
          void Promise.all([
            webview.size(),
            isMacOSDesktop() ? getCurrentWindow().scaleFactor() : 1,
          ])
            .then(([size, scale]) => {
              if (disposed || (payload.type !== 'drop' && current !== revision)) return;
              const x = (payload.position.x * scale * window.innerWidth) / size.width;
              const y = (payload.position.y * scale * window.innerHeight) / size.height;
              // Hit testing excludes the Data View and dialogs covering either target.
              const target = targetAt(document.elementFromPoint(x, y));
              if (payload.type === 'drop') {
                highlight(null);
                if (target) receive(payload.paths);
              } else highlight(target);
            })
            .catch((error: unknown) => {
              if (!disposed) reportProjectError(error);
            });
        })
        .then((stop) => {
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(reportProjectError);
    }
    return () => {
      disposed = true;
      unlisten?.();
      highlight(null);
      document.removeEventListener('dragover', dragOver);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('dragend', end);
      document.removeEventListener('drop', drop);
    };
  }, [browserEnabled]);
}
