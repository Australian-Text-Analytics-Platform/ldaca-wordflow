import { objectDependencies } from '@/features/project/projectChanges';
import { schemaQuery } from './projectQueries';
import { useEffect } from 'react';
import { useProjectViewState, defaultNodeView } from './projectViewState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectDataTableView } from '@/features/project/data-view/components/ProjectDataTableView';
import { type ColumnCastType } from '@/features/project/data-view/services/schemaMutations';
import * as api from './api';

import { useProjectPreview } from './previewState';
import { reportProjectError } from './projectErrors';
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
  nodes: api.ProjectNode[];
  name: api.DataTarget;
  onClose: () => void;
  rename: (id: api.DataTarget, name: string) => void;
  undo: (id: api.DataTarget) => void;
}) {
  const cache = useQueryClient();
  // The slide-out retains this component briefly; closed previews must not refetch deleted data.
  const isOpen = useProjectPreview((state) => api.sameTarget(state.active, name));
  const node = nodes.find((n) => api.sameTarget(n.object ?? n.table_name, name));
  const key = api.targetKey(name);
  const object = api.objectRef(name);
  const request = useProjectViewState((s) => s.nodes.get(key) ?? defaultNodeView);
  const update = (patch: Partial<typeof request>) => {
    useProjectViewState.getState().update(key, patch);
  };
  const schema = useQuery({
    ...schemaQuery(base, name, true),
    enabled: isOpen && !!node,
  });
  const validSorting = request.sorting.every((sort) =>
    schema.data?.some((field) => field.name === sort.id),
  );
  // Both route forms identify the same object through this schema/name tuple.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const rows = useQuery({
    queryKey: [
      'native',
      base,
      'rows',
      object.schema,
      object.name,
      { page: request.page, size: request.size, sorting: request.sorting },
    ],
    enabled: isOpen && !!node && !!schema.data && validSorting,
    gcTime: 0,
    meta: objectDependencies(object),
    queryFn: ({ signal }) =>
      api.rowPage(base, name, request.page, request.size, request.sorting, signal),
    placeholderData: (previous, query) =>
      query?.queryKey[3] === object.schema && query.queryKey[4] === object.name
        ? previous
        : undefined,
  });
  const fields = schema.data ?? [];
  useEffect(() => {
    if (!schema.data) return;
    const names = new Set(schema.data.map((field) => field.name));
    useProjectViewState.getState().reconcileColumns(key, names);
  }, [schema.data, request.sorting, key]);
  const changeColumn = async (
    change: api.ColumnChange,
    columnChange?: { from: string; to?: string },
  ) => {
    if (!node) return;
    // The operation and its UI reconciliation retain the target captured at submission.
    const target = name;
    await api.changeColumn(base, target, change);
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
      views.changeColumn(api.targetKey(target), columnChange.from, columnChange.to);
    }
    views.update(api.targetKey(target), { page: 1 });
  };
  const cast = (column: string, target: ColumnCastType, format?: string) =>
    changeColumn({ operation: 'cast', column, target, format });
  const renameColumn = (column: string, next: string) =>
    changeColumn({ operation: 'rename', column, name: next }, { from: column, to: next });
  const deleteColumn = (column: string) =>
    changeColumn({ operation: 'delete', column }, { from: column });
  return (
    <ProjectDataTableView
      model={{
        selectedNode: node ? { id: key } : null,
        header: {
          nodeLabel: api.targetLabel(name),
          renameValue: object.name,
          isEmptyTable: rows.data?.rows.length === 0,
          canUndo: node?.can_undo ?? false,
        },
        nodeActions: {
          onClose,
          undoTitle:
            'Undo applies only to View query layers. Table writes and metadata changes are not undone.',
          redoTitle: 'Redo is not available for native SQL edits.',
          onRename: (next) => {
            rename(name, next);
          },
          onUndo: () => {
            undo(name);
          },
        },
        loading: { nodeData: schema.isLoading || rows.isLoading },
        table: {
          base,
          data: rows.data?.rows ?? [],
          columns: rows.data?.columns ?? [],
          columnFields: Object.fromEntries(fields.map((f) => [f.name, f.field])),
          nodeId: key,
          nodeLabel: api.targetLabel(name),
          documentColumn: logical ? (node?.document_column ?? undefined) : undefined,
          fetching: rows.isFetching,
          pageError: schema.error ?? rows.error,
          pagination: { page: request.page, page_size: request.size },
          hasNext: rows.data?.hasNext,
          preferences: request.columns,
          onPreferencesChange: (columns) => {
            update({ columns });
          },
          sorting: request.sorting,
          onPageChange: (page) => {
            update({ page });
          },
          onPageSizeChange: (size) => {
            update({ size, page: 1 });
          },
          onSortingChange: (sorting) => {
            update({ sorting, page: 1 });
          },
          onCast: cast,
          onRenameColumn: renameColumn,
          onDeleteColumn: deleteColumn,
          onMutationError: reportProjectError,
        },
      }}
    />
  );
}
