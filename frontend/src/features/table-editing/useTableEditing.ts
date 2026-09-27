import { objectDependencies } from '@/features/project/projectChanges';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import * as api from '@/features/project/api';

export interface EditableCell {
  rowRef: string;
  column: api.CellEditColumn;
  original: string | null;
  value: string | null;
  options?: string[];
  changed: boolean;
  disabled: boolean;
  onChange: (value: string | null) => void;
}

interface InsertedRow {
  id: string;
  before: string | null;
  values: Record<string, string | null>;
}
interface Draft {
  patches: Map<string, api.CellPatch>;
  deletions: Set<string>;
  insertions: InsertedRow[];
}
type DisplayRow = { ref: string; sourceIndex: number } | { ref: string; insertion: InsertedRow };

/** Headless editing state shared by the table dialog and column-restricted annotation panels. */
export function useTableEditing({
  base,
  session,
  editableColumns,
  allowRowChanges = editableColumns === undefined,
  review,
  initialPageSize = 20,
  liveDependencies,
  readPages = true,
  onFinished,
}: {
  base: string;
  session: api.CellEditSession;
  editableColumns?: readonly string[];
  allowRowChanges?: boolean;
  review?: Omit<api.AnnotationReview, 'changes'>;
  initialPageSize?: number;
  liveDependencies?: api.ObjectRef[];
  /** Callers with captured rows can edit their typed references without fetching another page. */
  readPages?: boolean;
  onFinished: (saved: boolean) => void | Promise<void>;
}) {
  const finished = useRef(false);
  const mounted = useRef(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sorting, setSorting] = useState<SortingState>([]);
  const nextRow = useRef(0);
  const [draft, setDraft] = useState<Draft>(() => ({
    patches: new Map(),
    deletions: new Set(),
    insertions: [],
  }));
  useEffect(() => {
    mounted.current = true;
    const release = () => {
      if (finished.current) return;
      void api.cancelCellEdit(base, session.session_id).catch((error: unknown) => {
        // Teardown may follow an accepted Save whose successful response was lost.
        if (!(error instanceof Error && 'code' in error && error.code === 'editing_closed'))
          console.warn('Could not release table editing session during teardown', error);
      });
    };
    window.addEventListener('pagehide', release);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', release);
      // Strict Mode's immediate effect reattachment retains the same session.
      queueMicrotask(() => {
        if (!mounted.current) release();
      });
    };
  }, [base, session.session_id]);
  const rows = useQuery({
    queryKey: [
      'native',
      base,
      'cell-edit',
      session.session_id,
      page,
      pageSize,
      sorting,
      review,
      review ? [...draft.patches.values()] : null,
    ],
    queryFn: ({ signal }) =>
      api.cellEditPage(
        base,
        session.session_id,
        page,
        pageSize,
        sorting,
        signal,
        review ? { ...review, changes: [...draft.patches.values()] } : undefined,
      ),
    placeholderData: review ? (previous) => previous : undefined,
    // Keep only the active snapshot page; pending edits belong to the draft.
    meta: liveDependencies ? objectDependencies(...liveDependencies) : undefined,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: readPages,
  });
  const save = useMutation({
    mutationFn: () =>
      api.saveCellEdit(base, session.session_id, {
        changes: [...draft.patches.values()],
        deletions: [...draft.deletions],
        insertions: draft.insertions.map(({ values }) => ({ values })),
      }),
    onSuccess: () => {
      finished.current = true;
      return onFinished(true);
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelCellEdit(base, session.session_id),
    onSuccess: () => {
      finished.current = true;
      return onFinished(false);
    },
  });
  const busy = save.isPending || cancel.isPending;
  // Anchor drafts to snapshot rows so page revisits and sorting keep them together.
  // Deleted anchors still locate their inserted rows until Save ends the snapshot.
  const before = new Map<string | null, InsertedRow[]>();
  for (const row of draft.insertions) {
    const group = before.get(row.before) ?? [];
    group.push(row);
    before.set(row.before, group);
  }
  const displayed: DisplayRow[] = [];
  for (const [sourceIndex, ref] of (rows.data?.rowRefs ?? []).entries()) {
    for (const insertion of before.get(ref) ?? []) displayed.push({ ref: insertion.id, insertion });
    if (!draft.deletions.has(ref)) displayed.push({ ref, sourceIndex });
  }
  if (page === 1) {
    for (const insertion of before.get(null) ?? [])
      displayed.push({ ref: insertion.id, insertion });
  }
  const blank = Object.fromEntries(session.columns.map(({ name }) => [name, null]));
  function addRowAbove(rowIndex?: number) {
    if (busy || !rows.data) return;
    const target = rowIndex === undefined ? undefined : displayed[rowIndex];
    const insertion: InsertedRow = {
      id: `new:${String(nextRow.current++)}`,
      before: target
        ? 'insertion' in target
          ? target.insertion.before
          : target.ref
        : (rows.data.rowRefs[0] ?? null),
      values: Object.fromEntries(
        session.columns.filter((c) => c.editable || c.identifier).map(({ name }) => [name, null]),
      ),
    };
    setDraft((previous) => {
      const insertions = [...previous.insertions];
      const index =
        target && 'insertion' in target
          ? insertions.findIndex((row) => row.id === target.ref)
          : insertions.length;
      insertions.splice(index, 0, insertion);
      return { ...previous, insertions };
    });
  }
  function deleteRow(rowIndex: number) {
    if (busy) return;
    const target = displayed[rowIndex];
    if (!target) return;
    setDraft((previous) => {
      if ('insertion' in target) {
        return {
          ...previous,
          insertions: previous.insertions.filter((row) => row.id !== target.ref),
        };
      }
      const patches = new Map(previous.patches);
      for (const [key, patch] of patches) if (patch.row_ref === target.ref) patches.delete(key);
      return { ...previous, patches, deletions: new Set([...previous.deletions, target.ref]) };
    });
  }
  function referencedCell(
    rowRef: string,
    name: string,
    original: string | null,
    options?: string[],
  ): EditableCell | undefined {
    const column = session.columns.find((column) => column.name === name);
    if (!column?.editable || (editableColumns && !editableColumns.includes(name))) return;
    const key = JSON.stringify([rowRef, name]);
    const value = draft.patches.get(key)?.value;
    return {
      rowRef,
      column,
      original,
      value: value === undefined ? original : value,
      options,
      changed: draft.patches.has(key),
      disabled: busy,
      onChange: (value) => {
        if (busy) return;
        setDraft((previous) => {
          const patches = new Map(previous.patches);
          if (value === original) patches.delete(key);
          else patches.set(key, { row_ref: rowRef, column: name, value });
          return { ...previous, patches };
        });
      },
    };
  }
  function cell(rowIndex: number, name: string): EditableCell | undefined {
    const column = session.columns.find((column) => column.name === name);
    const data = rows.data;
    const row = displayed[rowIndex];
    if (!column || !data || !row || (editableColumns && !editableColumns.includes(name))) return;
    if (!column.editable && !(column.identifier && 'insertion' in row)) return;
    const rowRef = row.ref;
    const insertion = 'insertion' in row ? row.insertion : undefined;
    const original = 'sourceIndex' in row ? data.editableValues[row.sourceIndex]?.[name] : null;
    if (original === undefined) return;
    if (!insertion) return referencedCell(rowRef, name, original, data.options[name]);
    const value = insertion.values[name] ?? null;
    return {
      rowRef,
      column,
      original,
      value,
      options: data.options[name],
      changed: value !== original,
      disabled: busy,
      onChange: (value) => {
        if (busy) return;
        setDraft((previous) => ({
          ...previous,
          insertions: previous.insertions.map((row) =>
            row.id === rowRef ? { ...row, values: { ...row.values, [name]: value } } : row,
          ),
        }));
      },
    };
  }
  return {
    rows,
    data: displayed.map((row) =>
      'sourceIndex' in row ? (rows.data?.rows[row.sourceIndex] ?? blank) : blank,
    ),
    rowIds: displayed.map((row) => row.ref),
    rowCount: rows.data?.review?.filtered_rows ?? session.row_count,
    cell,
    referencedCell,
    page,
    pageSize,
    sorting,
    busy,
    changedCells: draft.patches.size,
    addedRows: draft.insertions.length,
    deletedRows: draft.deletions.size,
    modified: draft.patches.size > 0 || draft.insertions.length > 0 || draft.deletions.size > 0,
    addRowAbove: allowRowChanges ? addRowAbove : undefined,
    deleteRow: allowRowChanges ? deleteRow : undefined,
    save: () => {
      if (!busy) save.mutate();
    },
    cancel: () => {
      if (!busy) cancel.mutate();
    },
    saveAsync: save.mutateAsync,
    cancelAsync: cancel.mutateAsync,
    saving: save.isPending,
    setPage: (value: number) => {
      if (!busy) setPage(value);
    },
    setPageSize: (value: number) => {
      if (!busy) {
        setPageSize(value);
        setPage(1);
      }
    },
    setSorting: (value: SortingState) => {
      if (!busy) {
        setSorting(value);
        setPage(1);
      }
    },
  };
}
