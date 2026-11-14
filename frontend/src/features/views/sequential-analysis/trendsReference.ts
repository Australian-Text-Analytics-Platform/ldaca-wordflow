import type { WorkspaceNodeInfo } from '@/api';
import type { ArrowColumn } from '@/lib/arrow/arrowTable';
import type { SequentialColumnType } from './hooks/sequentialChartModel';
import { trendsAxisKind } from './trendsAxisColumns';

/**
 * Whether a Data Block can supply Trends denominators: it has the time column,
 * binnable the same way (a date for a date, a number for a number, and so on).
 * Null while its columns are not known yet. The backend checks the same.
 */
export function referenceAxisMatches(
  schema: readonly ArrowColumn[] | undefined,
  timeColumn: string,
  columnType: SequentialColumnType,
): boolean | null {
  if (schema === undefined) return null;
  const column = schema.find((candidate) => candidate.name === timeColumn);
  return column !== undefined && trendsAxisKind(column.field) === columnType;
}

/** The Data Blocks that `nodeId` was made from, directly or further back. */
export function ancestorIds(nodes: readonly WorkspaceNodeInfo[], nodeId: string): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors = new Set<string>();
  const pending = [...(byId.get(nodeId)?.parent_ids ?? [])];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || ancestors.has(id) || id === nodeId) continue;
    ancestors.add(id);
    pending.push(...(byId.get(id)?.parent_ids ?? []));
  }
  return ancestors;
}

/**
 * The reference a Data Block starts with: the first Data Block it was made
 * from that still exists, or null for a Data Block made from none.
 */
export function defaultReferenceNode(
  nodes: readonly WorkspaceNodeInfo[],
  nodeId: string,
): WorkspaceNodeInfo | null {
  const parentIds = nodes.find((node) => node.id === nodeId)?.parent_ids ?? [];
  for (const parentId of parentIds) {
    const parent = nodes.find((node) => node.id === parentId);
    if (parent && parent.id !== nodeId) return parent;
  }
  return null;
}

export interface ReferenceOption {
  id: string;
  name: string;
  /** Whether the analysed Data Block was made from this one. */
  ancestor: boolean;
}

/**
 * Data Blocks offered as a reference for `nodeId`: the ones it was made from
 * first, nearest first, then the others by name. The Data Block itself is
 * left out, since a Data Block cannot be its own reference.
 */
export function referenceOptions(
  nodes: readonly WorkspaceNodeInfo[],
  nodeId: string,
): ReferenceOption[] {
  const ancestors = ancestorIds(nodes, nodeId);
  const direct = new Set(nodes.find((node) => node.id === nodeId)?.parent_ids ?? []);
  const byName = (left: WorkspaceNodeInfo, right: WorkspaceNodeInfo) =>
    left.name.localeCompare(right.name);
  const ancestorNodes = nodes
    .filter((node) => ancestors.has(node.id))
    .sort((left, right) => {
      const leftDirect = direct.has(left.id) ? 0 : 1;
      const rightDirect = direct.has(right.id) ? 0 : 1;
      return leftDirect - rightDirect || byName(left, right);
    });
  const otherNodes = nodes
    .filter((node) => node.id !== nodeId && !ancestors.has(node.id))
    .sort(byName);
  return [
    ...ancestorNodes.map((node) => ({
      id: node.id,
      name: node.name,
      ancestor: true,
    })),
    ...otherNodes.map((node) => ({
      id: node.id,
      name: node.name,
      ancestor: false,
    })),
  ];
}
