import { useQueries } from '@tanstack/react-query';
import { getCategoryValues } from '@/api';
import { stackedCategoryOrder } from '@/features/views/common/utils/categoryOrder';

export interface StackCategoryNote {
  column: string;
  /** False when the Data Blocks' orders disagree and the result lists values A to Z. */
  kept: boolean;
  order: string[];
}

const preview = (order: string[]): string =>
  order.length > 6 ? `${order.slice(0, 6).join(', ')}, …` : order.join(', ');

/** One sentence per note, for the Stack panel and its result toast. */
export const stackCategoryNoteText = (note: StackCategoryNote): string =>
  note.kept
    ? `"${note.column}": the orders agree, so the stacked column keeps the order ${preview(note.order)}.`
    : `"${note.column}": the orders differ, so the stacked column lists its values A to Z.`;

/**
 * What Stack will do with category columns whose orders differ (issue 318).
 * Used by: useConcatSubTab. Reads each Data Block's order with the category
 * values endpoint and combines them as the backend does; columns whose orders
 * already match, or that no Data Block has ordered, need no note.
 */
export const useStackCategoryNotes = (
  workspaceId: string | null,
  nodeIds: string[],
  columns: string[],
): StackCategoryNote[] => {
  const pairs = columns.flatMap((column) => nodeIds.map((nodeId) => ({ column, nodeId })));
  const results = useQueries({
    queries: pairs.map(({ column, nodeId }) => ({
      queryKey: ['workspaces', workspaceId ?? '', 'nodes', nodeId, 'category-values', column],
      enabled: Boolean(workspaceId),
      staleTime: 30_000,
      retry: false,
      queryFn: async () => {
        const { data } = await getCategoryValues({
          path: { workspace_id: workspaceId ?? '', node_id: nodeId },
          query: { column },
          throwOnError: true,
        });
        return data;
      },
    })),
  });
  return columns.flatMap((column) => {
    const values = pairs
      .map((pair, index) => (pair.column === column ? results[index]?.data : undefined))
      .filter((value) => value !== undefined);
    if (values.length !== nodeIds.length) return [];
    const ordered = values.filter((value) => value.is_ordered).map((value) => value.labels);
    if (ordered.length === 0) return [];
    const first = values[0];
    const allSame = values.every(
      (value) =>
        value.is_ordered === first?.is_ordered &&
        value.labels.length === first.labels.length &&
        value.labels.every((label, index) => label === first.labels[index]),
    );
    if (allSame) return [];
    const unordered = values.filter((value) => !value.is_ordered).flatMap((value) => value.labels);
    const { order, kept } = stackedCategoryOrder(ordered, unordered);
    return [{ column, kept, order }];
  });
};
