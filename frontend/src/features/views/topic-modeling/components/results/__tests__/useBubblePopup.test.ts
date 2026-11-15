import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUBBLE_POPUP_CLOSE_DELAY_MS,
  BUBBLE_POPUP_OPEN_DELAY_MS,
  useBubblePopup,
} from '../useBubblePopup';

const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('useBubblePopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after the pointer rests on a bubble, not while it sweeps past', () => {
    const { result } = renderHook(() => useBubblePopup(true));

    act(() => {
      result.current.bubbleEnter(1);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS - 1);
    act(() => {
      result.current.bubbleLeave(1);
      result.current.bubbleEnter(2);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS - 1);
    expect(result.current.popupId).toBeNull();
    wait(1);
    expect(result.current.popupId).toBe(2);
  });

  it('keeps the open card while it closes, then opens the bubble under the pointer', () => {
    const { result } = renderHook(() => useBubblePopup(true));
    act(() => {
      result.current.bubbleEnter(1);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS);

    // On the way to the card, the pointer crosses bubble 2: no swap.
    act(() => {
      result.current.bubbleLeave(1);
      result.current.bubbleEnter(2);
    });
    wait(BUBBLE_POPUP_CLOSE_DELAY_MS - 1);
    expect(result.current.popupId).toBe(1);

    // The pointer stayed on bubble 2: once card 1 closes, card 2 opens.
    wait(1);
    expect(result.current.popupId).toBeNull();
    wait(BUBBLE_POPUP_OPEN_DELAY_MS);
    expect(result.current.popupId).toBe(2);
  });

  it('stays open while the pointer is in the card, and comes back with the bubble', () => {
    const { result } = renderHook(() => useBubblePopup(true));
    act(() => {
      result.current.bubbleEnter(1);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS);
    act(() => {
      result.current.bubbleLeave(1);
      result.current.popupEnter();
    });
    wait(BUBBLE_POPUP_CLOSE_DELAY_MS * 4);
    expect(result.current.popupId).toBe(1);

    act(() => {
      result.current.popupLeave();
      result.current.bubbleEnter(1);
    });
    wait(BUBBLE_POPUP_CLOSE_DELAY_MS * 2);
    expect(result.current.popupId).toBe(1);
  });

  it('holds the card while Shift is down and lets it close after Shift is released', () => {
    const { result } = renderHook(() => useBubblePopup(true));
    act(() => {
      result.current.bubbleEnter(1);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      result.current.bubbleLeave(1);
      result.current.bubbleEnter(2);
    });
    wait(BUBBLE_POPUP_CLOSE_DELAY_MS * 4);
    expect(result.current.popupId).toBe(1);

    act(() => {
      result.current.bubbleLeave(2);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    });
    wait(BUBBLE_POPUP_CLOSE_DELAY_MS);
    expect(result.current.popupId).toBeNull();
  });

  it('closes the card and opens none while disabled (lasso mode)', () => {
    const { result, rerender } = renderHook(({ enabled }) => useBubblePopup(enabled), {
      initialProps: { enabled: true },
    });
    act(() => {
      result.current.bubbleEnter(1);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS);
    expect(result.current.popupId).toBe(1);

    rerender({ enabled: false });
    expect(result.current.popupId).toBeNull();
    act(() => {
      result.current.bubbleEnter(2);
    });
    wait(BUBBLE_POPUP_OPEN_DELAY_MS);
    expect(result.current.popupId).toBeNull();
  });
});
