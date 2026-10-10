/** Temporary label Data Blocks kept from AI annotation runs (issue 371). */
import type { WorkspaceNodeInfo } from '@/api';

export interface SavedLabelsBlock {
  id: string;
  name: string;
  column: string;
  labels: number | null;
}

/** The label Data Blocks kept for this source Data Block. */
export function savedLabelBlocks(
  nodes: readonly WorkspaceNodeInfo[],
  sourceNodeId: string,
): SavedLabelsBlock[] {
  return nodes.flatMap((node) => {
    // Nodes known only by id and name (older listings, tests) have no provenance.
    const provenance = node.provenance as WorkspaceNodeInfo['provenance'] | undefined;
    if (provenance?.type !== 'derivation' || provenance.operation.kind !== 'annotation') return [];
    const input = provenance.inputs[0]?.value;
    if (input?.type !== 'node' || input.node_id !== sourceNodeId) return [];
    return [
      {
        id: node.id,
        name: node.name,
        column: provenance.operation.annotation_column,
        labels: node.shape?.[0] ?? null,
      },
    ];
  });
}
