import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { recordSessionError, useSessionErrors, listenForSessionErrors } from './sessionErrors';
import { SessionErrors } from './SessionErrorHistory';
import { bypass } from 'msw';
import { QueryObserver } from '@tanstack/react-query';
import { reportProjectError, createProjectQueryClient } from '../project/projectErrors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorCollector } from '../../../e2e-browser/errorCollector';
import { ProjectError } from '../project/api';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));
beforeEach(() => {
  useSessionErrors.getState().clear();
  vi.clearAllMocks();
});

it('cancels E2E reads before navigation without swallowing network failures or cancelling accepted work', async () => {
  const failure = new TypeError('Load failed');
  let finishMutation!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input, options) => {
      if (input === '/failure') return Promise.reject(failure);
      if (input === '/read')
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(failure);
          });
        });
      return new Promise((resolve) => {
        finishMutation = resolve;
      });
    }),
  );
  try {
    await import('../../../e2e-browser/errorBridge');
    await expect(fetch('/failure', { signal: new AbortController().signal })).rejects.toBe(failure);
    const read = fetch('/read', { signal: new AbortController().signal });
    const cancelled = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    const mutation = fetch('/mutation', { method: 'POST' });
    window.__wordflowDiagnostics?.prepareForNavigation();
    await cancelled;
    const response = new Response();
    finishMutation(response);
    await expect(mutation).resolves.toBe(response);
  } finally {
    window.__wordflowDiagnostics?.disconnect();
    vi.unstubAllGlobals();
  }
});

it('retains bounded plain records, newest first, and clears without persistence', () => {
  for (let i = 0; i < 205; i++) recordSessionError(new Error(`error ${i}`), 'Failed');
  const entries = useSessionErrors.getState().entries;
  expect(entries).toHaveLength(200);
  expect(entries[0]?.message).toBe('error 204');
  expect(entries[199]?.message).toBe('error 5');
  const long = recordSessionError({ message: 'x'.repeat(20_000) }, 'Long error');
  expect(long.message).toHaveLength(16_384);
  useSessionErrors.getState().clear();
  expect(useSessionErrors.getState().entries).toEqual([]);
});

it('records each failure once, independently of toast expansion and stable toast IDs', async () => {
  reportProjectError(Object.assign(new Error('accepted'), { taskId: 'run-1' }));
  expect(useSessionErrors.getState().entries).toEqual([]);
  reportProjectError({ message: 'task failed' }, 'Frequency', 'task-toast', 'run-1');
  const options = vi.mocked(toast.error).mock.calls[0]?.[1];
  render(options?.description);
  await userEvent.click(screen.getByRole('button', { name: 'Show details' }));
  expect(useSessionErrors.getState().entries).toHaveLength(1);
  expect(useSessionErrors.getState().entries[0]?.taskId).toBe('run-1');
  reportProjectError({ message: 'task failed again' }, 'Frequency', 'task-toast', 'run-1');
  expect(useSessionErrors.getState().entries).toHaveLength(2);
});

it('shows the cause immediately and retains HTTP and Rust details in the toast and history', async () => {
  const body = JSON.stringify({
    error: { code: 'sql_error', message: 'Binder failed', statement_index: 0 },
  });
  const error = new ProjectError(
    'Binder failed',
    body,
    undefined,
    'POST /api/project/sql\nHTTP 400 Bad Request',
  );
  reportProjectError(error);
  const { rerender, unmount } = render(vi.mocked(toast.error).mock.calls[0]?.[1]?.description);
  expect(screen.getByText('Binder failed')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Show details' }));
  rerender(vi.mocked(toast.error).mock.calls[1]?.[1]?.description);
  expect(screen.getByText(/HTTP 400 Bad Request/)).toHaveTextContent('"code": "sql_error"');
  expect(useSessionErrors.getState().entries).toHaveLength(1);
  expect(useSessionErrors.getState().entries[0]?.details).toBe(error.details);
  unmount();
  render(<SessionErrors />);
  await userEvent.click(screen.getByText('Session errors (1)'));
  await userEvent.click(screen.getByText('Operation failed'));
  expect(screen.getByText(/HTTP 400 Bad Request/)).toHaveTextContent('"statement_index": 0');
});

it('retains structured task errors and tolerates nonserializable rejection reasons', () => {
  const native = { code: 'worker_failed', message: 'task panicked: tokenizer failure' };
  expect(recordSessionError(native, 'Run', 'notification', 'run-1')).toMatchObject({
    message: native.message,
    details: JSON.stringify(native, null, 2),
    taskId: 'run-1',
  });
  const circular: { cause?: unknown } = {};
  circular.cause = circular;
  expect(() => recordSessionError(circular, 'Unhandled')).not.toThrow();
});

it('captures global errors and rejections with removable listeners', () => {
  const dispose = listenForSessionErrors(window);
  window.dispatchEvent(
    new ErrorEvent('error', { error: new Error('uncaught'), message: 'uncaught' }),
  );
  const rejected = new Event('unhandledrejection');
  Object.defineProperty(rejected, 'reason', { value: new Error('rejected') });
  window.dispatchEvent(rejected);
  expect(useSessionErrors.getState().entries.map(({ source }) => source)).toEqual([
    'rejection',
    'window',
  ]);
  dispose();
  window.dispatchEvent(rejected);
  expect(useSessionErrors.getState().entries).toHaveLength(2);
});

it('records caught React rendering failures without creating another toast', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  function Broken(): never {
    throw new Error('render failure');
  }
  try {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeVisible();
    expect(useSessionErrors.getState().entries).toEqual([
      expect.objectContaining({ source: 'react', message: 'render failure' }),
    ]);
    expect(toast.error).not.toHaveBeenCalled();
  } finally {
    consoleError.mockRestore();
  }
});

