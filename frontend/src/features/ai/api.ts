import { browserCredentials, providerKey, storeProviderKey } from '@/features/server/account';
import { request } from '@/api/client';
import type { components } from '@/api/generated/native';

export type AiProvider = components['schemas']['Provider'];

export type AiConnection = components['schemas']['ConnectionInfo'];

export type CredentialUpdate = components['schemas']['CredentialUpdate'];

export async function aiConnections(base: string, signal?: AbortSignal): Promise<AiConnection[]> {
  const rows = await (await request(base, '/api/ai/providers', 'get', { signal })).json();
  return rows.map((row) =>
    browserCredentials() ? { ...row, has_credential: !!providerKey(row.id) } : row,
  );
}

/** Call directly from the credential dialog; secret variables never enter a mutation cache. */
export async function saveAiConnection(
  base: string,
  id: string | null,
  input: Omit<components['schemas']['CreateConnection'], 'provider'> &
    Partial<Pick<components['schemas']['CreateConnection'], 'provider'>>,
): Promise<AiConnection> {
  const credential = input.credential;
  let key: string | null | undefined;
  if (browserCredentials()) {
    if (credential?.action === 'session' || credential?.action === 'remember') {
      key = credential.key;
      input = { ...input, credential: { action: 'browser' } };
    } else if (credential?.action === 'remove') key = null;
  }
  const result = id
    ? await (
        await request(base, '/api/ai/providers/{id}', 'post', { path: { id }, body: input })
      ).json()
    : input.provider
      ? await (
          await request(base, '/api/ai/providers', 'post', {
            body: { ...input, provider: input.provider },
          })
        ).json()
      : await Promise.reject(new Error('Select a provider'));
  if (browserCredentials()) {
    if (key !== undefined) storeProviderKey(result.id, key);
    result.has_credential = !!providerKey(result.id);
  }
  return result;
}

export async function deleteAiConnection(base: string, id: string) {
  await request(base, '/api/ai/providers/{id}', 'delete', { path: { id } });
  if (browserCredentials()) storeProviderKey(id, null);
}

export async function aiModels(base: string, id: string, signal?: AbortSignal): Promise<string[]> {
  return (
    await request(base, '/api/ai/providers/{id}/models', 'get', {
      path: { id },
      signal,
    })
  ).json();
}

export async function aiCapabilities(
  base: string,
  id: string,
  model: string,
  signal?: AbortSignal,
): Promise<components['schemas']['InferenceCapabilities']> {
  return (
    await request(base, '/api/ai/providers/{id}/capabilities', 'get', {
      path: { id },
      query: { model },
      signal,
    })
  ).json();
}

export async function rememberAnnotationConcurrency(base: string, id: string, concurrency: number) {
  return (
    await request(base, '/api/ai/providers/{id}/annotation', 'patch', {
      path: { id },
      body: { concurrency },
    })
  ).json();
}
