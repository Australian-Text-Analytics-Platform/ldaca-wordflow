/** Quotations kept from Quotation Runs that didn't finish (issue 381). */
import type { WorkspaceNodeInfo } from '@/api';

export interface KeptQuotationsBlock {
  id: string;
  name: string;
  texts: number | null;
}

/** The kept quotation Data Blocks of this source Data Block. */
export function keptQuotationBlocks(
  nodes: readonly WorkspaceNodeInfo[],
  sourceNodeId: string,
): KeptQuotationsBlock[] {
  return nodes.flatMap((node) => {
    const provenance = node.provenance as WorkspaceNodeInfo['provenance'] | undefined;
    if (provenance?.type !== 'derivation' || provenance.operation.kind !== 'quotation_progress') {
      return [];
    }
    const input = provenance.inputs[0]?.value;
    if (input?.type !== 'node' || input.node_id !== sourceNodeId) return [];
    return [{ id: node.id, name: node.name, texts: node.shape?.[0] ?? null }];
  });
}
