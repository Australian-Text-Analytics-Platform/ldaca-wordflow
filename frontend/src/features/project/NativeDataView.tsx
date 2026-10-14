import * as projectApi from '@/features/project/api';
import { ProjectDataTableView } from '@/features/project/data-view/components/ProjectDataTableView';
import { type ColumnCastType } from '@/features/project/data-view/services/schemaMutations';
import * as objectsApi from '@/features/project/objects';
import { objectDependencies } from '@/features/project/projectChanges';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { schemaQuery } from './projectQueries';
import { defaultNodeView, useProjectViewState } from './projectViewState';

import { useProjectPreview } from './previewState';
import { EditorToolbar } from './data-editor/DataEditorPanel';
import { DataBlockDownload } from './DataBlockDownload';
import { compileEditor } from './data-editor/expressions';
import { usePreprocessingPreview } from '@/features/tools/preprocessing/hooks/usePreprocessingPreview';
import { previewSql } from '@/features/tools/preprocessing/projectPreprocessing';
export default function NativeDataView({
  base,
  nodes,
  name,
  onClose,
  rename,
  undo,
  logical = true,
}: {
  logical?: boolean;
  base: string;
  nodes: projectApi.ProjectNode[];
  name: objectsApi.DataTarget;
  onClose: () => void;
  rename: (id: objectsApi.DataTarget, name: string) => Promise<unknown>;
  undo: (id: objectsApi.DataTarget) => void;
}) {
  const cache = useQueryClient();
  // The slide-out retains this component briefly; closed previews must not refetch deleted data.
  const isOpen = useProjectPreview((state) => objectsApi.sameTarget(state.active, name));
  const node = nodes.find((n) => objectsApi.sameTarget(n.object ?? n.table_name, name));
  const key = objectsApi.targetKey(name);
  const object = objectsApi.objectRef(name);
  const editor = useProjectPreview((state) => state.editor);
  const editing = editor && objectsApi.sameTarget(editor.target, name) ? editor : null;
  const request = useProjectViewState((s) => s.nodes.get(key) ?? defaultNodeView);
  const update = (patch: Partial<typeof request>) => {
    useProjectViewState.getState().update(key, patch);
  };
  const schema = useQuery({
    ...schemaQuery(base, name, true),
    meta: { ...objectDependencies(object), reportError: false },
    enabled: isOpen && !!node,
  });
  const validSorting = request.sorting.every((sort) =>
    schema.data?.some((field) => field.name === sort.id),
  );
  // Both route forms identify the same object through this schema/name tuple.
  const rows = useQuery({
    queryKey: [
      'native',
      base,
      'rows',
      object.schema,
      object.name,
      { page: request.page, size: request.size, sorting: request.sorting },
    ],
    enabled: isOpen && !!node && !!schema.data && validSorting && !editing,
    gcTime: 0,
    meta: { ...objectDependencies(object), reportError: false },
    queryFn: ({ signal }) =>
      projectApi.rowPage(base, name, request.page, request.size, request.sorting, signal),
    placeholderData: (previous, query) =>
      query?.queryKey[3] === object.schema && query.queryKey[4] === object.name
        ? previous
        : undefined,
  });
  const fields = schema.data ?? [];
  let operation: ReturnType<typeof compileEditor> | undefined;
  if (editing && schema.data) {
    try {
      operation = compileEditor(
        editing.tool,
        editing.draft,
        fields.map((field) => field.name),
        node?.kind === 'table',
      );
    } catch {
      /* Incomplete forms keep the original data visible. */
    }
  }
  const editPreview = usePreprocessingPreview({
    request: operation
      ? {
          select: operation.select,
          sorting: request.sorting.filter(
            (sort) =>
              (fields.some((field) => field.name === sort.id) &&
                !(
                  operation.change.operation === 'delete_many' &&
                  operation.change.columns.includes(sort.id)
                )) ||
              operation.outputs.includes(sort.id),
          ),
        }
      : null,
    identity: {
      projectBase: base,
      operation: `data-editor-${object.schema}`,
      nodeIds: [object.name],
    },
    enabled: Boolean(editing),
    debounceMs: 350,
    reportError: false,
    retainLastSuccess: true,
    fetcher: ({ request, page, pageSize, signal }) =>
      previewSql(
        base,
        `WITH __wf_current AS (SELECT * FROM ${objectsApi.objectSql(name)}) SELECT * FROM (${request.select})${request.sorting.length ? ` ORDER BY ${request.sorting.map((sort) => `${objectsApi.identifier(sort.id)} ${sort.desc ? 'DESC' : 'ASC'}`).join(', ')}` : ''}`,
        page,
        pageSize,
        signal,
      ),
  });
  const showingEdit = Boolean(editing && editPreview.columns.length);
  useEffect(() => {
    if (!schema.data) return;
    const names = new Set(schema.data.map((field) => field.name));
    for (const output of operation?.outputs ?? []) names.add(output);
    useProjectViewState.getState().reconcileColumns(key, names);
  }, [schema.data, request.sorting, key, operation]);
  const changeColumn = async (
    change: projectApi.ColumnChange,
    columnChange?: { from: string; to?: string },
  ) => {
    if (!node) return;
    // The operation and its UI reconciliation retain the target captured at submission.
    const target = name;
    await projectApi.changeColumn(base, target, change);
    const views = useProjectViewState.getState();
    if (columnChange) {
      // Reconcile schema and sorting together until the committed refresh arrives.
      cache.setQueryData(schemaQuery(base, target).queryKey, (previous) =>
        previous?.flatMap((column) => {
          if (column.name !== columnChange.from) return [column];
          return columnChange.to
            ? [
                {
                  ...column,
                  name: columnChange.to,
                  field: column.field.clone({ name: columnChange.to }),
                },
              ]
            : [];
        }),
      );
      views.changeColumn(objectsApi.targetKey(target), columnChange.from, columnChange.to);
    }
    views.update(objectsApi.targetKey(target), { page: 1 });
  };
  const cast = (column: string, target: ColumnCastType, format?: string) =>
    changeColumn({ operation: 'cast', column, target, format });
  const renameColumn = (column: string, next: string) =>
    changeColumn({ operation: 'rename', column, name: next }, { from: column, to: next });
  const deleteColumn = (column: string) =>
    changeColumn({ operation: 'delete', column }, { from: column });
  return (
    <ProjectDataTableView
      toolbar={
        <>
          <div className="flex flex-wrap items-center gap-1">
            <EditorToolbar target={name} column={fields[0]?.name ?? ''} />
            {node && <DataBlockDownload base={base} target={name} />}
          </div>
          {showingEdit && (
            <p className="px-2 text-label-secondary text-description">
              {editPreview.outdated
                ? 'Previous preview — waiting for the current edit.'
                : 'Edit preview — Apply commits this change.'}
            </p>
          )}
        </>
      }
      model={{
        selectedNode: node ? { id: key } : null,
        header: {
          nodeLabel: objectsApi.targetLabel(name),
          renameValue: object.name,
          isEmptyTable: rows.data?.rows.length === 0,
          canUndo: node?.can_undo ?? false,
        },
        nodeActions: {
          onClose,
          undoTitle:
            'Undo applies only to View query layers. Table writes and metadata changes are not undone.',
          redoTitle: 'Redo is not available for native SQL edits.',
          onRename: (next) => rename(name, next),
          onUndo: () => {
            undo(name);
          },
        },
        loading: { nodeData: schema.isLoading || (!editing && rows.isLoading) },
        table: {
          base,
          data: showingEdit ? editPreview.data : (rows.data?.rows ?? []),
          columns: showingEdit ? editPreview.columns : (rows.data?.columns ?? []),
          columnFields: Object.fromEntries(
            (showingEdit ? (editPreview.schema ?? fields) : fields).map((f) => {
              const changed = operation?.outputs.includes(f.name);
              const original = fields.find((field) => field.name === f.name);
              if (changed && editing?.tool === 'duplicate') {
                const source = fields.find((field) => field.name === editing.draft.column);
                if (source) return [f.name, source.field.clone({ name: f.name })];
              }
              return [f.name, !changed && original ? original.field : f.field];
            }),
          ),
          revealColumns: !editPreview.outdated ? operation?.outputs : undefined,
          revealRevision: !editPreview.outdated ? operation?.select : undefined,
          nodeId: key,
          nodeLabel: objectsApi.targetLabel(name),
          documentColumn: logical ? (node?.document_column ?? undefined) : undefined,
          fetching: editing ? editPreview.loading : rows.isFetching,
          pageError: schema.error ?? (editing ? editPreview.error : rows.error),
          onRetryPage: () => {
            void schema.refetch();
            void rows.refetch();
            if (editing) editPreview.refresh();
          },
          pagination: showingEdit
            ? { page: editPreview.page, page_size: editPreview.pageSize }
            : { page: request.page, page_size: request.size },
          hasNext: showingEdit ? editPreview.pagination?.has_next : rows.data?.hasNext,
          preferences: request.columns,
          onPreferencesChange: (columns) => {
            update({ columns });
          },
          sorting: request.sorting,
          onPageChange: (page) => {
            if (showingEdit) {
              editPreview.setPage(page);
              return;
            }
            update({ page });
          },
          onPageSizeChange: (size) => {
            if (showingEdit) {
              editPreview.setPageSize(size);
              return;
            }
            update({ size, page: 1 });
          },
          onSortingChange: (sorting) => {
            update({ sorting, page: 1 });
          },
          onCast: editing ? undefined : cast,
          onRenameColumn: editing ? undefined : renameColumn,
          onDeleteColumn: editing ? undefined : deleteColumn,
          loadColumnExamples: async (column, signal) => {
            const result = await projectApi.querySql(
              base,
              [
                {
                  sql: `SELECT CAST(${objectsApi.identifier(column)} AS VARCHAR) AS value FROM ${objectsApi.objectSql(name)} WHERE ${objectsApi.identifier(column)} IS NOT NULL LIMIT 3`,
                },
              ],
              signal,
            );
            return Array.from(result, (row) => String(row.value));
          },
        },
      }}
    />
  );
}
