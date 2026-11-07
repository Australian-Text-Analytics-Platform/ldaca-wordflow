import { useQueries } from '@tanstack/react-query';

import type { WorkspaceNodeInfo } from '@/api';
import { nodeSchemaQueryOptions } from '@/lib/nodeSchema';
import { referenceAxisMatches } from '../trendsReference';
import type { SequentialColumnType } from './sequentialChartModel';

interface ReferenceCandidatesArgs {
  workspaceId: string | null;
  /** Every Data Block in the Project. */
  nodes: readonly WorkspaceNodeInfo[];
  activeNodeId: string;
  /** The analysed Data Block's time column; empty before one is chosen. */
  timeColumn: string;
  columnType: SequentialColumnType;
}

/**
 * The Data Blocks the reference picker offers: the ones whose columns include
 * the time column, binnable the same way, so their rows can be counted per
 * period like the analysed ones (Chao). A Data Block whose columns are not
 * known yet stays offered, so a saved reference is not dropped while they
 * load; one known to lack the column is excluded, and a chosen one reads as
 * none. Without a time column every Data Block is offered.
 */
export function useReferenceCandidates({
  workspaceId,
  nodes,
  activeNodeId,
  timeColumn,
  columnType,
}: ReferenceCandidatesArgs): { nodes: WorkspaceNodeInfo[]; excluded: Set<string> } {
  const others = nodes.filter((node) => node.id !== activeNodeId);
  const schemas = useQueries({
    queries: others.map((node) => ({
      ...nodeSchemaQueryOptions({ workspaceId: workspaceId ?? '', nodeId: node.id }),
      enabled: Boolean(workspaceId && timeColumn),
    })),
  });
  const excluded = new Set<string>();
  const offered: WorkspaceNodeInfo[] = [];
  others.forEach((node, index) => {
    const matches = timeColumn
      ? referenceAxisMatches(schemas[index]?.data, timeColumn, columnType)
      : true;
    if (matches === false) excluded.add(node.id);
    else offered.push(node);
  });
  return { nodes: offered, excluded };
}
