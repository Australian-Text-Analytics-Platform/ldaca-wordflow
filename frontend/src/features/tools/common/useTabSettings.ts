import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import * as api from '@/features/project/api';
export function useTabSettings(base: string, tab: api.Tab) {
  const cache = useQueryClient();
  const key = ['native', base, 'tab-settings', tab.id];
  const pending = useMutationState({
    filters: { mutationKey: key, status: 'pending' },
    select: (m) => m.state.variables as Record<string, unknown>,
  }).at(-1);
  const mutation = useMutation({
    mutationKey: key,
    scope: { id: `tab-settings-${tab.id}` },
    mutationFn: (settings: Record<string, unknown>) => api.updateTab(base, tab.id, { settings }),
    onSuccess: (updated) =>
      cache.setQueryData<api.Tab[]>(['native', base, 'tabs', tab.kind], (old) =>
        old?.map((item) =>
          item.id === updated.id ? { ...item, settings: updated.settings } : item,
        ),
      ),
  });
  return {
    settings: pending ?? tab.settings,
    isPending: mutation.isPending,
    change: (patch: Record<string, unknown>, onSuccess?: () => void) => {
      const latest = cache
        .getMutationCache()
        .findAll({ mutationKey: key, status: 'pending' })
        .at(-1)?.state.variables as Record<string, unknown> | undefined;
      mutation.mutate({ ...(latest ?? tab.settings), ...patch }, { onSuccess });
    },
  };
}
