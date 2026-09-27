import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStackedSplits } from '../useStackedSplits';

describe('useStackedSplits', () => {
  it('derives collapse state and flex ratios from the latest render state', () => {
    const { result } = renderHook(() =>
      useStackedSplits(['tools', 'nodes'] as const, {
        initialRatios: { tools: 0.4, nodes: 0.6 },
      }),
    );

    expect(result.current.getSectionFlexStyle('tools')).toMatchObject({ flexGrow: 0.4 });

    act(() => {
      result.current.toggleSection('tools');
    });

    expect(result.current.isCollapsed('tools')).toBe(true);
    expect(result.current.getSectionFlexStyle('tools')).toEqual({ flex: '0 0 auto' });
    expect(result.current.getSectionFlexStyle('nodes')).toMatchObject({ flexGrow: 1 });
  });

  it('uses section-specific minimum heights while resizing stacked sections', () => {
    const { result } = renderHook(() =>
      useStackedSplits(['nodes', 'tasks'] as const, {
        minSectionPx: 120,
        sectionMinPx: { tasks: 56 },
        initialRatios: { nodes: 0.8, tasks: 0.2 },
      }),
    );

    act(() => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'getBoundingClientRect', {
        value: () => ({ height: 400 }),
      });
      result.current.containerRef.current = container;
    });

    const handle = document.createElement('div');
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn().mockReturnValue(true);
    handle.releasePointerCapture = vi.fn();

    act(() => {
      result.current.handleResizeStart('nodes', 'tasks', {
        button: 0,
        clientY: 0,
        pointerId: 7,
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    expect(result.current.resizingLowerKey).toBe('tasks');

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { clientY: 200, pointerId: 7 }));
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }));
    });

    expect(result.current.getSectionFlexStyle('nodes')).toMatchObject({ flexGrow: 0.86 });
    expect(result.current.getSectionFlexStyle('tasks')).toMatchObject({ flexGrow: 0.14 });
    expect(result.current.resizingLowerKey).toBeNull();
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    'clears active drag state on %s',
    (eventType) => {
      const { result } = renderHook(() =>
        useStackedSplits(['tools', 'nodes'] as const, {
          initialRatios: { tools: 0.5, nodes: 0.5 },
        }),
      );
      const handle = document.createElement('div');
      handle.setPointerCapture = vi.fn();
      handle.hasPointerCapture = vi.fn().mockReturnValue(true);
      handle.releasePointerCapture = vi.fn();

      act(() => {
        result.current.containerRef.current = Object.assign(document.createElement('div'), {
          getBoundingClientRect: () => ({ height: 400 }),
        });
        result.current.handleResizeStart('tools', 'nodes', {
          button: 0,
          clientY: 0,
          pointerId: 3,
          currentTarget: handle,
          preventDefault: vi.fn(),
        } as unknown as React.PointerEvent<HTMLDivElement>);
      });
      expect(result.current.resizingLowerKey).toBe('nodes');

      act(() => {
        handle.dispatchEvent(new PointerEvent(eventType, { pointerId: 3 }));
      });

      expect(result.current.resizingLowerKey).toBeNull();
    },
  );

  it('does not start a drag across a collapsed section boundary', () => {
    const { result } = renderHook(() => useStackedSplits(['tools', 'nodes'] as const));

    act(() => {
      result.current.toggleSection('tools');
    });
    act(() => {
      result.current.handleResizeStart('tools', 'nodes', {
        button: 0,
        clientY: 0,
        pointerId: 5,
        currentTarget: document.createElement('div'),
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    expect(result.current.resizingLowerKey).toBeNull();
  });
});
