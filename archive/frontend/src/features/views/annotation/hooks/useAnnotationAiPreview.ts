import { useQuery } from '@tanstack/react-query';
import type { PaginationState } from '@tanstack/react-table';
import { useState } from 'react';

import {
  queryProjectSqlTable,
  sqlTable,
  type AnnotationQueriedResult,
  type AnnotationPreviewLabel,
} from '@/api';
import { queryAnnotationPreviewWithProviderCredential } from '@/features/provider-credentials/providerCredentialRequests';
import { queryKeys } from '@/lib/queryKeys';
import { isArrowDictionaryField, isArrowStringField } from '@/lib/arrow/decodeArrowTable';

const AI_PREVIEW_PAGE_SIZE = 10;
export type AnnotationPreviewRow = Record<string, unknown>;

interface UseAnnotationAiPreviewArgs {
  projectId: string | null;
  analysisId: string | null;
  providerConfigurationId: string | null;
  nodeId: string;
  textColumn: string;
  annotationColumn: string;
  enabled: boolean;
}

/**
 * Projects fresh pages from one durable Annotation Preview Analysis.
 *
 * The root Analysis owns the immutable source and settings. Every page
 * navigation posts a new Result query and no prediction page is retained as
 * durable Analysis output.
 */
export function useAnnotationAiPreview({
  projectId,
  analysisId,
  providerConfigurationId,
  nodeId,
  textColumn,
  annotationColumn,
  enabled,
}: UseAnnotationAiPreviewArgs) {
  const scope = JSON.stringify([projectId, analysisId, AI_PREVIEW_PAGE_SIZE]);
  const [paginationState, setPaginationState] = useState<{
    scope: string;
    value: PaginationState;
  }>(() => ({
    scope,
    value: { pageIndex: 0, pageSize: AI_PREVIEW_PAGE_SIZE },
  }));
  const pagination =
    paginationState.scope === scope
      ? paginationState.value
      : { pageIndex: 0, pageSize: AI_PREVIEW_PAGE_SIZE };
  const setPagination = (value: PaginationState) => {
    setPaginationState({ scope, value });
  };
  const projection = {
    kind: 'annotation',
    page: pagination.pageIndex + 1,
    page_size: pagination.pageSize,
    provider_configuration_id: providerConfigurationId,
  } as const;
  const query = useQuery({
    queryKey:
      projectId && analysisId
        ? queryKeys.analysisResult(projectId, analysisId, projection)
        : queryKeys.inactiveAnalysisResult(projection),
    enabled: enabled && Boolean(projectId && analysisId && providerConfigurationId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }): Promise<AnnotationQueriedResult> => {
      if (!projectId || !analysisId || !projection.provider_configuration_id) {
        throw new Error('Annotation Preview is not available');
      }
      const { data } = await queryAnnotationPreviewWithProviderCredential({
        projectId,
        analysisId,
        providerConfigurationId: projection.provider_configuration_id,
        page: projection.page,
        pageSize: projection.page_size,
        signal,
      });
      if (data.kind !== 'annotation' || data.result.variant !== 'queried') {
        throw new Error('Annotation Preview returned an invalid page');
      }
      return data.result;
    },
  });
  const sourcePageSql = `SELECT * FROM ${sqlTable(nodeId)}`;
  const sourcePageQuery = useQuery({
    queryKey: queryKeys.projectSql(
      projectId ?? '',
      [nodeId],
      sourcePageSql,
      projection.page,
      projection.page_size,
    ),
    enabled: enabled && Boolean(projectId && nodeId),
    queryFn: async ({ signal }) => {
      if (!projectId) {
        throw new Error('Annotation source page is not available');
      }
      return await queryProjectSqlTable({
        path: { workspace_id: projectId },
        body: {
          mode: 'query',
          node_ids: [nodeId],
          sql: sourcePageSql,
          page: projection.page,
          page_size: projection.page_size,
        },
        signal,
      });
    },
  });
  const previewRows = (query.data?.rows ?? []) as AnnotationPreviewRow[];
  const sourceRows = (sourcePageQuery.data?.rows ?? []) as AnnotationPreviewRow[];
  const rows = previewRows.map((row, index) => ({ ...sourceRows[index], ...row }));
  const byIndex = new Map<number, string | null>();
  (query.data?.labels ?? []).forEach((label: AnnotationPreviewLabel) => {
    byIndex.set(label.row_index, label.label);
  });
  const start = pagination.pageIndex * pagination.pageSize;

  return {
    columns: { text: textColumn, annotation: annotationColumn },
    sourceColumns: sourcePageQuery.data?.columns ?? [],
    sourceStringColumns:
      sourcePageQuery.data?.schema
        .filter((column) => isArrowStringField(column.field))
        .map((column) => column.name) ?? null,
    sourceComparableColumns:
      sourcePageQuery.data?.schema
        .filter(
          (column) => isArrowStringField(column.field) || isArrowDictionaryField(column.field),
        )
        .map((column) => column.name) ?? [],
    page: {
      rows,
      // Keep the selected page represented in the footer while its fresh
      // projection is pending without retaining rows from the prior page.
      rowCount:
        query.data?.total_rows ??
        (query.isLoading ? (pagination.pageIndex + 1) * pagination.pageSize : 0),
      pagination,
      setPagination,
      query,
    },
    predictions: {
      labels: rows.map((_, index) => byIndex.get(start + index) ?? null),
      query,
    },
    comparison: {
      query: sourcePageQuery,
    },
  };
}

export type AnnotationAiPreview = ReturnType<typeof useAnnotationAiPreview>;
