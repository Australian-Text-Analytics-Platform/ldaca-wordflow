import { useCallback, useReducer, useId } from 'react';
import { useMutation, useMutationState } from '@tanstack/react-query';

import { type ArrowField } from '@/lib/arrow/decodeArrowTable';

import {
  columnMutationReducer,
  createColumnMutationState,
  type PendingCast,
  type PendingSqlCast,
} from './columnMutationState';
import { ProjectError } from '@/features/project/api';
import { columnCastIdentity, type ColumnCastType } from '../services/schemaMutations';

interface UseColumnMutationsArgs {
  nodeName?: string;
  columnFields: Record<string, ArrowField>;
  onCast?: (column: string, targetType: ColumnCastType, format?: string) => Promise<void>;
  onRenameColumn?: (column: string, nextName: string) => Promise<void>;
  onDeleteColumn?: (column: string) => Promise<void>;
  onError?: (error: unknown) => void;
}

export interface ColumnMutationsApi {
  // Read state
  columnFields: Record<string, ArrowField>;
  loadingCast: Record<string, boolean>;
  columnActionLoading: Record<string, boolean>;
  renamingColumn: string | null;

  // Datetime confirmation modal with an optional parsing format.
  datetimeModal: PendingCast | null;
  closeDatetimeModal: () => void;
  handleDatetimeFormatConfirm: (format?: string) => Promise<void>;
  sqlTypeModal: PendingSqlCast | null;
  requestSqlType: (column: string) => void;
  closeSqlTypeModal: () => void;
  confirmSqlType: (sqlType: string) => Promise<void>;

  // Delete-column confirmation dialog
  deleteColumnDialogOpen: boolean;
  setDeleteColumnDialogOpen: (open: boolean) => void;
  columnToDelete: string | null;
  requestDeleteColumn: (column: string) => void;
  confirmDeleteColumn: () => Promise<void>;

  handleTypeChange: (column: string, newType: ColumnCastType) => void;
  startRename: (column: string) => void;
  cancelRename: () => void;
  submitRename: (column: string, value: string) => Promise<void>;
}

