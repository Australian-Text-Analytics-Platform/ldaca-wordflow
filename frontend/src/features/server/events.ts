import { request } from '@/api/client';

const connections = new Map<string, { source: EventSource; listeners: Set<() => void> }>();

/** Preference and registry subscribers share one user-scoped connection per window. */
export function subscribeServerEvents(base: string, listener: () => void) {
  let connection = connections.get(base);
  if (!connection) {
    const source = new EventSource(`${base}/api/server/events`);
    const listeners = new Set<() => void>();
    source.onmessage = () => {
      listeners.forEach((notify) => notify());
    };
    source.onerror = () => {
      void request(base, '/api/account', 'get', {}).catch(() => {});
    };
    connection = { source, listeners };
    connections.set(base, connection);
  }
  const active = connection;
  active.listeners.add(listener);
  return () => {
    if (!active.listeners.delete(listener)) return;
    if (!active.listeners.size) {
      active.source.close();
      connections.delete(base);
    }
  };
}
