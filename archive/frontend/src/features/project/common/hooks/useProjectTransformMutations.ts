import { useMemo } from 'react';
import { type QueryClient, useMutation } from '@tanstack/react-query';
import {
  createNode,
  createProjectSqlDataBlock,
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
import type { FilterConditionInput } from '@/api';
interface FilterRequestPayload {
  conditions: FilterConditionInput[];
  logic?: 'and' | 'or';
  name?: string;
}
import type { SliceRequestPayload } from '@/features/views/preprocessing/slice/hooks/sliceFormModel';
import type { ReplaceRequest } from '@/features/views/preprocessing/replace/hooks/replaceRequestModel';
import type { PreprocessingApplyMode } from '@/features/views/preprocessing/preprocessingApplyMode';
import type { ColumnCastType } from '@/features/project/data-view/services/schemaMutations';
import { useFreshNodesStore } from '@/stores/freshNodesStore';
import {
  invalidateNodeProjectQueries,
  invalidateProjectGraphQuery,
} from './projectMutationCache';

interface ProjectTransformMutationsParams {
  currentProjectId: string | null;
  queryClient: QueryClient;
}

/** Complete identity and transport context for one cancellable preprocessing preview. */
interface ProjectOperationPreviewRequest<RequestPayload> {
  projectId: string;
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
 * Owns preprocessing and column-edit actions exposed through ServerProjectProvider.
 * Used by: useProjectNodeMutations because filter/slice/replace/expression
 * and column mutations share node-cache invalidation, but do not need to live
 * beside project selection or graph-combine mutations.
 * Flow: build mutation-backed apply actions, keep preview calls side-effect
 * free, invalidate graph/data/schema caches after writes, and return a stable
 * action object for preprocessing and table consumers.
 */
export const useProjectTransformMutations = ({
  currentProjectId,
  queryClient,
}: ProjectTransformMutationsParams) => {
  const requireNode = <T>(value: T | undefined): T => {
    if (value === undefined) throw new Error('Node operation returned no resource');
    return value;
  };
  const ensureProjectSelected = () => {
    if (!currentProjectId) {
      throw new Error('No project selected');
    }
    return currentProjectId;
  };
  const markCreatedNode = (node: { id: string }) => {
    if (currentProjectId) {
      useFreshNodesStore.getState().markCreated(currentProjectId, [node.id]);
    }
  };
  type NodeCreateBody = NonNullable<CreateNodeData['body']>;
  type NodeEditBody = NonNullable<EditNodeData['body']>;
  type NodePreviewBody = NonNullable<PreviewNodeCreationData['body']>;
  type FilterNodeCreateBody = Extract<NodeCreateBody, { kind: 'filter' }>;
  type SliceNodeCreateBody = Extract<NodeCreateBody, { kind: 'slice' }>;
  type ReplaceNodeCreateBody = Extract<NodeCreateBody, { kind: 'replace' }>;
  type ExpressionNodeCreateBody = Extract<NodeCreateBody, { kind: 'expression' }>;
  type FilterNodeEditBody = Extract<NodeEditBody, { kind: 'filter' }>;
  type ReplaceNodeEditBody = Extract<NodeEditBody, { kind: 'replace' }>;
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
  const replaceBody = (nodeId: string, request: ReplaceRequest): ReplaceNodeCreateBody => ({
    kind: 'replace',
    source_node_id: nodeId,
    source_column: request.source_column,
    pattern: request.pattern,
    replacement: request.replacement,
    output_column: request.output_column,
    mode: request.mode,
    count: request.count,
    match_limit: request.match_limit,
    connector: request.connector,
    name: request.name,
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
  const filterEditBody = (request: FilterRequestPayload): FilterNodeEditBody => ({
    kind: 'filter',
    conditions: request.conditions,
    logic: request.logic ?? 'and',
  });
  const replaceEditBody = (request: ReplaceRequest): ReplaceNodeEditBody => ({
    kind: 'replace',
    source_column: request.source_column,
    pattern: request.pattern,
    replacement: request.replacement,
    output_column: request.output_column,
    mode: request.mode,
    count: request.count,
    match_limit: request.match_limit,
    connector: request.connector,
  });
  const expressionEditBody = (request: PolarsExpressionRequest): ExpressionNodeEditBody => ({
    kind: 'expression',
    context: request.context,
    expressions: request.expressions,
    group_by: request.group_by,
  });
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
    invalidateNodeProjectQueries(queryClient, currentProjectId, nodeId, {
      includeData: true,
      includeSchema: true,
    });
  };

  const filterNodeMutation = useMutation({
    mutationKey: ['project', 'filter-node'],
    mutationFn: ({
      nodeId,
      request,
      mode,
    }: {
      nodeId: string;
      request: FilterRequestPayload;
      mode: PreprocessingApplyMode;
    }) =>
      (mode === 'update'
        ? editNode({
            body: filterEditBody(request),
            path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
            throwOnError: true,
          })
        : createNode({
            body: filterBody(nodeId, request),
            path: { workspace_id: ensureProjectSelected() },
            throwOnError: true,
          })
      ).then(({ data }) => requireNode(data)),
    onSuccess: (response, variables) => {
      if (variables.mode === 'update') {
        invalidateEditedNode(variables.nodeId);
      } else {
        markCreatedNode(response);
        invalidateProjectGraphQuery(queryClient, currentProjectId);
      }
    },
  });

  const replaceTextMutation = useMutation({
    mutationKey: ['project', 'replace-text'],
    mutationFn: ({
      nodeId,
      request,
      mode,
    }: {
      nodeId: string;
      request: ReplaceRequest;
      mode: PreprocessingApplyMode;
    }) =>
      (mode === 'update'
        ? editNode({
            body: replaceEditBody(request),
            path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
            throwOnError: true,
          })
        : createNode({
            body: replaceBody(nodeId, request),
            path: { workspace_id: ensureProjectSelected() },
            throwOnError: true,
          })
      ).then(({ data }) => requireNode(data)),
    onSuccess: (response, variables) => {
      if (variables.mode === 'update') {
        invalidateEditedNode(variables.nodeId);
      } else {
        markCreatedNode(response);
        invalidateProjectGraphQuery(queryClient, currentProjectId);
      }
    },
  });

  const sliceNodeMutation = useMutation({
    mutationKey: ['project', 'slice-node'],
    mutationFn: ({ nodeId, request }: { nodeId: string; request: SliceRequestPayload }) =>
      createNode({
        body: sliceBody(nodeId, request),
        path: { workspace_id: ensureProjectSelected() },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (createdNode) => {
      markCreatedNode(createdNode);
      invalidateProjectGraphQuery(queryClient, currentProjectId);
    },
  });

  const castNodeMutation = useMutation({
    mutationKey: ['project', 'cast-node'],
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
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_data, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const renameColumnMutation = useMutation({
    mutationKey: ['project', 'rename-column'],
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
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const deleteColumnMutation = useMutation({
    mutationKey: ['project', 'delete-column'],
    mutationFn: ({ nodeId, column }: { nodeId: string; column: string }) =>
      editNode({
        body: { kind: 'delete_column', column },
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const expressionMutation = useMutation({
    mutationKey: ['project', 'expression'],
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
            path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
            throwOnError: true,
          })
        : createNode({
            body: expressionBody(nodeId, request),
            path: { workspace_id: ensureProjectSelected() },
            throwOnError: true,
          })
      ).then(({ data }) => requireNode(data)),
    onSuccess: (response, variables) => {
      if (variables.mode === 'update') {
        invalidateEditedNode(variables.nodeId);
      } else {
        markCreatedNode(response);
        invalidateProjectGraphQuery(queryClient, currentProjectId);
      }
    },
  });

  const undoNodeMutation = useMutation({
    mutationKey: ['project', 'undo-node'],
    mutationFn: (nodeId: string) =>
      undoNode({
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, nodeId) => {
      invalidateEditedNode(nodeId);
    },
  });

  const redoNodeMutation = useMutation({
    mutationKey: ['project', 'redo-node'],
    mutationFn: (nodeId: string) =>
      redoNode({
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, nodeId) => {
      invalidateEditedNode(nodeId);
    },
  });

  const setCellMutation = useMutation({
    mutationKey: ['project', 'set-cell'],
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
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const annotationClassesMutation = useMutation({
    mutationKey: ['project', 'annotation-classes'],
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
        path: { workspace_id: ensureProjectSelected(), node_id: nodeId },
        throwOnError: true,
      }).then(({ data }) => requireNode(data)),
    onSuccess: (_response, variables) => {
      invalidateEditedNode(variables.nodeId);
    },
  });

  const createSqlDataBlockMutation = useMutation({
    mutationKey: ['project', 'create-sql-data-block'],
    mutationFn: ({ nodeIds, sql, name }: { nodeIds: string[]; sql: string; name: string }) =>
      createProjectSqlDataBlock({
        path: { workspace_id: ensureProjectSelected() },
        body: { mode: 'create', node_ids: nodeIds, sql, name },
      }),
    onSuccess: (createdNode) => {
      markCreatedNode(createdNode);
      invalidateProjectGraphQuery(queryClient, currentProjectId);
    },
  });

  const actions = useMemo(
    () => ({
      filterNode: (
        nodeId: string,
        request: FilterRequestPayload,
        mode: PreprocessingApplyMode = 'create',
      ) => filterNodeMutation.mutateAsync({ nodeId, request, mode }),
      filterPreview: ({
        projectId,
        nodeId,
        payload,
        page,
        pageSize,
        signal,
      }: ProjectOperationPreviewRequest<FilterRequestPayload>) =>
        previewNodeCreationTable({
          body: filterBody(nodeId, payload) satisfies NodePreviewBody,
          path: { workspace_id: projectId },
          query: { page, page_size: pageSize },
          signal,
        }).then((result) => toPreviewResponse(result, page, pageSize)),
      sliceNode: (nodeId: string, request: SliceRequestPayload) =>
        sliceNodeMutation.mutateAsync({ nodeId, request }),
      slicePreview: ({
        projectId,
        nodeId,
        payload,
        page,
        pageSize,
        signal,
      }: ProjectOperationPreviewRequest<SliceRequestPayload>) =>
        previewNodeCreationTable({
          body: sliceBody(nodeId, payload) satisfies NodePreviewBody,
          path: { workspace_id: projectId },
          query: { page, page_size: pageSize },
          signal,
        }).then((result) => toPreviewResponse(result, page, pageSize)),
      replaceText: (
        nodeId: string,
        request: ReplaceRequest,
        mode: PreprocessingApplyMode = 'create',
      ) => replaceTextMutation.mutateAsync({ nodeId, request, mode }),
      replaceTextPreview: ({
        projectId,
        nodeId,
        payload,
        page,
        pageSize,
        signal,
      }: ProjectOperationPreviewRequest<ReplaceRequest>) =>
        previewNodeCreationTable({
          body: replaceBody(nodeId, payload) satisfies NodePreviewBody,
          path: { workspace_id: projectId },
          query: { page, page_size: pageSize },
          signal,
        }).then((result) => toPreviewResponse(result, page, pageSize)),
      polarsExpressionPreview: ({
        projectId,
        nodeId,
        payload,
        page,
        pageSize,
        signal,
      }: ProjectOperationPreviewRequest<PolarsExpressionRequest>) =>
        previewNodeCreationTable({
          body: expressionBody(nodeId, payload) satisfies NodePreviewBody,
          path: { workspace_id: projectId },
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
    [currentProjectId, queryClient],
  );

  return { actions } as const;
};
