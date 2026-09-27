import type { components } from '@/api/generated/native';
import { requestUrl } from '@/api/http';
import { ProjectError } from '@/features/project/api';
import { request } from '@/features/project/api';
export type Library = components['schemas']['Library'];
export type LibraryFile = components['schemas']['LibraryFile'];

/** Raw upload transport; files are streamed by fetch rather than encoded as JSON. */
export async function uploadFile(
  base: string,
  library: Library,
  file: File,
  signal?: AbortSignal,
): Promise<LibraryFile> {
  const path = requestUrl('/api/server/files/{library}/{name}', { library, name: file.name });
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal,
  });
  if (!response.ok) {
    const details = await response.text();
    let message = details;
    try {
      const value: unknown = JSON.parse(details);
      if (
        value &&
        typeof value === 'object' &&
        'error' in value &&
        value.error &&
        typeof value.error === 'object' &&
        'message' in value.error &&
        typeof value.error.message === 'string'
      )
        message = value.error.message;
    } catch {
      /* Preserve non-JSON transport errors. */
    }
    throw new ProjectError(
      message,
      details,
      undefined,
      `PUT ${path}\nHTTP ${String(response.status)} ${response.statusText}`,
    );
  }
  return response.json() as Promise<LibraryFile>;
}
export async function importFile(base: string, session: string, name: string) {
  return (
    await request(base, '/api/server/import', 'post', { body: { session_id: session, name } })
  ).json();
}
