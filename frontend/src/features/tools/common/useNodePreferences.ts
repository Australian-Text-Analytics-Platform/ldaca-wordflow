import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import type { components } from '@/api/generated/native';

/** Save shared defaults without changing any captured analysis request. */
export function useNodePreferences(base: string) {
  const cache = useQueryClient();
  const mutation = useMutation({
    scope: { id: `node-preferences-${base}` },
    mutationFn: ({
      name,
      preference,
    }: {
      name: string;
      preference: components['schemas']['NodePreference'];
    }) =>
      api.request(base, '/api/project/nodes/{table_name}/preferences', 'patch', {
        path: { table_name: name },
        body: preference,
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['native', base, 'graph'] }),
  });
  return (name: string, preference: components['schemas']['NodePreference']) => {
    mutation.mutate({ name, preference });
  };
}
