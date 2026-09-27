import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateNode } from '@/api';
import { updateNodePreferenceCache } from './nodePreferenceCache';

/**
 * Returns the mutation used by node/column selectors to persist a preferred
 * document column and keep cached project metadata in sync.
 * Used by: analysis selectors that let users choose a document column per node.
 * Flow: capture QueryClient and project identity, return a document-column mutation that trims empty values, writes the backend preference, updates caches, and shows a toast on failure.
 */
export function usePersistNodeDocumentColumn({
  projectId,
}: {
  projectId: string | null | undefined;
}) {
  const queryClient = useQueryClient();

  return useCallback(
    async (nodeId: string, column: string) => {
      if (!projectId) return null;
      try {
        const { data } = await updateNode({
          path: { workspace_id: projectId, node_id: nodeId },
          body: { document: column.trim() || null },
          throwOnError: true,
        });
        updateNodePreferenceCache(
          queryClient,
          projectId,
          nodeId,
          'document',
          data.document ?? null,
        );
        return data;
      } catch {
        toast.error('Could not save the document column for this data block.');
        return null;
      }
    },
    [queryClient, projectId],
  );
}
