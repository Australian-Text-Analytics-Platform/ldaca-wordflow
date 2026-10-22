/**
 * Each AI provider's default model, set in Settings, Servers. Kept by the
 * backend for the signed-in person (not a secret), in its own file.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type AiDefaultModels, getAiDefaultModels, setAiDefaultModel } from '@/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';

const EMPTY: Record<string, string> = {};

/**
 * The defaults by provider configuration id: undefined until loaded, and
 * empty if they can't be read, so Annotation never waits on them for long.
 */
export function useAiDefaultModels(): Record<string, string> | undefined {
  const userId = useAuth().user?.id ?? null;
  const query = useQuery({
    queryKey: queryKeys.aiDefaultModels(userId),
    queryFn: async ({ signal }) => (await getAiDefaultModels({ signal, throwOnError: true })).data,
    enabled: userId !== null,
    staleTime: 60_000,
    retry: false,
  });
  if (userId === null || query.isError) return EMPTY;
  if (query.isPending) return undefined;
  return query.data.models;
}

/** Set one provider's default model; an empty name removes it. */
export function useSetAiDefaultModel() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;
  return useMutation({
    mutationFn: async ({ configurationId, model }: { configurationId: string; model: string }) =>
      (
        await setAiDefaultModel({
          path: { configuration_id: configurationId },
          body: { model: model.trim() || null },
          throwOnError: true,
        })
      ).data,
    onSuccess: (defaults: AiDefaultModels) => {
      queryClient.setQueryData(queryKeys.aiDefaultModels(userId), defaults);
    },
  });
}
