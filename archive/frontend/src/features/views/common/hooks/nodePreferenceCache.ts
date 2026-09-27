import type { QueryClient } from '@tanstack/react-query';
import type { ProjectGraphResponse } from '@/api';
import { queryKeys } from '@/lib/queryKeys';

type NodePreferenceField = 'document' | 'tokenizer_model';

/**
 * Used by: document-column and tokenizer preference persistence hooks.
 * Flow: merge only the returned field into the canonical graph cache,
 * preserving a concurrent write to the other independent preference, then
 * refresh that server resource.
 */
export function updateNodePreferenceCache(
  queryClient: QueryClient,
  projectId: string,
  nodeId: string,
  field: NodePreferenceField,
  value: string | null,
): void {
  queryClient.setQueryData<ProjectGraphResponse>(
    queryKeys.projectGraph(projectId),
    (previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        nodes: previous.nodes.map((node) =>
          node.id === nodeId ? { ...node, [field]: value } : node,
        ),
      };
    },
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.projectGraph(projectId) });
}
