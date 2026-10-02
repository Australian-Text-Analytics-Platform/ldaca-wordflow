/**
 * Sends one User File upload with byte progress (issue 260).
 *
 * The generated client uploads through `fetch`, which reports no upload
 * progress and aborts every request after its 30 s default timeout, so any
 * upload slower than 30 s failed in the browser. This transport uses
 * XMLHttpRequest instead: it reports bytes sent, has no overall time limit, and
 * fails only when the upload makes no progress for `stallTimeoutMs`.
 */
import { client } from '@/api/generated/client.gen';
import type { FileResource } from '@/api';
import { ApiError, parseApiErrorResponse } from '@/lib/apiError';
import { getCsrfToken } from '@/lib/backend/csrfToken';

/** No progress for this long means the upload stopped (agreed default). */
const UPLOAD_STALL_TIMEOUT_MS = 60_000;
const STALL_CHECK_INTERVAL_MS = 1_000;

export const UPLOAD_STALLED_MESSAGE =
  'The upload stopped. Your network may be blocking large uploads (common on campus networks); try a smaller file or another network.';

interface UploadProgress {
  /** Bytes of this file handed to the network so far. */
  loaded: number;
  total: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  stallTimeoutMs?: number;
  /** For tests: the XMLHttpRequest constructor and clock. */
  createRequest?: () => XMLHttpRequest;
  now?: () => number;
}

/** Thrown when the caller cancels; distinct from failures so the UI can say "cancelled". */
export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

export const isUploadCancelled = (error: unknown): boolean => error instanceof UploadCancelledError;

const uploadUrl = (path: string): string => {
  const base = (client.getConfig().baseUrl ?? '').replace(/\/$/, '');
  return `${base}/api/user-files/uploads?path=${encodeURIComponent(path)}`;
};

const responseFrom = (xhr: XMLHttpRequest): Response =>
  new Response(xhr.responseText, {
    status: xhr.status,
    statusText: xhr.statusText,
    headers: { 'content-type': xhr.getResponseHeader('content-type') ?? 'text/plain' },
  });

/** Uploads `file` to `path` in the user's files and resolves with the stored resource. */
export function uploadFileWithProgress(
  file: File,
  path: string,
  {
    onProgress,
    signal,
    stallTimeoutMs = UPLOAD_STALL_TIMEOUT_MS,
    createRequest = () => new XMLHttpRequest(),
    now = () => Date.now(),
  }: UploadOptions = {},
): Promise<FileResource> {
  return new Promise<FileResource>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const xhr = createRequest();
    let lastProgressAt = now();
    let settled = false;
    let stalled = false;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(stallCheck);
      signal?.removeEventListener('abort', onAbort);
      outcome();
    };

    const onAbort = () => {
      xhr.abort();
    };

    // Counts from the last progress event. After the body is sent the server
    // still writes and publishes the file; that waiting counts too.
    const stallCheck = setInterval(() => {
      if (now() - lastProgressAt >= stallTimeoutMs) {
        stalled = true;
        xhr.abort();
      }
    }, STALL_CHECK_INTERVAL_MS);

    xhr.open('POST', uploadUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    const token = getCsrfToken();
    if (token) xhr.setRequestHeader('X-CSRF-Token', token);

    xhr.upload.onprogress = (event: ProgressEvent) => {
      lastProgressAt = now();
      onProgress?.({ loaded: event.loaded, total: event.lengthComputable ? event.total : file.size });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => {
          try {
            resolve(JSON.parse(xhr.responseText) as FileResource);
          } catch (error) {
            reject(new ApiError('The upload finished, but the reply could not be read.', { detail: error }));
          }
        });
        return;
      }
      const response = responseFrom(xhr);
      void parseApiErrorResponse(response).then((error) => {
        finish(() => {
          reject(error);
        });
      });
    };
    xhr.onerror = () => {
      finish(() => {
        reject(new ApiError('The upload could not reach Wordflow. Check your connection and try again.', { code: 'NETWORK' }));
      });
    };
    xhr.onabort = () => {
      finish(() => {
        reject(stalled ? new ApiError(UPLOAD_STALLED_MESSAGE, { code: 'UPLOAD_STALLED' }) : new UploadCancelledError());
      });
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(file);
  });
}
