import { expect, it, vi } from 'vite-plus/test';
vi.mock('@/api/client', () => ({ request: vi.fn() }));
import { subscribeServerEvents } from './events';

it('shares the user event connection and keeps it open until both consumers leave', () => {
  const sources: { onmessage?: () => void; close: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'EventSource',
    class {
      close = vi.fn();
      constructor() {
        sources.push(this);
      }
    },
  );
  const preferences = vi.fn();
  const registry = vi.fn();
  const stopPreferences = subscribeServerEvents('/wordflow', preferences);
  const stopRegistry = subscribeServerEvents('/wordflow', registry);
  try {
    expect(sources).toHaveLength(1);
    sources[0]!.onmessage!();
    expect(preferences).toHaveBeenCalledOnce();
    expect(registry).toHaveBeenCalledOnce();
    stopRegistry();
    expect(sources[0]!.close).not.toHaveBeenCalled();
    sources[0]!.onmessage!();
    expect(preferences).toHaveBeenCalledTimes(2);
    expect(registry).toHaveBeenCalledOnce();
    stopPreferences();
    expect(sources[0]!.close).toHaveBeenCalledOnce();
  } finally {
    stopRegistry();
    stopPreferences();
    vi.unstubAllGlobals();
  }
});