/** Column mutation dialogs and pending state; schema remains owned by the parent query. */
export const useColumnMutations = ({
  nodeName = '',
  columnFields,
  onCast,
  onRenameColumn,
  onDeleteColumn,
  onError,
}: UseColumnMutationsArgs): ColumnMutationsApi => {
  const [state, dispatch] = useReducer(columnMutationReducer, undefined, createColumnMutationState);
  const { renamingColumn, datetimeModal, sqlTypeModal, columnToDelete } = state;
  const owner = useId();
  interface Change {
    column: string;
    kind: 'cast' | 'action';
    execute: () => Promise<void>;
  }
  const mutationKey = ['column-operation', owner];
  const { mutateAsync } = useMutation({
    mutationKey,
    meta: { reportError: false },
    mutationFn: (change: Change) => change.execute(),
  });
  const pending = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (mutation) => mutation.state.variables as Change,
  });
  const loadingCast = Object.fromEntries(
    pending.filter((change) => change.kind === 'cast').map((change) => [change.column, true]),
  );
  const columnActionLoading = Object.fromEntries(
    pending.filter((change) => change.kind === 'action').map((change) => [change.column, true]),
  );
  const deleteColumnDialogOpen = columnToDelete !== null;
  /** Runs a dtype cast and refreshes schema so headers reflect the new type. */
  const performCast = useCallback(
    async (column: string, targetType: ColumnCastType, format?: string, execute = onCast) => {
      if (!execute || !onError) return false;
      try {
        await mutateAsync({
          column,
          kind: 'cast',
          execute: () => execute(column, targetType, format),
        });
        return true;
      } catch (error) {
        if (
          targetType === 'datetime' &&
          format === undefined &&
          error instanceof ProjectError &&
          error.code === 'datetime_format_required'
        ) {
          dispatch({ type: 'datetimeRequested', request: { column, targetType, execute } });
        } else {
          onError(error);
        }
        return false;
      }
    },
    [onCast, onError, mutateAsync],
  );

  /** Handles dtype menu selection, including the datetime-format confirmation path. */
  const handleTypeChange = useCallback(
    (column: string, newType: ColumnCastType) => {
      if (!onCast || !onError) return;
      const currentField = columnFields[column];
      if (currentField && newType !== 'categorical' && newType === columnCastIdentity(currentField))
        return;
      void performCast(column, newType);
    },
    [onCast, onError, columnFields, performCast],
  );

  /** Applies the datetime format chosen in the confirmation panel. */
  const handleDatetimeFormatConfirm = useCallback(
    async (format?: string) => {
      if (!datetimeModal || !format?.trim()) return;
      const request = datetimeModal;
      if (await performCast(request.column, request.targetType, format.trim(), request.execute)) {
        dispatch({ type: 'datetimeClosed', request });
      }
    },
    [datetimeModal, performCast],
  );

  /** Closes the datetime confirmation panel without casting. */
  const closeDatetimeModal = useCallback(() => {
    dispatch({ type: 'datetimeClosed' });
  }, []);

  const requestSqlType = (column: string) => {
    if (onCast && onError) {
      dispatch({ type: 'sqlTypeRequested', request: { column, nodeName, execute: onCast } });
    }
  };
  const closeSqlTypeModal = () => {
    if (sqlTypeModal) dispatch({ type: 'sqlTypeClosed', request: sqlTypeModal });
  };
  const confirmSqlType = async (sqlType: string) => {
    if (!sqlTypeModal || !sqlType.trim()) return;
    const request = sqlTypeModal;
    if (
      await performCast(request.column, { sqlType: sqlType.trim() }, undefined, request.execute)
    ) {
      dispatch({ type: 'sqlTypeClosed', request });
    }
  };

  /** Opens inline rename mode for one column. */
  const startRename = useCallback((column: string) => {
    dispatch({ type: 'renameStarted', column });
  }, []);

  /** Leaves inline rename mode without changing data. */
  const cancelRename = useCallback(() => {
    dispatch({ type: 'renameClosed' });
  }, []);

  /** Validates and applies a column rename through the selected Data Block edit. */
  const submitRename = useCallback(
    async (column: string, value: string) => {
      const nextName = value.trim();
      if (!onRenameColumn || !onError) {
        dispatch({ type: 'renameClosed' });
        return;
      }
      if (!nextName) {
        onError(new Error('Column name cannot be empty.'));
        return;
      }
      if (nextName === column) {
        dispatch({ type: 'renameClosed' });
        return;
      }

      try {
        await mutateAsync({
          column,
          kind: 'action',
          execute: () => onRenameColumn(column, nextName),
        });
        dispatch({ type: 'renameClosed' });
      } catch (error) {
        onError(error);
      }
    },
    [onRenameColumn, mutateAsync, onError],
  );

  /** Opens the destructive confirmation for one column. */
  const requestDeleteColumn = useCallback((column: string) => {
    dispatch({ type: 'deleteRequested', column });
  }, []);

  /** Mirrors the shared dialog open state into the reducer. */
  const setDeleteColumnDialogOpen = useCallback((open: boolean) => {
    dispatch({ type: 'deleteDialogChanged', open });
  }, []);

  /** Deletes the confirmed column through an identity-preserving edit. */
  const confirmDeleteColumn = useCallback(async () => {
    if (!columnToDelete || !onDeleteColumn || !onError) return;
    const column = columnToDelete;
    dispatch({ type: 'deleteDialogChanged', open: false });
    try {
      await mutateAsync({ column, kind: 'action', execute: () => onDeleteColumn(column) });
    } catch (error) {
      onError(error);
    }
  }, [columnToDelete, onDeleteColumn, mutateAsync, onError]);

  return {
    columnFields,
    loadingCast,
    columnActionLoading,
    renamingColumn,
    datetimeModal,
    closeDatetimeModal,
    handleDatetimeFormatConfirm,
    sqlTypeModal,
    requestSqlType,
    closeSqlTypeModal,
    confirmSqlType,
    deleteColumnDialogOpen,
    setDeleteColumnDialogOpen,
    columnToDelete,
    requestDeleteColumn,
    confirmDeleteColumn,
    handleTypeChange,
    startRename,
    cancelRename,
    submitRename,
  };
};
