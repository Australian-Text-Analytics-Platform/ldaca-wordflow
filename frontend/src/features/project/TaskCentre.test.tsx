import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskCentre } from './TaskCentre';
import { useNativeTasks } from './useNativeTasks';
import * as api from './api';
import { reportProjectError } from './projectErrors';
vi.mock('./api', () => ({ getTasks: vi.fn(), cancelTask: vi.fn(), dismissTask: vi.fn() }));
vi.mock('./projectErrors', () => ({ reportProjectError: vi.fn() }));

class Stream extends EventTarget {
  static current: Stream;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    super();
    Stream.current = this;
  }
  send(revision: number, tasks: api.NativeTask[]) {
    act(() => {
      this.dispatchEvent(new MessageEvent('tasks', { data: JSON.stringify({ revision, tasks }) }));
    });
  }
}
const task = (state: api.NativeTask['state'] = 'running'): api.NativeTask => ({
  id: 'one',
  label: 'Inspect corpus',
  state,
  created_at: 1,
  started_at: 2,
  finished_at: ['running', 'queued', 'cancelling'].includes(state) ? null : 3,
  progress: { message: 'Reading', fraction: null },
  error:
    state === 'failed' ? { code: 'sql_error', message: 'Query failed', statement_index: 1 } : null,
});
function ObservedTasks() {
  const controller = useNativeTasks('http://project');
  return <TaskCentre {...controller} />;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ObservedTasks />
    </QueryClientProvider>,
  );
  return { ...view, client, stream: Stream.current };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('EventSource', Stream);
  vi.mocked(api.getTasks).mockResolvedValue({ revision: 0, tasks: [] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps a newer stream snapshot when the initial HTTP request finishes late', async () => {
  let resolve!: (snapshot: api.TaskSnapshot) => void;
  vi.mocked(api.getTasks).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { stream, unmount } = mount();
  stream.send(2, [task()]);
  expect(await screen.findByRole('button', { name: /Task: Inspect corpus/ })).toBeInTheDocument();
  await act(async () => {
    resolve({ revision: 0, tasks: [] });
  });
  expect(screen.getByRole('button', { name: /Task: Inspect corpus/ })).toBeInTheDocument();
  stream.send(1, []);
  expect(screen.getByRole('button', { name: /Task: Inspect corpus/ })).toBeInTheDocument();
  unmount();
  expect(stream.close).toHaveBeenCalledOnce();
});

it('reports a new task failure once and preserves summaries across reconnects', async () => {
  const { stream } = mount();
  stream.send(1, [task()]);
  stream.send(2, [task('failed')]);
  stream.send(3, [task('failed')]);
  expect(reportProjectError).toHaveBeenCalledTimes(1);
  act(() => {
    stream.onerror?.();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  expect(screen.getByRole('button', { name: /Task: Inspect corpus/ })).toBeInTheDocument();
  stream.send(4, [
    task('failed'),
    { ...task('failed'), id: 'new', label: 'Failure during disconnect' },
  ]);
  expect(reportProjectError).toHaveBeenCalledTimes(2);
  stream.send(5, [task('failed'), { ...task('failed'), id: 'new' }]);
  expect(reportProjectError).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(api.getTasks).toHaveBeenCalledTimes(1);
  });
});

it('shows progress and expandable errors with cancellation and dismissal controls', async () => {
  const user = userEvent.setup();
  const { stream } = mount();
  stream.send(1, [task()]);
  await user.click(await screen.findByRole('button', { name: /Task: Inspect corpus/ }));
  expect(screen.getByText('Reading')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  stream.send(2, [{ ...task(), progress: { message: 'Encoding', fraction: 0.5 } }]);
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  vi.mocked(api.cancelTask).mockResolvedValue({ revision: 3, tasks: [task('cancelling')] });
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(api.cancelTask).toHaveBeenCalledWith('http://project', 'one');
  expect(await screen.findByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  stream.send(4, [task('failed')]);
  expect(await screen.findByText('Query failed')).toBeInTheDocument();
  expect(screen.queryByText('Reading')).not.toBeInTheDocument();
  vi.mocked(api.dismissTask).mockResolvedValue({ revision: 5, tasks: [] });
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(api.dismissTask).toHaveBeenCalledWith('http://project', 'one');
  expect(await screen.findByText('No tasks')).toBeInTheDocument();
});

it('uses HTTP as the initial baseline and observes a failure arriving in the first SSE snapshot', async () => {
  vi.mocked(api.getTasks).mockResolvedValue({
    revision: 1,
    tasks: [{ ...task('failed'), id: 'old' }],
  });
  const { stream, client } = mount();
  await waitFor(() =>
    expect(client.getQueryData(['native', 'http://project', 'tasks'])).toBeDefined(),
  );
  expect(reportProjectError).not.toHaveBeenCalled();
  stream.send(2, [{ ...task('failed'), id: 'old' }, task('failed')]);
  expect(reportProjectError).toHaveBeenCalledOnce();
});

it('refreshes commits and resets independently of task completion', async () => {
  const { stream, client } = mount();
  const key = ['native', 'http://project', 'rows', 'main', 'words'];
  await client.fetchQuery({
    queryKey: key,
    queryFn: async () => [],
    meta: { objects: [{ schema: 'main', name: 'words' }] },
  });
  stream.send(1, [task()]);
  stream.send(2, [task('succeeded')]);
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  act(() =>
    stream.dispatchEvent(
      new MessageEvent('change', {
        data: JSON.stringify({ objects: [{ schema: 'main', name: 'words' }] }),
      }),
    ),
  );
  await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  client.setQueryData(key, []);
  act(() => {
    stream.onerror?.();
    stream.dispatchEvent(new MessageEvent('reset', { data: 'null' }));
  });
  await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  expect(reportProjectError).not.toHaveBeenCalled();
});

it('does not refresh project data after an export succeeds', async () => {
  const { stream, client } = mount();
  stream.send(1, [task()]);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  stream.send(2, [task('succeeded')]);
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  expect(invalidate).not.toHaveBeenCalled();
});

it('accepts analysis publication changes without needing a task summary', async () => {
  const { stream, client } = mount();
  client.setQueryData(['native', 'http://project', 'tabs', 'frequency'], []);
  client.setQueryData(['native', 'http://project', 'graph', 'logical'], {});
  act(() =>
    stream.dispatchEvent(
      new MessageEvent('change', { data: JSON.stringify({ resources: ['tabs'] }) }),
    ),
  );
  await waitFor(() =>
    expect(
      client.getQueryState(['native', 'http://project', 'tabs', 'frequency'])?.isInvalidated,
    ).toBe(true),
  );
  expect(
    client.getQueryState(['native', 'http://project', 'graph', 'logical'])?.isInvalidated,
  ).toBe(false);
});
