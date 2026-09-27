import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useResizableSplit } from '../useResizableSplit';

describe('useResizableSplit pointer dragging', () => {
  it('tracks captured movement on the separator and cleans up after pointer release', () => {
    const { result } = renderHook(() =>
      useResizableSplit({
        mode: 'pixel',
        defaultValue: 100,
        min: 50,
        max: 300,
      }),
    );
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    result.current.containerRef.current = container;

    const handle = document.createElement('div');
    handle.hasPointerCapture = vi.fn(() => true);
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();

    act(() => {
      result.current.splitterProps.onPointerDown({
        preventDefault: vi.fn(),
        pointerId: 7,
        currentTarget: handle,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientY: 180 }));
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }));
    });

    expect(result.current.value).toBe(180);
    expect(result.current.isDragging).toBe(false);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientY: 250 }));
    });
    expect(result.current.value).toBe(180);
  });

  it.each(['pointercancel', 'lostpointercapture'])('ends a drag on %s', (eventType) => {
    const { result } = renderHook(() => useResizableSplit({ defaultValue: 0.4 }));
    const handle = document.createElement('div');
    handle.hasPointerCapture = vi.fn(() => true);
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();

    act(() => {
      result.current.splitterProps.onPointerDown({
        preventDefault: vi.fn(),
        pointerId: 11,
        currentTarget: handle,
      } as unknown as React.PointerEvent<HTMLDivElement>);
      handle.dispatchEvent(new PointerEvent(eventType, { pointerId: 11 }));
    });

    expect(result.current.isDragging).toBe(false);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(11);
  });
});

describe('useResizableSplit persistence', () => {
  it.each([
    { stored: '0.08', expected: 0.2 },
    { stored: '0.92', expected: 0.8 },
  ])(
    'clamps a restored percent value of $stored to its configured bounds',
    ({ stored, expected }) => {
      window.localStorage.setItem('test.split', stored);

      const { result, unmount } = renderHook(() =>
        useResizableSplit({
          defaultValue: 0.5,
          min: 0.2,
          max: 0.8,
          persistKey: 'test.split',
        }),
      );

      expect(result.current.value).toBe(expected);
      expect(result.current.splitterProps['aria-valuenow']).toBe(expected * 100);
      expect(window.localStorage.getItem('test.split')).toBe(String(expected));

      unmount();
      window.localStorage.removeItem('test.split');
    },
  );
});

describe('useResizableSplit sizing', () => {
  it('uses the configured default for keyboard and double-click resets', () => {
    const { result } = renderHook(() => useResizableSplit({ defaultValue: 0.3 }));
    for (const key of ['Enter', ' ']) {
      act(() =>
        result.current.splitterProps.onKeyDown({
          key,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLDivElement>),
      );
      expect(result.current.value).toBe(0.3);
    }
    act(() => result.current.splitterProps.onDoubleClick());
    expect(result.current.value).toBe(0.3);
  });

  it('caps restored and keyboard sizes against the measured container without losing the preferred ratio', () => {
    let width = 2000;
    let resize: ResizeObserverCallback | undefined;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({
        width,
        height: 900,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 900,
        toJSON: () => ({}),
      }));
    const observer = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {
        /* Layout is measured on mount. */
      }
      unobserve() {
        /* No individual targets are removed. */
      }
      disconnect() {
        /* Test observer has no external resources. */
      }
    } as typeof ResizeObserver;
    localStorage.setItem('test.capped', '0.8');
    function Split() {
      const split = useResizableSplit({
        orientation: 'vertical',
        anchor: 'end',
        defaultValue: 0.3,
        min: 0.15,
        max: 0.8,
        maxPixels: 800,
        persistKey: 'test.capped',
      });
      return (
        <div ref={split.containerRef}>
          <div {...split.splitterProps} />
        </div>
      );
    }
    const view = render(<Split />);
    try {
      const handle = screen.getByRole('separator');
      expect(handle).toHaveAttribute('aria-valuenow', '40');
      expect(handle).toHaveAttribute('aria-valuemax', '40');
      expect(localStorage.getItem('test.capped')).toBe('0.8');
      width = 1000;
      act(() => resize?.([], {} as ResizeObserver));
      expect(handle).toHaveAttribute('aria-valuenow', '80');
      width = 2000;
      act(() => resize?.([], {} as ResizeObserver));
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(handle).toHaveAttribute('aria-valuenow', '35');
      fireEvent.keyDown(handle, { key: 'End' });
      expect(handle).toHaveAttribute('aria-valuenow', '40');
      fireEvent.doubleClick(handle);
      expect(handle).toHaveAttribute('aria-valuenow', '30');
    } finally {
      view.unmount();
      rect.mockRestore();
      globalThis.ResizeObserver = observer;
      localStorage.removeItem('test.capped');
    }
  });
});
