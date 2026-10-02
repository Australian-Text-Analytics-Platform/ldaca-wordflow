import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '@/lib/backend/csrfToken';
import {
  UPLOAD_STALLED_MESSAGE,
  UploadCancelledError,
  uploadFileWithProgress,
} from '@/lib/backend/uploadTransport';

/** A controllable stand-in for XMLHttpRequest. */
class FakeXhr {
  static last: FakeXhr | null = null;
  method = '';
  url = '';
  withCredentials = false;
  headers: Record<string, string> = {};
  status = 0;
  statusText = '';
  responseText = '';
  responseHeaders: Record<string, string> = {};
  aborted = false;
  sentBody: unknown = null;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  send(body: unknown) {
    this.sentBody = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent);
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.responseHeaders['content-type'] = 'application/json';
    this.onload?.();
  }
}

const file = new File(['x'.repeat(100)], 'big.zip');
let clock = 0;
const options = (extra: Record<string, unknown> = {}) => ({
  createRequest: () => new FakeXhr() as unknown as XMLHttpRequest,
  now: () => clock,
  ...extra,
});

describe('uploadFileWithProgress (issue 260)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    setCsrfToken('csrf-1');
  });
  afterEach(() => {
    vi.useRealTimers();
    setCsrfToken(null);
  });

  it('posts the raw file with CSRF and reports bytes sent', async () => {
    const onProgress = vi.fn();
    const done = uploadFileWithProgress(file, 'corpus/big file.zip', options({ onProgress }));
    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toMatch(/\/api\/user-files\/uploads\?path=corpus%2Fbig%20file\.zip$/);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers).toMatchObject({
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': 'csrf-1',
    });
    expect(xhr.sentBody).toBe(file);

    xhr.progress(40, 100);
    xhr.progress(100, 100);
    xhr.respond(201, { name: 'big file.zip', path: 'corpus/big file.zip', type: 'file' });

    await expect(done).resolves.toMatchObject({ path: 'corpus/big file.zip' });
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { loaded: 40, total: 100 },
      { loaded: 100, total: 100 },
    ]);
  });

  it('has no overall time limit while bytes keep moving', async () => {
    const done = uploadFileWithProgress(file, 'slow.zip', options());
    const xhr = FakeXhr.last!;
    // Five minutes of slow but steady progress: the old client gave up at 30 s.
    for (let second = 1; second <= 300; second += 1) {
      clock = second * 1000;
      if (second % 30 === 0) xhr.progress(second, 300);
      vi.advanceTimersByTime(1000);
    }
    expect(xhr.aborted).toBe(false);
    xhr.respond(201, { path: 'slow.zip' });
    await expect(done).resolves.toMatchObject({ path: 'slow.zip' });
  });

  it('fails in plain words after 60 s without progress', async () => {
    const done = uploadFileWithProgress(file, 'stuck.zip', options());
    const xhr = FakeXhr.last!;
    xhr.progress(10, 100);
    clock = 59_000;
    vi.advanceTimersByTime(59_000);
    expect(xhr.aborted).toBe(false);
    clock = 60_000;
    vi.advanceTimersByTime(1000);
    expect(xhr.aborted).toBe(true);
    await expect(done).rejects.toMatchObject({
      message: UPLOAD_STALLED_MESSAGE,
      code: 'UPLOAD_STALLED',
    });
  });

  it('stops at once when cancelled', async () => {
    const controller = new AbortController();
    const done = uploadFileWithProgress(file, 'x.zip', options({ signal: controller.signal }));
    controller.abort();
    expect(FakeXhr.last!.aborted).toBe(true);
    await expect(done).rejects.toBeInstanceOf(UploadCancelledError);
  });

  it("passes the server's message through, for example the upload limit", async () => {
    const done = uploadFileWithProgress(file, 'x.zip', options());
    FakeXhr.last!.respond(413, {
      code: 'upload_too_large',
      message: 'This file is larger than the 512 MB this server accepts.',
    });
    await expect(done).rejects.toMatchObject({
      status: 413,
      code: 'upload_too_large',
      message: 'This file is larger than the 512 MB this server accepts.',
    });
  });
});
