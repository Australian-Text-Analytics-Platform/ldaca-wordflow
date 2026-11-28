import { useState, useEffect } from 'react';
import { DOC_ZOOM_MIN, DOC_ZOOM_MAX, DOC_ZOOM_STEP } from '@/config/layout';

interface UseZoomOptions {
  /** Whether to listen for Ctrl/Cmd +/-/0 keyboard shortcuts. */
  keyboardShortcuts?: boolean;
  /** Initial zoom level, and the level Reset returns to (default 1 = 100%). */
  initial?: number;
  /** Bounds and step; the defaults are the Help text's. */
  min?: number;
  max?: number;
  step?: number;
}

/** Generic zoom controls with optional keyboard shortcut listeners. */
export const useZoom = ({
  keyboardShortcuts = false,
  initial = 1,
  min = DOC_ZOOM_MIN,
  max = DOC_ZOOM_MAX,
  step = DOC_ZOOM_STEP,
}: UseZoomOptions = {}) => {
  const [zoom, setZoom] = useState(initial);

  const stepBy = (direction: 1 | -1) => {
    setZoom((z) => Math.min(max, Math.max(min, parseFloat((z + direction * step).toFixed(2)))));
  };
  const zoomIn = () => {
    stepBy(1);
  };
  const zoomOut = () => {
    stepBy(-1);
  };
  const zoomReset = () => {
    setZoom(initial);
  };

  useEffect(() => {
    if (!keyboardShortcuts) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(max, parseFloat((z + step).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((z) => Math.max(min, parseFloat((z - step).toFixed(2))));
      } else if (e.key === '0') {
        setZoom(initial);
      } else {
        return;
      }
      // The shortcut belongs to this viewer while it is open. preventDefault
      // stops a browser's page zoom. The desktop app's whole-window zoom is a
      // script Tauri adds (zoomHotkeysEnabled) that listens on window and
      // ignores preventDefault, so the key is caught on the way down and
      // stopped before it gets there; otherwise both zooms change at once.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [keyboardShortcuts, initial, min, max, step]);

  return { zoom, zoomIn, zoomOut, zoomReset, canZoomIn: zoom < max, canZoomOut: zoom > min };
};
