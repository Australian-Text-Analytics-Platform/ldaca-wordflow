/**
 * Server AI providers (issue 411): LLM providers the server offers to every
 * signed-in user, configured by the server's SERVER_AI_PROVIDERS_FILE.
 *
 * They are listed first and read-only; the first is selected in new
 * Annotation tabs. The browser never sees a key or the real address: their
 * base_url is a placeholder on `.server-ai.invalid`, and requests send no key.
 * A provider may limit requests at once per person (max_requests_per_user).
 */
import { useQuery } from '@tanstack/react-query';

import type { AnnotationProviderConfigurationResource, ServerAiProviderResource } from '@/api';
import { listServerAiProviders } from '@/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export type ServerAiProvider = ServerAiProviderResource;

const PLACEHOLDER_HOST_SUFFIX = '.server-ai.invalid';

/** Whether a configuration is one of the server's own providers. */
export const isServerAiConfiguration = (
  configuration: Pick<AnnotationProviderConfigurationResource, 'base_url'>,
): boolean => {
  if (!configuration.base_url) return false;
  try {
    return new URL(configuration.base_url).hostname.endsWith(PLACEHOLDER_HOST_SUFFIX);
  } catch {
    return false;
  }
};

const serverAiProvidersQueryKey = ['server-ai-providers'] as const;

/**
 * The server's providers: [] when it offers none (or can't say), and
 * undefined until it has answered.
 */
export const useServerAiProviders = (): ServerAiProvider[] | undefined => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: serverAiProvidersQueryKey,
    queryFn: async ({ signal }) =>
      (await listServerAiProviders({ signal, throwOnError: true })).data.providers,
    enabled: isAuthenticated,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!isAuthenticated) return [];
  if (query.isPending) return undefined;
  return query.data ?? [];
};

/** The server's providers first, in the server's order, then the person's own. */
export const withServerAiProviders = <T extends AnnotationProviderConfigurationResource>(
  providers: ServerAiProvider[] | undefined,
  configurations: T[],
  view: (configuration: AnnotationProviderConfigurationResource) => T,
): T[] => {
  if (!providers?.length) return configurations;
  const ids = new Set(providers.map((provider) => provider.configuration.id));
  return [
    ...providers.map((provider) => view(provider.configuration)),
    ...configurations.filter((configuration) => !ids.has(configuration.id)),
  ];
};

const findProvider = (
  providers: ServerAiProvider[] | undefined,
  configurationId: string | null | undefined,
): ServerAiProvider | undefined =>
  providers?.find((provider) => provider.configuration.id === configurationId);

/** A server provider's limit on requests at once per person, if it has one. */
export const serverAiConcurrencyLimit = (
  providers: ServerAiProvider[] | undefined,
  configurationId: string | null | undefined,
): { value: number; note: string } | undefined => {
  const provider = findProvider(providers, configurationId);
  const limit = provider?.max_requests_per_user;
  if (!provider || limit == null) return undefined;
  const requests = limit === 1 ? 'one request' : `${String(limit)} requests`;
  return {
    value: limit,
    note: `${provider.configuration.name} takes ${requests} at a time for each person, so Run sends at most ${requests} at once.`,
  };
};

/** Requests at once for a Run, never above a server provider's limit. */
export const capServerAiConcurrency = (
  providers: ServerAiProvider[] | undefined,
  configurationId: string | null | undefined,
  value: number,
): number => Math.min(value, serverAiConcurrencyLimit(providers, configurationId)?.value ?? value);

/** Saved models per configuration, with each server provider's default filled in. */
export const withServerAiDefaultModels = (
  providers: ServerAiProvider[] | undefined,
  models: Record<string, string>,
): Record<string, string> => {
  const defaults = (providers ?? []).filter(
    (provider) => provider.default_model && !models[provider.configuration.id],
  );
  if (defaults.length === 0) return models;
  return {
    ...models,
    ...Object.fromEntries(
      defaults.map((provider) => [provider.configuration.id, provider.default_model ?? '']),
    ),
  };
};
