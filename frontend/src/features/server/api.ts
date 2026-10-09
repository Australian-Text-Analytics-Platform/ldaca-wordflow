import { transportHeaders, expireAccount } from './account';
import { ProjectError, request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { requestUrl } from '@/api/http';
export type Library = components['schemas']['Library'];
export type LibraryFile = components['schemas']['LibraryFile'];

/** Byte progress ends before server acknowledgement; publication can still be finishing. */
export function uploadFile(
  base: string,
  library: Library,
  file: File,
  signal?: AbortSignal,
  progress?: (sent: number, total: number) => void,
  name = file.name,
): Promise<LibraryFile> {
  const path = requestUrl('/api/server/files/{library}/{name}', { library, name });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    xhr.open('PUT', `${base}${path}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    for (const [key, value] of Object.entries(transportHeaders('PUT')))
      xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) =>
      progress?.(event.loaded, event.lengthComputable ? event.total : file.size);
    xhr.onerror = () => {
      cleanup();
      reject(
        new ProjectError('Upload connection failed', xhr.responseText, undefined, `PUT ${path}`),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload cancellation requested', 'AbortError'));
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status === 401) expireAccount();
      let value: unknown;
      try {
        value = JSON.parse(xhr.responseText);
      } catch {
        value = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (
          value &&
          typeof value === 'object' &&
          'name' in value &&
          typeof value.name === 'string' &&
          'size' in value &&
          typeof value.size === 'number' &&
          'is_directory' in value &&
          typeof value.is_directory === 'boolean' &&
          'modified' in value &&
          (typeof value.modified === 'number' || value.modified === null)
        ) {
          resolve({
            name: value.name,
            size: value.size,
            is_directory: value.is_directory,
            modified: value.modified,
          });
        } else {
          reject(new ProjectError('Unsupported upload acknowledgement', xhr.responseText));
        }
        return;
      }
      const message =
        value &&
        typeof value === 'object' &&
        'error' in value &&
        value.error &&
        typeof value.error === 'object' &&
        'message' in value.error &&
        typeof value.error.message === 'string'
          ? value.error.message
          : xhr.responseText;
      reject(
        new ProjectError(
          message || 'Upload failed',
          xhr.responseText,
          undefined,
          `PUT ${path}\nHTTP ${xhr.status} ${xhr.statusText}`,
        ),
      );
    };
    if (signal?.aborted) {
      reject(new DOMException('Upload cancellation requested', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}
export async function inspectImport(base: string, projectId: string, names: string[]) {
  return (
    await request(base, '/api/server/import/inspect', 'post', {
      body: { project_id: projectId, names },
    })
  ).json();
}
export async function importFiles(
  base: string,
  projectId: string,
  names: string[],
  selected?: components['schemas']['FileImportSelection'][],
) {
  return (
    await request(base, '/api/server/import', 'post', {
      body: { project_id: projectId, names, selected },
    })
  ).json();
}
