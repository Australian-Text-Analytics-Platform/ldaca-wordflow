import { describe, expect, it } from 'vitest';

import { parseApiErrorResponse } from '@/lib/apiError';

const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('parseApiErrorResponse (issue 205)', () => {
  it('prefers the written message and never shows details as JSON', async () => {
    const error = await parseApiErrorResponse(
      response(413, {
        code: 'storage_quota_exceeded',
        message: 'Your storage is full.',
        details: { limit_bytes: 10, used_bytes: 12 },
        request_id: 'r-1',
      }),
    );
    expect(error.message).toBe('Your storage is full.');
    expect(error.technical).toContain('"limit_bytes": 10');
    expect(error.technical).toContain('Error code: storage_quota_exceeded');
    expect(error.technical).toContain('Reference: r-1');
  });

  it('keeps a 5xx diagnostic out of the message', async () => {
    const error = await parseApiErrorResponse(
      response(500, {
        code: 'internal_server_error',
        message: 'Something went wrong in Wordflow.',
        details: { diagnostic: 'RuntimeError: boom' },
        request_id: 'r-2',
      }),
    );
    expect(error.message).toBe('Something went wrong in Wordflow.');
    expect(error.technical?.split('\n')[0]).toBe('RuntimeError: boom');
  });

  it('falls back to listed validation messages for the old summary', async () => {
    const error = await parseApiErrorResponse(
      response(422, {
        code: 'request_validation_failed',
        message: 'Request validation failed',
        details: [{ location: ['body', 'path'], message: 'Path must be absolute' }],
      }),
    );
    expect(error.message).toBe('Path must be absolute');
  });
});
