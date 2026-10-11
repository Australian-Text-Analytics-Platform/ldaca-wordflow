/** Quotations kept from Quotation Runs that didn't finish (issue 381). */
import type { WorkspaceNodeInfo } from '@/api';

export interface KeptQuotationsBlock {
  id: string;
  name: string;
  texts: number | null;
  /** The settings whose next Run continues from these quotations. */
  column: string;
  engineType: 'local' | 'remote';
  engineId: string | null;
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
    return [
      {
        id: node.id,
        name: node.name,
        texts: node.shape?.[0] ?? null,
        column: provenance.operation.column,
        engineType: provenance.operation.engine_type,
        engineId: provenance.operation.engine_id ?? null,
      },
    ];
  });
}

export interface ResumeSettings {
  column: string;
  engineType: 'local' | 'remote';
  engineId: string | null;
}

/** Whether the next Run with these settings continues from kept quotations. */
export function resumesFromKeptQuotations(
  blocks: readonly KeptQuotationsBlock[],
  settings: ResumeSettings,
): boolean {
  return blocks.some(
    (block) =>
      block.column === settings.column &&
      block.engineType === settings.engineType &&
      (block.engineType === 'local' || block.engineId === settings.engineId),
  );
}
