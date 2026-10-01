import { request } from '@/api/client';
import type { components } from '@/api/generated/native';

export type AiProvider = components['schemas']['Provider'];

export type AiConnection = components['schemas']['ConnectionInfo'];

export type CredentialUpdate = components['schemas']['CredentialUpdate'];

export async function aiConnections(base: string, signal?: AbortSignal): Promise<AiConnection[]> {
  return (await request(base, '/api/ai/providers', 'get', { signal })).json();
}

/** Call directly from the credential dialog; secret variables never enter a mutation cache. */
export async function saveAiConnection(
  base: string,
  id: string | null,
  input: Omit<components['schemas']['CreateConnection'], 'provider'> &
    Partial<Pick<components['schemas']['CreateConnection'], 'provider'>>,
): Promise<AiConnection> {
  if (id)
    return (
      await request(base, '/api/ai/providers/{id}', 'post', { path: { id }, body: input })
    ).json();
  if (!input.provider) throw new Error('Select a provider');
  return (
    await request(base, '/api/ai/providers', 'post', {
      body: { ...input, provider: input.provider },
    })
  ).json();
}

export async function deleteAiConnection(base: string, id: string) {
  await request(base, '/api/ai/providers/{id}', 'delete', { path: { id } });
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
