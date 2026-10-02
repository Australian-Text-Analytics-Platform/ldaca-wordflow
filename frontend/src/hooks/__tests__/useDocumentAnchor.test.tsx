import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentAnchor } from '../useDocumentAnchor';

describe('useDocumentAnchor', () => {
  let resize: () => void = () => undefined;
  let anchor: HTMLElement;
  const originalResizeObserver = global.ResizeObserver;

  beforeEach(() => {
    // Calls back once on observe, as browsers do, then on each resize().
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resize = () => {
          callback([], this as unknown as ResizeObserver);
        };
      }
      observe() {
        resize();
      }
      unobserve() {
        /* not used by the hook */
      }
      disconnect() {
        resize = () => undefined;
      }
    } as unknown as typeof ResizeObserver;
    const main = document.createElement('main');
    anchor = document.createElement('span');
    anchor.id = 'help-section';
    main.appendChild(anchor);
    document.body.appendChild(main);
    anchor.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
    document.body.innerHTML = '';
  });

  it('keeps the anchor in view while images above it load', () => {
    renderHook(() => {
      useDocumentAnchor({ activeAnchor: 'help-section', loading: false, error: null });
    });
    expect(anchor.scrollIntoView).toHaveBeenCalledTimes(1);

    resize();
    resize();

    expect(anchor.scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('stops once the reader scrolls', () => {
    renderHook(() => {
      useDocumentAnchor({ activeAnchor: 'help-section', loading: false, error: null });
    });
    window.dispatchEvent(new WheelEvent('wheel'));
    resize();

    expect(anchor.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
