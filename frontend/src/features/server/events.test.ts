import { expect, it, vi } from 'vite-plus/test';
vi.mock('@/api/client', () => ({ request: vi.fn() }));
import { subscribeServerEvents, subscribeProjectEvents } from './events';

it('shares the user event connection and keeps it open until both consumers leave', () => {
  const sources: { onmessage?: () => void; close: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'EventSource',
    class extends EventTarget {
      close = vi.fn();
      constructor() {
        super();
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

it('multiplexes native events and restores registry updates when switching projects', () => {
  const sources: (EventTarget & {
    url: string;
    onmessage?: () => void;
    close: ReturnType<typeof vi.fn>;
  })[] = [];
  vi.stubGlobal(
    'EventSource',
    class extends EventTarget {
      close = vi.fn();
      constructor(public url: string) {
        super();
        sources.push(this);
      }
    },
  );
  const registry = vi.fn();
  const tasks = vi.fn();
  const stopRegistry = subscribeServerEvents('/shared', registry);
  const stopProject = subscribeProjectEvents('/shared', 'one', {
    tasks,
    change: vi.fn(),
    reset: vi.fn(),
    error: vi.fn(),
  });
  try {
    expect(sources[0]!.close).toHaveBeenCalledOnce();
    expect(sources[1]!.url).toBe('/shared/api/server/events?project_id=one');
    sources[1]!.onmessage!();
    sources[1]!.dispatchEvent(new MessageEvent('tasks', { data: 'snapshot' }));
    expect(tasks).toHaveBeenCalledWith('snapshot');
    expect(registry).toHaveBeenCalledOnce();
    stopProject();
    expect(sources[1]!.close).toHaveBeenCalledOnce();
    expect(sources[2]!.url).toBe('/shared/api/server/events');
    sources[2]!.onmessage!();
    expect(registry).toHaveBeenCalledTimes(2);
  } finally {
    stopProject();
    stopRegistry();
    vi.unstubAllGlobals();
  }
});
