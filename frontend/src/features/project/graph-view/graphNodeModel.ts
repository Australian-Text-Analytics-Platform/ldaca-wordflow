/** Exact node-card data rendered by React Flow's `CustomNode`. */
export interface ProjectGraphNodeCard {
  id: string;
  name: string;
  color: string | null;
  columnCount: number | null;
  canUndo: boolean;
  kind?: 'table' | 'view' | 'missing';
}
