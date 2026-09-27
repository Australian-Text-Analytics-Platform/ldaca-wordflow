import { client } from '@/api/generated/client.gen';
import { getApiBase } from '@/lib/backend/env';
import { getGeneratedApiBase } from '@/lib/backend/generatedClientConfig';

/** The URLs one application load uses for generated requests and bootstrap checks. */
export interface ResolvedBackendConnection {
  apiBaseUrl: string;
  clientBaseUrl: string;
  liveUrl: string;
  readyUrl: string;
  dataRootUrl: string;
}

const connectionFromApiBase = (apiBaseUrl: string): ResolvedBackendConnection => {
  const normalizedApiBase = apiBaseUrl.replace(/\/$/, '');
  const clientBaseUrl = getGeneratedApiBase(normalizedApiBase);
  const controlBase = normalizedApiBase.endsWith('/api')
    ? normalizedApiBase.slice(0, -4)
    : normalizedApiBase;
  return {
    apiBaseUrl: normalizedApiBase,
    clientBaseUrl,
    liveUrl: `${controlBase}/health/live`,
    readyUrl: `${controlBase}/health/ready`,
    dataRootUrl: `${normalizedApiBase}/data-root`,
  };
};

/** Resolves the browser/server connection before its bootstrap gate mounts. */
export function resolveBackendConnection(): Promise<ResolvedBackendConnection> {
  const connection = connectionFromApiBase(getApiBase());
  client.setConfig({ baseUrl: connection.clientBaseUrl });
  return Promise.resolve(connection);
}
