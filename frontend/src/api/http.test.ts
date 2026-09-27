import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestUrl } from './http';
import { request, ProjectError } from '@/features/project/api';

afterEach(() => vi.unstubAllGlobals());
describe('generated HTTP transport', () => {
  it('encodes qualified names once and omits absent query values', () => {
    expect(
      requestUrl(
        '/api/project/objects/{schema}/{table_name}/schema',
        { schema: '研究 data', table_name: 'a/b?#% x' },
        { kind: undefined },
      ),
    ).toBe('/api/project/objects/%E7%A0%94%E7%A9%B6%20data/a%2Fb%3F%23%25%20x/schema');
  });
  it('preserves abort signals, keepalive and explicit methods', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await request('http://runtime', '/api/project/cell-edits/{session_id}/cancel', 'post', {
      path: { session_id: 'edit' },
      body: {},
      signal,
      keepalive: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://runtime/api/project/cell-edits/edit/cancel',
      expect.objectContaining({ method: 'POST', body: '{}', signal, keepalive: true }),
    );
  });
  it('retains task identity and the complete structured error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'sql_error', message: 'Cannot convert', statement_index: 2 },
          }),
          { status: 400, statusText: 'Bad Request', headers: { 'x-wordflow-task-id': 'task' } },
        ),
      ),
    );
    const error = await request('', '/api/project/sql', 'post', { body: { statements: [] } }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ProjectError);
    expect(error).toMatchObject({ code: 'sql_error', taskId: 'task', statementIndex: 2 });
    expect(error.details).toContain('POST /api/project/sql\nHTTP 400 Bad Request');
  });
});
