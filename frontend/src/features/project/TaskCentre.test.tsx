import * as tasksApi from '@/features/project/tasksApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { reportProjectError } from './projectErrors';
import { TaskCentre } from './TaskCentre';
import { useNativeTasks } from './useNativeTasks';
vi.mock('@/features/project/tasksApi', () => ({
  getTasks: vi.fn(),
  cancelTask: vi.fn(),
  dismissTask: vi.fn(),
}));
vi.mock('./projectErrors', () => ({ reportProjectError: vi.fn() }));

class Stream extends EventTarget {
  static current: Stream;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    super();
    Stream.current = this;
  }
  send(revision: number, tasks: tasksApi.NativeTask[]) {
    act(() => {
      this.dispatchEvent(new MessageEvent('tasks', { data: JSON.stringify({ revision, tasks }) }));
    });
  }
}
const task = (state: tasksApi.NativeTask['state'] = 'running'): tasksApi.NativeTask => ({
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
  vi.mocked(tasksApi.getTasks).mockResolvedValue({ revision: 0, tasks: [] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps a newer stream snapshot when the initial HTTP request finishes late', async () => {
  let resolve!: (snapshot: tasksApi.TaskSnapshot) => void;
  vi.mocked(tasksApi.getTasks).mockReturnValue(
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
    expect(tasksApi.getTasks).toHaveBeenCalledTimes(1);
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
  vi.mocked(tasksApi.cancelTask).mockResolvedValue({ revision: 3, tasks: [task('cancelling')] });
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(tasksApi.cancelTask).toHaveBeenCalledWith('http://project', 'one');
  expect(await screen.findByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  stream.send(4, [task('failed')]);
  expect(await screen.findByText('Query failed')).toBeInTheDocument();
  expect(screen.queryByText('Reading')).not.toBeInTheDocument();
  vi.mocked(tasksApi.dismissTask).mockResolvedValue({ revision: 5, tasks: [] });
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(tasksApi.dismissTask).toHaveBeenCalledWith('http://project', 'one');
  expect(await screen.findByText('No tasks')).toBeInTheDocument();
});

it('uses HTTP as the initial baseline and observes a failure arriving in the first SSE snapshot', async () => {
  vi.mocked(tasksApi.getTasks).mockResolvedValue({
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
  act(() => {
    stream.dispatchEvent(
      new MessageEvent('change', {
        data: JSON.stringify({ objects: [{ schema: 'main', name: 'words' }] }),
      }),
    );
  });
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
  act(() => {
    stream.dispatchEvent(
      new MessageEvent('change', { data: JSON.stringify({ resources: ['tabs'] }) }),
    );
  });
  await waitFor(() =>
    expect(
      client.getQueryState(['native', 'http://project', 'tabs', 'frequency'])?.isInvalidated,
    ).toBe(true),
  );
  expect(
    client.getQueryState(['native', 'http://project', 'graph', 'logical'])?.isInvalidated,
  ).toBe(false);
});
