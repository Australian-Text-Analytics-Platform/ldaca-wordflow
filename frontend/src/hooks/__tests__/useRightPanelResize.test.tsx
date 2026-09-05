import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRightPanelResize } from '../useRightPanelResize';

describe('useRightPanelResize', () => {
  afterEach(() => {
    window.localStorage.removeItem('ldaca.layout.asidePanelRatio');
  });

  it('collapses visibility without replacing the user split ratio', () => {
    window.localStorage.setItem('ldaca.layout.asidePanelRatio', '0.4');
    const { result } = renderHook(() => useRightPanelResize());

    expect(result.current.asidePanelRatio).toBe(0.4);
    act(() => {
      result.current.toggleRightPanel();
    });

    expect(result.current.isRightCollapsed).toBe(true);
    expect(result.current.asidePanelRatio).toBe(0.4);

    act(() => {
      result.current.toggleRightPanel();
    });
    expect(result.current.isRightCollapsed).toBe(false);
    expect(result.current.asidePanelRatio).toBe(0.4);
    expect(window.localStorage.getItem('ldaca.layout.asidePanelRatio')).toBe('0.4');
  });
});
