import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useZoom } from '../useZoom';

const press = (key: string, init: KeyboardEventInit = { metaKey: true }) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
};

describe('useZoom keyboard shortcuts', () => {
  const appZoom = vi.fn();

  afterEach(() => {
    window.removeEventListener('keydown', appZoom);
    appZoom.mockReset();
  });

  it('zooms with Cmd/Ctrl and +, - and 0', () => {
    const { result } = renderHook(() => useZoom({ keyboardShortcuts: true }));
    press('=');
    press('+', { ctrlKey: true });
    expect(result.current.zoom).toBe(1.2);
    press('-');
    expect(result.current.zoom).toBe(1.1);
    press('0');
    expect(result.current.zoom).toBe(1);
  });

  it("keeps a zoom key from the desktop app's whole-window zoom", () => {
    // Tauri's zoom script is a plain keydown listener on window, added before
    // the page's own code, that does not check defaultPrevented.
    window.addEventListener('keydown', appZoom);
    const { unmount } = renderHook(() => useZoom({ keyboardShortcuts: true }));

    expect(press('=').defaultPrevented).toBe(true);
    press('-');
    press('0');
    expect(appZoom).not.toHaveBeenCalled();

    // Other keys, and zoom keys once the viewer has closed, pass through.
    expect(press('f').defaultPrevented).toBe(false);
    expect(appZoom).toHaveBeenCalledTimes(1);
    unmount();
    press('=');
    expect(appZoom).toHaveBeenCalledTimes(2);
  });

  it('leaves the keys alone when shortcuts are off', () => {
    window.addEventListener('keydown', appZoom);
    const { result } = renderHook(() => useZoom());
    expect(press('=').defaultPrevented).toBe(false);
    expect(result.current.zoom).toBe(1);
    expect(appZoom).toHaveBeenCalledTimes(1);
  });
});
