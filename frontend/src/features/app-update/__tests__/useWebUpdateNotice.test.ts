import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recheckIsDue } from '../webUpdateNotice';

const mocks = vi.hoisted(() => ({ getAppUpdate: vi.fn() }));
vi.mock('@/api', () => ({ getAppUpdate: mocks.getAppUpdate }));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => false }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

const HOUR = 60 * 60 * 1000;

describe('useWebUpdateNotice daily re-check (issue 392)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    mocks.getAppUpdate.mockReset().mockResolvedValue({ data: { update_available: false } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('asks at start and again once a day has passed while the page stays open', async () => {
    const { useWebUpdateNotice } = await import('../useWebUpdateNotice');
    const { unmount } = renderHook(() => useWebUpdateNotice());
    expect(mocks.getAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(23 * HOUR);
    expect(mocks.getAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.getAppUpdate).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(mocks.getAppUpdate).toHaveBeenCalledTimes(2);
  });

  it('is due a full day after the last check', () => {
    expect(recheckIsDue(0, 24 * HOUR - 1)).toBe(false);
    expect(recheckIsDue(0, 24 * HOUR)).toBe(true);
  });
});
