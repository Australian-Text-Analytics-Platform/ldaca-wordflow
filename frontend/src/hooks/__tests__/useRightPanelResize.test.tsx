import {
  acceptPreferences,
  defaultPreferences,
  getPreferences,
} from '@/features/preferences/preferences';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useRightPanelResize } from '../useRightPanelResize';

describe('useRightPanelResize', () => {
  afterEach(() => {
    acceptPreferences(defaultPreferences);
  });

  it('collapses visibility without replacing the user split ratio', () => {
    acceptPreferences({
      ...defaultPreferences,
      layout: { ...defaultPreferences.layout, asidePanelRatio: 0.4 },
    });
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
    expect(String(getPreferences().layout.asidePanelRatio)).toBe('0.4');
  });
});

vi.mock('@/features/preferences/preferences', async (load) => {
  const actual = await load<typeof import('@/features/preferences/preferences')>();
  return {
    ...actual,
    patchPreferences: vi.fn(async (patch) => {
      const current = actual.getPreferences();
      actual.acceptPreferences({
        ...current,
        ...patch,
        layout: { ...current.layout, ...patch.layout },
        recentDataFiles: patch.recentDataFiles ?? current.recentDataFiles,
      });
    }),
  };
});
