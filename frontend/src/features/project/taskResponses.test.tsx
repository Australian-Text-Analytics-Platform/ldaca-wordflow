import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import * as api from './api';
import { createProjectQueryClient, reportProjectError } from './projectErrors';
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const nativeInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativeInvoke }));
vi.mock('@/lib/isTauri', () => ({ isTauri: () => true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('keeps accepted task failures structured and leaves their toast to the observer', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'sql_error',
            message: 'Failed statement',
            statement_index: 1,
          },
        }),
        { status: 400, headers: { 'X-Wordflow-Task-Id': 'task-1' } },
      ),
    ),
  );
  const client = createProjectQueryClient();
  const mutation = client.getMutationCache().build(client, {
    mutationFn: () => api.runSqlScript('http://project', 'SELECT 1', 'execute', 'SQL cell 1'),
  });
  const error: unknown = await mutation.execute(undefined).catch((failure: unknown) => failure);
  expect(error).toMatchObject({ code: 'sql_error', statementIndex: 1, taskId: 'task-1' });
  reportProjectError(error, 'SQL failed');
  expect(toast.error).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith(
    'http://project/api/project/sql',
    expect.objectContaining({
      body: JSON.stringify({
        script: 'SELECT 1',
        mode: 'execute',
        max_rows: 50000,
        task_label: 'SQL cell 1',
      }),
    }),
  );
  reportProjectError({ message: 'Failed statement' }, 'SQL cell 1', 'task-task-1');
  expect(toast.error).toHaveBeenCalledOnce();
});
it('still reports submission failures and leaves ordinary SQL requests untracked', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'stopping',
            message: 'Closing project',
          },
        }),
        { status: 503 },
      ),
    ),
  );
  const error: unknown = await api
    .querySql('http://project', [{ sql: 'SELECT 1' }])
    .catch((failure: unknown) => failure);
  reportProjectError(error);
  expect(toast.error).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith(
    'http://project/api/project/sql',
    expect.objectContaining({
      body: JSON.stringify({ statements: [{ sql: 'SELECT 1' }], mode: 'read' }),
    }),
  );
});

it('retains the HTTP context and complete Rust response without recording request data', async () => {
  const body = {
    error: {
      code: 'invalid_request',
      message: 'Unsupported analysis kind',
      reason: 'unknown kind',
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 400,
        statusText: 'Bad Request',
      }),
    ),
  );
  const error = await api
    .createTab('http://project', 'concordance')
    .catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(api.ProjectError);
  expect(error).toMatchObject({
    message: body.error.message,
    code: 'invalid_request',
    details: `POST /api/project/tabs\nHTTP 400 Bad Request\n\n${JSON.stringify(body, null, 2)}`,
  });
});

it.each(['upstream Rust failure\ncaused by: connection closed', ''])(
  'retains plain or empty HTTP failures: %s',
  async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status: 502, statusText: 'Bad Gateway' })),
    );
    const error = await api.graph('http://project').catch((failure: unknown) => failure);
    expect(error).toMatchObject({
      message: body || 'Request failed (502)',
      details: `GET /api/project/graph\nHTTP 502 Bad Gateway\n\n${body || 'Request failed (502)'}`,
    });
  },
);

it('adds request context to network failures while preserving cancellation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(api.graph('http://project')).rejects.toMatchObject({
    message: 'Failed to fetch',
    details: 'GET /api/project/graph\nNo HTTP response received\n\nFailed to fetch',
  });
  const aborted = new DOMException('Cancelled', 'AbortError');
  vi.mocked(fetch).mockRejectedValue(aborted);
  await expect(api.graph('http://project')).rejects.toBe(aborted);
});

it('normalizes native export errors with the same task notification owner as HTTP', async () => {
  nativeInvoke.mockRejectedValue({
    code: 'export_error',
    message: 'Installation failed',
    task_id: 'export-1',
    statement_index: 2,
  });
  const error = await api
    .exportNode('http://project', 'documents', 'csv')
    .catch((failure: unknown) => failure);
  expect(error).toMatchObject({
    code: 'export_error',
    message: 'Installation failed',
    taskId: 'export-1',
    statementIndex: 2,
    details: expect.stringContaining('"code": "export_error"'),
  });
  reportProjectError(error);
  expect(toast.error).not.toHaveBeenCalled();
  nativeInvoke.mockRejectedValue({ code: 'desktop_error', message: 'Chooser failed' });
  reportProjectError(
    await api.exportNode('http://project', 'documents', 'csv').catch((failure: unknown) => failure),
  );
  expect(toast.error).toHaveBeenCalledOnce();
});

it('preserves native failures without a message field and ordinary Error messages', () => {
  const native = { code: 'worker_failed', cause: { panic: 'tokenizer failed' } };
  expect(api.ProjectError.fromNative(native)).toMatchObject({
    message: JSON.stringify(native),
    details: JSON.stringify({ error: native }, null, 2),
  });
  expect(api.ProjectError.fromNative(new Error('Native failure')).details).toContain(
    'Native failure',
  );
});
