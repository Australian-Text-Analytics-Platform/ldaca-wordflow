/**
 * Remote embedding endpoints for Topic Modelling (issue 412 follow-up).
 *
 * An OpenAI-compatible /v1/embeddings server embeds Topic Modelling's text on
 * a remote GPU. They are set up apart from Annotation's AI providers: one
 * gateway can serve both, but an embedding server need not run an LLM.
 *
 * - A server lists its own endpoints (read-only here); on a shared server
 *   people can't add theirs (`storage: 'server'`).
 * - On a desktop people add their own with an optional API key, which the
 *   backend keeps privately and never returns (`storage: 'backend'`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  checkEmbeddingEndpoint,
  createEmbeddingEndpoint,
  deleteEmbeddingEndpoint,
  listEmbeddingEndpointModels,
  listEmbeddingEndpoints,
  updateEmbeddingEndpoint,
  type EmbeddingEndpointCheck,
  type EmbeddingEndpointCreateWritable,
  type EmbeddingEndpointList,
  type EmbeddingEndpointModels,
  type EmbeddingEndpointModelsRequestWritable,
  type EmbeddingEndpointResource,
  type EmbeddingEndpointUpdateWritable,
  type TopicEmbeddingModel,
} from '@/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

export type EmbeddingEndpoint = EmbeddingEndpointResource;
export type EmbeddingEndpointCheckResult = EmbeddingEndpointCheck;
export type EmbeddingEndpointModelList = EmbeddingEndpointModels;

const embeddingEndpointsQueryKey = ['embedding-endpoints'] as const;

export interface UseEmbeddingEndpointsResult {
  /** [] when there are none; undefined until the backend has answered. */
  endpoints: EmbeddingEndpoint[] | undefined;
  /** Whether people can add endpoints here (a desktop) or only see the server's. */
  canAdd: boolean;
  /** How this Wordflow reads text without a server: the Mac's GPU or the processor. */
  localEmbedding: 'gpu' | 'cpu' | undefined;
  isError: boolean;
  retry: () => void;
}

/** The server's embedding endpoints and, on a desktop, the person's own. */
export function useEmbeddingEndpoints(): UseEmbeddingEndpointsResult {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: embeddingEndpointsQueryKey,
    queryFn: async ({ signal }): Promise<EmbeddingEndpointList> =>
      (await listEmbeddingEndpoints({ signal, throwOnError: true })).data,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });
  return {
    endpoints: !isAuthenticated ? [] : query.isPending ? undefined : (query.data?.endpoints ?? []),
    canAdd: query.data?.storage === 'backend',
    localEmbedding: query.data?.local_embedding,
    isError: query.isError,
    retry: () => {
      void query.refetch();
    },
  };
}

/** Add, change, remove and check endpoints; the list refreshes after each change. */
export function useEmbeddingEndpointActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: embeddingEndpointsQueryKey });
  const add = useMutation({
    mutationFn: async (body: EmbeddingEndpointCreateWritable) =>
      (await createEmbeddingEndpoint({ body, throwOnError: true })).data,
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: EmbeddingEndpointUpdateWritable }) =>
      (await updateEmbeddingEndpoint({ path: { endpoint_id: id }, body, throwOnError: true })).data,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteEmbeddingEndpoint({ path: { endpoint_id: id }, throwOnError: true });
    },
    onSuccess: refresh,
  });
  const check = useMutation({
    mutationFn: async (id: string) =>
      (await checkEmbeddingEndpoint({ path: { endpoint_id: id }, throwOnError: true })).data,
  });
  // A server's models before it is saved: checks the key too (desktop only).
  const listModels = useMutation({
    mutationFn: async (body: EmbeddingEndpointModelsRequestWritable) =>
      (await listEmbeddingEndpointModels({ body, throwOnError: true })).data,
  });
  return { add, update, remove, check, listModels };
}

/** Endpoints that embed with `model`, in the backend's order (the server's first). */
export const endpointsServing = (
  endpoints: readonly EmbeddingEndpoint[] | undefined,
  model: TopicEmbeddingModel,
): EmbeddingEndpoint[] => (endpoints ?? []).filter((endpoint) => Boolean(endpoint.models[model]));
