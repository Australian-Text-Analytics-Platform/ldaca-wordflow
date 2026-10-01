import { transportHeaders, expireAccount } from './account';
import { ProjectError, request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { requestUrl } from '@/api/http';
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
    headers: { 'Content-Type': 'application/octet-stream', ...transportHeaders('PUT') },
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) expireAccount();
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
export async function importFile(base: string, projectId: string, name: string) {
  return (
    await request(base, '/api/server/import', 'post', { body: { project_id: projectId, name } })
  ).json();
}
