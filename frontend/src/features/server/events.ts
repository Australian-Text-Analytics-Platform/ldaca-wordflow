import { request } from '@/api/client';

export interface ProjectEventHandlers {
  tasks: (data: string) => void;
  change: (data: string) => void;
  reset: () => void;
  error: () => void;
}
interface Connection {
  source: EventSource;
  listeners: Set<() => void>;
  project?: { id: string; handlers: ProjectEventHandlers };
}
const connections = new Map<string, Connection>();
function connect(base: string, connection: Omit<Connection, 'source'>): EventSource {
  const query = connection.project
    ? `?project_id=${encodeURIComponent(connection.project.id)}`
    : '';
  const source = new EventSource(`${base}/api/server/events${query}`);
  source.onmessage = () => connection.listeners.forEach((notify) => notify());
  source.onerror = () => {
    connection.project?.handlers.error();
    void request(base, '/api/account', 'get', {}).catch(() => {});
  };
  source.addEventListener('tasks', (event) =>
    connection.project?.handlers.tasks((event as MessageEvent<string>).data),
  );
  source.addEventListener('change', (event) =>
    connection.project?.handlers.change((event as MessageEvent<string>).data),
  );
  source.addEventListener('reset', () => connection.project?.handlers.reset());
  return source;
}
function getConnection(base: string, project?: Connection['project']) {
  let connection = connections.get(base);
  if (!connection) {
    const state = { listeners: new Set<() => void>(), project };
    connection = Object.assign(state, { source: connect(base, state) });
    connections.set(base, connection);
  }
  return connection;
}
function release(base: string, connection: Connection) {
  if (!connection.listeners.size && !connection.project) {
    connection.source.close();
    connections.delete(base);
  }
}

/** Registry, preferences and the selected project share one stream per window. */
export function subscribeServerEvents(base: string, listener: () => void) {
  const connection = getConnection(base);
  connection.listeners.add(listener);
  return () => {
    if (!connection.listeners.delete(listener)) return;
    release(base, connection);
  };
}

export function subscribeProjectEvents(base: string, id: string, handlers: ProjectEventHandlers) {
  const project = { id, handlers };
  const connection = getConnection(base, project);
  if (connection.project !== project) {
    connection.source.close();
    connection.project = project;
    connection.source = connect(base, connection);
  }
  return () => {
    if (connection.project !== project) return;
    connection.source.close();
    connection.project = undefined;
    if (connection.listeners.size) connection.source = connect(base, connection);
    else release(base, connection);
  };
}