it('shows details, copies the same record, handles clipboard failure and clears history', async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  recordSessionError(new Error('broken column'), 'Cast failed');
  render(<SessionErrors />);
  await user.click(screen.getByText('Session errors (1)'));
  await user.click(screen.getByText('Cast failed'));
  await user.click(screen.getByRole('button', { name: 'Copy details' }));
  expect(JSON.parse(copy.mock.calls[0]![0])).toEqual(useSessionErrors.getState().entries);
  copy.mockRejectedValueOnce(new Error('clipboard unavailable'));
  await user.click(screen.getByRole('button', { name: 'Copy all' }));
  expect(screen.getByRole('status')).toHaveTextContent('Could not copy');
  expect(useSessionErrors.getState().entries).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.getByText('No errors recorded in this window.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy all' })).toBeDisabled();
});

it('E2E fails for unexpected, missing and duplicate failures while retaining event IDs', async () => {
  const collector = new ErrorCollector();
  const url = await collector.start();
  try {
    const entry = recordSessionError(new Error('expected invalid cast'), 'Cast failed');
    for (let i = 0; i < 2; i++) {
      expect(
        (await fetch(bypass(url, { method: 'POST', body: JSON.stringify(entry) }))).status,
      ).toBe(204);
    }
    expect(collector.records.size).toBe(1);
    expect(() => collector.assertExpected()).toThrow('Unexpected notification error');
    collector.expect(/invalid cast/);
    expect(() => collector.assertExpected()).not.toThrow();
    collector.records.set('second', { ...entry, id: 'second' });
    expect(() => collector.assertExpected()).toThrow('Unexpected notification error');
    collector.reset();
    collector.expect(/missing/, 2);
    expect(() => collector.assertExpected()).toThrow('expected 2, received 0');
  } finally {
    await collector.close();
  }
});

it('exempts only native driver stale-element signals and retains their records', () => {
  const driver = {
    ...recordSessionError(
      new Error('stale element reference'),
      'Unexpected frontend error',
      'window',
    ),
    stack: '@tauri://localhost:4:36\nglobal code@tauri://localhost:27:15',
  };
  const native = new ErrorCollector(true);
  native.records.set(driver.id, driver);
  expect(() => native.assertExpected()).not.toThrow();
  expect(native.records.size).toBe(1);
  const browser = new ErrorCollector();
  browser.records.set(driver.id, driver);
  expect(() => browser.assertExpected()).toThrow('stale element reference');
  native.records.set(driver.id, {
    ...driver,
    stack: 'handler@tauri://localhost/assets/app.js:4:36',
  });
  expect(() => native.assertExpected()).toThrow('stale element reference');
});

it('reports active Data View reads once and ignores failures after the view closes', async () => {
  const client = createProjectQueryClient();
  const closed = Promise.withResolvers<string>();
  const readClosed = vi.fn(() => closed.promise);
  const observer = new QueryObserver(client, {
    queryKey: ['native', 'project', 'schema', 'data', 'closed'],
    queryFn: readClosed,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  observer.setOptions({
    queryKey: ['native', 'project', 'schema', 'data', 'closed'],
    queryFn: readClosed,
    enabled: false,
  });
  closed.reject(new Error('Deleted object'));
  await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
  expect(toast.error).not.toHaveBeenCalled();
  const active = new QueryObserver(client, {
    queryKey: ['native', 'project', 'rows', 'data', 'active'],
    queryFn: () => Promise.reject(new Error('Conversion Error')),
  });
  const stopActive = active.subscribe(() => undefined);
  await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  expect(useSessionErrors.getState().entries[0]?.message).toBe('Conversion Error');
  unsubscribe();
  stopActive();
  client.clear();
});
