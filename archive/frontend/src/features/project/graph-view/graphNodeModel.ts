import type { ProjectGraphNode } from '@/api';

/** Exact node-card data rendered by React Flow's `CustomNode`. */
export interface ProjectGraphNodeCard {
  id: string;
  name: string;
  color: string | null;
  shape: [number | null, number | null];
  canUndo: boolean;
  canRedo: boolean;
  kind?: 'table' | 'view' | 'missing';
}

/** Projects the generated graph node once before it crosses into React Flow state. */
export const toProjectGraphNodeCard = (node: ProjectGraphNode): ProjectGraphNodeCard => ({
  id: node.id,
  name: node.name,
  color: node.color ?? null,
  shape: node.shape ?? [null, null],
  canUndo: node.can_undo,
  canRedo: node.can_redo,
});
