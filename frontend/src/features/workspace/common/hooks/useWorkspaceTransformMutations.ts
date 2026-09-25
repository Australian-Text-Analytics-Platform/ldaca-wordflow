import { useMemo } from 'react';
import { type QueryClient, useMutation } from '@tanstack/react-query';
import {
  createNode,
  createWorkspaceSqlDataBlock,
  editNode,
  previewNodeCreationTable,
  redoNode,
  undoNode,
} from '@/api';
import type {
  AnnotationClassRow,
  CreateNodeData,
  EditNodeData,
  PreviewNodeCreationData,
} from '@/api';
import type { PolarsExpressionRequest } from '@/api';
import type { FilterRequest as FilterRequestPayload } from '@/features/views/preprocessing/types';
import type { SliceRequestPayload } from '@/features/views/preprocessing/slice/hooks/sliceFormModel';
import type { PreprocessingApplyMode } from '@/features/views/preprocessing/preprocessingApplyMode';
import type { ColumnCastType } from '@/features/workspace/data-view/services/schemaMutations';
import { useFreshNodesStore } from '@/stores/freshNodesStore';
import {
  invalidateNodeWorkspaceQueries,
  invalidateWorkspaceGraphQuery,
} from './workspaceMutationCache';

interface WorkspaceTransformMutationsParams {
  currentWorkspaceId: string | null;
  queryClient: QueryClient;
}

/** Complete identity and transport context for one cancellable preprocessing preview. */
interface WorkspaceOperationPreviewRequest<RequestPayload> {
  workspaceId: string;
  nodeId: string;
  payload: RequestPayload;
  page: number;
  pageSize: number;
  signal: AbortSignal;
}

const toPreviewResponse = (
  result: Awaited<ReturnType<typeof previewNodeCreationTable>>,
  page: number,
  pageSize: number,
) => ({
  data: result.rows,
  columns: result.columns,
  pagination: { page, page_size: pageSize, has_next: result.hasNext },
});

/**
 * Owns preprocessing and column-edit actions exposed through WorkspaceProvider.
 * Used by: useWorkspaceNodeMutations because filter/slice/replace/expression
 * and column mutations share node-cache invalidation, but do not need to live
 * beside workspace selection or graph-combine mutations.
 * Flow: build mutation-backed apply actions, keep preview calls side-effect
 * free, invalidate graph/data/schema caches after writes, and return a stable
 * action object for preprocessing and table consumers.
 */
