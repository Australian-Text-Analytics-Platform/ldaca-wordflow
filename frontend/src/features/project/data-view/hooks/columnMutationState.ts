import type { ColumnCastType } from '../services/schemaMutations';

/** The callback captures the owning table and kind, even if the preview changes. */
export interface PendingCast {
  column: string;
  targetType: ColumnCastType;
  execute: (column: string, targetType: ColumnCastType, format?: string) => Promise<void>;
}
export interface PendingSqlCast extends Omit<PendingCast, 'targetType'> {
  nodeName: string;
}
export interface ColumnMutationState {
  renamingColumn: string | null;
  datetimeModal: PendingCast | null;
  sqlTypeModal: PendingSqlCast | null;
  columnToDelete: string | null;
}
export type ColumnMutationAction =
  | { type: 'datetimeRequested'; request: PendingCast }
  | { type: 'datetimeClosed'; request?: PendingCast }
  | { type: 'sqlTypeRequested'; request: PendingSqlCast }
  | { type: 'sqlTypeClosed'; request: PendingSqlCast }
  | { type: 'renameStarted'; column: string }
  | { type: 'renameClosed' }
  | { type: 'deleteRequested'; column: string }
  | { type: 'deleteDialogChanged'; open: boolean };
export const createColumnMutationState = (): ColumnMutationState => ({
  renamingColumn: null,
  datetimeModal: null,
  sqlTypeModal: null,
  columnToDelete: null,
});
export const columnMutationReducer = (
  state: ColumnMutationState,
  action: ColumnMutationAction,
): ColumnMutationState => {
  switch (action.type) {
    case 'datetimeRequested':
      return { ...state, datetimeModal: action.request };
    case 'datetimeClosed':
      return !action.request || state.datetimeModal === action.request
        ? { ...state, datetimeModal: null }
        : state;
    case 'sqlTypeRequested':
      return { ...state, sqlTypeModal: action.request };
    case 'sqlTypeClosed':
      return state.sqlTypeModal === action.request ? { ...state, sqlTypeModal: null } : state;
    case 'renameStarted':
      return { ...state, renamingColumn: action.column };
    case 'renameClosed':
      return { ...state, renamingColumn: null };
    case 'deleteRequested':
      return { ...state, columnToDelete: action.column };
    case 'deleteDialogChanged':
      return action.open ? state : { ...state, columnToDelete: null };
  }
};
