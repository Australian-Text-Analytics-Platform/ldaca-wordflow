/**
 * Apollo LLM deployment build (branch deploy/apollo only; never released).
 *
 * The server lists one built-in provider, "Apollo LLM", for every signed-in
 * user. It is read-only, preselected in new Annotation tabs, and takes one
 * request at a time per user. Its key and real URL stay on the server: the
 * browser only sees a placeholder URL and sends no key. See docs/deploy/apollo.md.
 */
import { useQuery } from '@tanstack/react-query';

import type { AnnotationProviderConfigurationResource } from '@/api';
import { client } from '@/api/generated/client.gen';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** The same fixed id as the backend's APOLLO_CONFIGURATION_ID. */
export const APOLLO_CONFIGURATION_ID = '3c4d70f7-4c43-5e66-9f39-6a4b478319bc';
const APOLLO_MAX_CONCURRENCY = 1;
export const APOLLO_CONCURRENCY_NOTE =
  'Apollo LLM takes one request at a time for each person, so Run sends one at a time.';

export interface ApolloProvider {
  enabled: boolean;
  configuration: AnnotationProviderConfigurationResource | null;
  default_model: string | null;
  max_concurrency: number;
}

const apolloProviderQueryKey = ['apollo-deploy', 'provider'] as const;

const fetchApolloProvider = async (): Promise<ApolloProvider> => {
  const { data } = await client.get<{ 200: ApolloProvider }, unknown, true>({
    security: [{ in: 'cookie', name: 'wordflow_session', type: 'apiKey' }],
    url: '/api/apollo/provider',
    throwOnError: true,
  });
  return data;
};

export interface ApolloModelOption {
  id: string;
  /** One line from the gateway (LiteLLM /model/info) or APOLLO_LLM_MODEL_DESCRIPTIONS. */
  description: string | null;
}

/** Apollo models in the server's configured order, each with its description. */
export const fetchApolloModels = async (signal?: AbortSignal): Promise<ApolloModelOption[]> => {
  const { data } = await client.get<{ 200: { models: ApolloModelOption[] } }, unknown, true>({
    security: [{ in: 'cookie', name: 'wordflow_session', type: 'apiKey' }],
    url: '/api/apollo/models',
    signal,
    throwOnError: true,
  });
  return data.models;
};

/**
 * The Apollo provider when this server has one; null when it has none
 * (upstream behaviour); undefined until the server has answered.
 */
export const useApolloProvider = (): ApolloProvider | null | undefined => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: apolloProviderQueryKey,
    queryFn: fetchApolloProvider,
    enabled: isAuthenticated,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!isAuthenticated) return null;
  if (query.isPending) return undefined;
  return query.data?.enabled && query.data.configuration ? query.data : null;
};

export const isApolloConfiguration = (id: string | null | undefined): boolean =>
  id === APOLLO_CONFIGURATION_ID;

/** Puts Apollo first, so a new Annotation tab selects it. */
export const withApolloProvider = <T extends AnnotationProviderConfigurationResource>(
  apollo: ApolloProvider | null | undefined,
  configurations: T[],
  view: (configuration: AnnotationProviderConfigurationResource) => T,
): T[] => {
  if (!apollo?.configuration) return configurations;
  return [
    view(apollo.configuration),
    ...configurations.filter((configuration) => !isApolloConfiguration(configuration.id)),
  ];
};

/** The most requests at once for a provider: 1 for Apollo, otherwise no extra limit. */
export const apolloConcurrencyLimit = (
  configurationId: string | null | undefined,
): number | undefined =>
  isApolloConfiguration(configurationId) ? APOLLO_MAX_CONCURRENCY : undefined;

/** Requests at once for a Run, never above Apollo's limit. */
export const capApolloConcurrency = (
  configurationId: string | null | undefined,
  value: number,
): number => Math.min(value, apolloConcurrencyLimit(configurationId) ?? value);