export const useWorkspaceTransformMutations = ({
  currentWorkspaceId,
  queryClient,
}: WorkspaceTransformMutationsParams) => {
  const requireNode = <T>(value: T | undefined): T => {
    if (value === undefined) throw new Error('Node operation returned no resource');
    return value;
  };
  const ensureWorkspaceSelected = () => {
    if (!currentWorkspaceId) {
      throw new Error('No project selected');
    }
    return currentWorkspaceId;
  };
  const markCreatedNode = (node: { id: string }) => {
    if (currentWorkspaceId) {
      useFreshNodesStore.getState().markCreated(currentWorkspaceId, [node.id]);
    }
  };
  type NodeCreateBody = NonNullable<CreateNodeData['body']>;
  type NodeEditBody = NonNullable<EditNodeData['body']>;
  type NodePreviewBody = NonNullable<PreviewNodeCreationData['body']>;
  type FilterNodeCreateBody = Extract<NodeCreateBody, { kind: 'filter' }>;
  type SliceNodeCreateBody = Extract<NodeCreateBody, { kind: 'slice' }>;
  type ExpressionNodeCreateBody = Extract<NodeCreateBody, { kind: 'expression' }>;
  type ExpressionNodeEditBody = Extract<NodeEditBody, { kind: 'expression' }>;
  type CastNodeEditBody = Extract<NodeEditBody, { kind: 'cast' }>;

  const filterBody = (nodeId: string, request: FilterRequestPayload): FilterNodeCreateBody => ({
    kind: 'filter',
    source_node_id: nodeId,
    conditions: request.conditions,
    logic: request.logic ?? 'and',
    name: request.name,
  });
  const sliceBody = (nodeId: string, request: SliceRequestPayload): SliceNodeCreateBody => ({
    kind: 'slice',
    source_node_id: nodeId,
    ...request,
  });
  const expressionBody = (
    nodeId: string,
    request: PolarsExpressionRequest,
  ): ExpressionNodeCreateBody => ({
    kind: 'expression',
    source_node_id: nodeId,
    context: request.context,
    expressions: request.expressions,
    group_by: request.group_by,
    name: request.name,
  });
  // Data Block Edits never change rows, so in-place expressions may only add
  // or change columns; the backend rejects any other context.
  const expressionEditBody = (request: PolarsExpressionRequest): ExpressionNodeEditBody => {
    if (request.context !== 'with_columns') {
      throw new Error('Only column expressions can update a Data Block in place.');
    }
    return {
      kind: 'expression',
      context: request.context,
      expressions: request.expressions,
      group_by: request.group_by,
    };
  };
  const castEditBody = (
    column: string,
    targetType: ColumnCastType,
    format?: string,
  ): CastNodeEditBody => ({
    kind: 'cast',
    column,
    target_type: targetType,
    datetime_format: format,
  });

  const invalidateEditedNode = (nodeId: string) => {
    invalidateNodeWorkspaceQueries(queryClient, currentWorkspaceId, nodeId, {
      includeData: true,
      includeSchema: true,
    });
  };

  // Filtering changes rows, so it always creates a derived Data Block.
  const filterNodeMutation = useMutation({
    mutationKey: ['workspace', 'filter-node'],
    mutationFn: ({ nodeId, request }: { nodeId: string; request: FilterRequestPayload }) =>
      createNode({
        body: filterBody(nodeId, request),
        path: { workspace_id: ensureWorkspaceSelected() },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (response) => {
      markCreatedNode(response);
      invalidateWorkspaceGraphQuery(queryClient, currentWorkspaceId);
    },
  });

  const sliceNodeMutation = useMutation({
    mutationKey: ['workspace', 'slice-node'],
    mutationFn: ({ nodeId, request }: { nodeId: string; request: SliceRequestPayload }) =>
      createNode({
        body: sliceBody(nodeId, request),
        path: { workspace_id: ensureWorkspaceSelected() },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (createdNode) => {
      markCreatedNode(createdNode);
      invalidateWorkspaceGraphQuery(queryClient, currentWorkspaceId);
    },
  });

  const castNodeMutation = useMutation({
    mutationKey: ['workspace', 'cast-node'],
    mutationFn: ({
      nodeId,
      column,
      targetType,
      format,
    }: {
      nodeId: string;
      column: string;
      targetType: ColumnCastType;
      format?: string;
    }) =>
      editNode({
        body: castEditBody(column, targetType, format),
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_data, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const renameColumnMutation = useMutation({
    mutationKey: ['workspace', 'rename-column'],
    mutationFn: ({
      nodeId,
      column,
      newName,
    }: {
      nodeId: string;
      column: string;
      newName: string;
    }) =>
      editNode({
        body: { kind: 'rename_column', column, new_name: newName },
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const deleteColumnMutation = useMutation({
    mutationKey: ['workspace', 'delete-column'],
    mutationFn: ({ nodeId, column }: { nodeId: string; column: string }) =>
      editNode({
        body: { kind: 'delete_column', column },
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const applyEditMutation = useMutation({
    mutationKey: ['workspace', 'apply-edit'],
    mutationFn: ({ nodeId, body }: { nodeId: string; body: EditNodeData['body'] }) =>
      editNode({
        body,
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const deleteColumnsMutation = useMutation({
    mutationKey: ['workspace', 'delete-columns'],
    mutationFn: ({ nodeId, columns }: { nodeId: string; columns: string[] }) =>
      editNode({
        body: { kind: 'delete_columns', columns },
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const expressionMutation = useMutation({
    mutationKey: ['workspace', 'expression'],
    mutationFn: ({
      nodeId,
      request,
      mode,
    }: {
      nodeId: string;
      request: PolarsExpressionRequest;
      mode: PreprocessingApplyMode;
    }) =>
      (mode === 'update'
        ? editNode({
            body: expressionEditBody(request),
            path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
            throwOnError: true,
          })
        : createNode({
            body: expressionBody(nodeId, request),
            path: { workspace_id: ensureWorkspaceSelected() },
            throwOnError: true,
          })
      ).then(({ data }) => requireNode(data)),
    onSuccess: (response, variables) => {
      if (variables.mode === 'update') {
        invalidateEditedNode(variables.nodeId);
      } else {
        markCreatedNode(response);
        invalidateWorkspaceGraphQuery(queryClient, currentWorkspaceId);
      }
    },
  });

  const undoNodeMutation = useMutation({
    mutationKey: ['workspace', 'undo-node'],
    mutationFn: (nodeId: string) =>
      undoNode({
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, nodeId) => {
      invalidateEditedNode(nodeId);
    },
  });

  const redoNodeMutation = useMutation({
    mutationKey: ['workspace', 'redo-node'],
    mutationFn: (nodeId: string) =>
      redoNode({
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, nodeId) => {
      invalidateEditedNode(nodeId);
    },
  });

  const setCellMutation = useMutation({
    mutationKey: ['workspace', 'set-cell'],
    mutationFn: ({
      nodeId,
      column,
      rowIndex,
      value,
    }: {
      nodeId: string;
      column: string;
      rowIndex: number;
      value: string | null;
    }) =>
      editNode({
        body: { kind: 'set_cell', column, row_index: rowIndex, value },
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const annotationClassesMutation = useMutation({
    mutationKey: ['workspace', 'annotation-classes'],
    mutationFn: ({
      nodeId,
      classColumn,
      descriptionColumn,
      rows,
    }: {
      nodeId: string;
      classColumn: string;
      descriptionColumn: string;
      rows: AnnotationClassRow[];
    }) =>
      editNode({
        body: {
          kind: 'annotation_classes',
          class_column: classColumn,
          description_column: descriptionColumn,
          rows,
        },
        path: { workspace_id: ensureWorkspaceSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const createSqlDataBlockMutation = useMutation({
    mutationKey: ['workspace', 'create-sql-data-block'],
    mutationFn: ({ nodeIds, sql, name }: { nodeIds: string[]; sql: string; name: string }) =>
      createWorkspaceSqlDataBlock({
        path: { workspace_id: ensureWorkspaceSelected() },
        body: { mode: 'create', node_ids: nodeIds, sql, name },
      }),
    onSuccess: (createdNode) => {
      markCreatedNode(createdNode);
      invalidateWorkspaceGraphQuery(queryClient, currentWorkspaceId);
    },
  });

  const actions = useMemo(
    () => ({
      filterNode: (nodeId: string, request: FilterRequestPayload) =>
        filterNodeMutation.mutateAsync({ nodeId, request }),
      filterPreview: ({
        workspaceId,
        nodeId,
        payload,
        page,
        pageSize,
        signal,
      }: WorkspaceOperationPreviewRequest<FilterRequestPayload>) =>
        previewNodeCreationTable({
          body: filterBody(nodeId, payload) satisfies NodePreviewBody,
          path: { workspace_id: workspaceId },
          query: { page, page_size: pageSize },
          signal,
        }).then((result) => toPreviewResponse(result, page, pageSize)),
      sliceNode: (nodeId: string, request: SliceRequestPayload) =>
        sliceNodeMutation.mutateAsync({ nodeId, request }),
      slicePreview: ({
        workspaceId,
        nodeId,
        payload,
        page,
        pageSize,
        signal,
      }: WorkspaceOperationPreviewRequest<SliceRequestPayload>) =>
        previewNodeCreationTable({
          body: sliceBody(nodeId, payload) satisfies NodePreviewBody,
          path: { workspace_id: workspaceId },
          query: { page, page_size: pageSize },
          signal,
        }).then((result) => toPreviewResponse(result, page, pageSize)),
      polarsExpressionApply: (
        nodeId: string,
        request: PolarsExpressionRequest,
        mode: PreprocessingApplyMode = 'create',
      ) => expressionMutation.mutateAsync({ nodeId, request, mode }),
      castColumn: (nodeId: string, column: string, targetType: ColumnCastType, format?: string) =>
        castNodeMutation.mutateAsync({ nodeId, column, targetType, format }),
      renameColumn: (nodeId: string, column: string, newName: string) =>
        renameColumnMutation.mutateAsync({ nodeId, column, newName }),
      deleteColumn: (nodeId: string, column: string) =>
        deleteColumnMutation.mutateAsync({ nodeId, column }),
      /** Applies one Data Editor tool's edit (issue 143). */
      applyEdit: (nodeId: string, body: EditNodeData['body']) =>
        applyEditMutation.mutateAsync({ nodeId, body }),
      /** One edit, so a single Undo restores every column (issue 141). */
      deleteColumns: (nodeId: string, columns: string[]) =>
        deleteColumnsMutation.mutateAsync({ nodeId, columns }),
      undoNode: (nodeId: string) => undoNodeMutation.mutateAsync(nodeId),
      redoNode: (nodeId: string) => redoNodeMutation.mutateAsync(nodeId),
      setCell: (nodeId: string, column: string, rowIndex: number, value: string | null) =>
        setCellMutation.mutateAsync({ nodeId, column, rowIndex, value }),
      saveAnnotationClasses: (
        nodeId: string,
        classColumn: string,
        descriptionColumn: string,
        rows: AnnotationClassRow[],
      ) =>
        annotationClassesMutation.mutateAsync({
          nodeId,
          classColumn,
          descriptionColumn,
          rows,
        }),
      createSqlDataBlock: (nodeIds: string[], sql: string, name: string) =>
        createSqlDataBlockMutation.mutateAsync({ nodeIds, sql, name }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation refs intentionally omitted; mutateAsync identities are stable
    [currentWorkspaceId, queryClient],
  );

  return { actions } as const;
};
