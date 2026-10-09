import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getPreferences,
  updatePreferences,
  type UserPreferences,
  type UserPreferencesPatch,
} from '@/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { toastError } from '@/lib/toastError';

const DEFAULT_PREFERENCES: Required<UserPreferences> = {
  hidden_views: [],
  favorite_workspaces: [],
  // On by default from the next 0.7.x update (issue 359).
  analysis_multi_tab_enabled: true,
  contextual_hints_enabled: true,
  color_theme: 'light-2026',
};

export function useUserPreferences() {
  const userId = useAuth().user?.id ?? null;
  const query = useQuery({
    queryKey: queryKeys.userPreferences(userId),
    queryFn: async () => (await getPreferences({ throwOnError: true })).data,
    enabled: userId !== null,
  });

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    preferences: query.data ?? DEFAULT_PREFERENCES,
    userId,
  };
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;
  const queryKey = queryKeys.userPreferences(userId);

  return useMutation({
    mutationFn: async (patch: UserPreferencesPatch) =>
      (await updatePreferences({ body: patch, throwOnError: true })).data,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserPreferences>(queryKey);
      if (previous) {
        queryClient.setQueryData<UserPreferences>(queryKey, {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toastError(error, "Couldn't save preferences");
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
