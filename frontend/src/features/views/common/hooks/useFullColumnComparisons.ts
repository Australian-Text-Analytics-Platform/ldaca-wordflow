import { useQueries, useQuery } from '@tanstack/react-query';
import { queryWorkspaceSqlTable, sqlIdentifier } from '@/api';
import {
  annotationLabelSql,
  normalizeAnnotationClassOptions,
} from '@/features/views/annotation/annotationLabelModel';
import type {
  CodeCombination,
  ConfusionCount,
} from '@/features/views/common/columnComparisonModel';
import { queryKeys } from '@/lib/queryKeys';

const COMPARISON_PAGE_SIZE = 500;
const REFERENCE_ALIAS = '__reference';
const COMPARISON_ALIAS = '__comparison';
const COUNT_ALIAS = '__count';

const displayCell = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const numericCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const fullColumnComparisonSql = (
  sql: string,
  referenceColumn: string,
  comparisonColumn: string,
  classOptions: readonly string[],
): string => {
  const reference = annotationLabelSql(referenceColumn, classOptions);
  const comparison = annotationLabelSql(comparisonColumn, classOptions);
  const referenceAlias = sqlIdentifier(REFERENCE_ALIAS);
  const comparisonAlias = sqlIdentifier(COMPARISON_ALIAS);
  return `SELECT ${reference} AS ${referenceAlias}, ${comparison} AS ${comparisonAlias}, COUNT(*) AS ${sqlIdentifier(COUNT_ALIAS)} FROM (${sql}) AS ${sqlIdentifier('__annotation_comparison_source')} WHERE ${reference} IS NOT NULL AND ${comparison} IS NOT NULL GROUP BY ${referenceAlias}, ${comparisonAlias} ORDER BY ${referenceAlias} ASC, ${comparisonAlias} ASC`;
};

interface FullColumnComparisonArgs {
  workspaceId: string | null;
  nodeIds: string[];
  sql: string;
  referenceColumn: string;
  comparisonColumns: string[];
  /** Codebook classes defining valid labels; empty, blank, and non-Codebook cells are excluded. */
  classOptions: readonly string[];
}

/** Loads complete grouped counts for one reference column and each selected target column. */
export function useFullColumnComparisons({
  workspaceId,
  nodeIds,
  sql,
  referenceColumn,
  comparisonColumns,
  classOptions,
}: FullColumnComparisonArgs) {
  const canonicalClassOptions = normalizeAnnotationClassOptions(classOptions);
  return useQueries({
    queries: comparisonColumns.map((comparisonColumn) => ({
      queryKey: queryKeys.annotationColumnComparison(
        workspaceId ?? '',
        nodeIds,
        sql,
        referenceColumn,
        comparisonColumn,
        canonicalClassOptions,
      ),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        if (!workspaceId) throw new Error('Missing Project ID');
        const aggregateSql = fullColumnComparisonSql(
          sql,
          referenceColumn,
          comparisonColumn,
          canonicalClassOptions,
        );
        const rows: ConfusionCount[] = [];
        let page = 1;
        let initialEtag: string | null | undefined;
        let hasNext: boolean;
        do {
          const aggregate = await queryWorkspaceSqlTable({
            path: { workspace_id: workspaceId },
            body: {
              mode: 'query',
              node_ids: nodeIds,
              sql: aggregateSql,
              page,
              page_size: COMPARISON_PAGE_SIZE,
            },
            signal,
          });
          initialEtag ??= aggregate.etag;
          if (initialEtag !== aggregate.etag) {
            throw new Error('Project changed while loading the annotation comparison');
          }
          rows.push(
            ...aggregate.rows.map((row) => ({
              reference: displayCell(row[REFERENCE_ALIAS]),
              comparison: displayCell(row[COMPARISON_ALIAS]),
              count: numericCount(row[COUNT_ALIAS]),
            })),
          );
          hasNext = aggregate.hasNext;
          page += 1;
        } while (hasNext);
        return rows;
      },
      enabled: Boolean(workspaceId),
      staleTime: 0,
      refetchOnMount: 'always' as const,
    })),
  });
}

const coderAlias = (index: number) => `__coder_${String(index)}`;

const codeCombinationsSql = (
  sql: string,
  columns: readonly string[],
  classOptions: readonly string[],
): string => {
  const labels = columns.map((column) => annotationLabelSql(column, classOptions));
  const aliases = columns.map((_, index) => sqlIdentifier(coderAlias(index)));
  const coded = labels.map((label) => `(CASE WHEN ${label} IS NULL THEN 0 ELSE 1 END)`).join(' + ');
  return `SELECT ${labels.map((label, index) => `${label} AS ${aliases[index] ?? ''}`).join(', ')}, COUNT(*) AS ${sqlIdentifier(COUNT_ALIAS)} FROM (${sql}) AS ${sqlIdentifier('__annotation_agreement_source')} WHERE ${coded} >= 2 GROUP BY ${aliases.join(', ')} ORDER BY ${aliases.join(', ')}`;
};

/**
 * The combinations of codes the given columns hold for the same rows, with
 * how many rows hold each, for the multi-coder Alpha (Chao, 16 Nov 2026).
 * Only rows where at least two columns hold a Codebook code are counted.
 */
export function useCodeCombinations({
  workspaceId,
  nodeIds,
  sql,
  columns,
  classOptions,
  enabled,
}: {
  workspaceId: string | null;
  nodeIds: string[];
  sql: string;
  columns: readonly string[];
  classOptions: readonly string[];
  enabled: boolean;
}) {
  const canonicalClassOptions = normalizeAnnotationClassOptions(classOptions);
  return useQuery({
    queryKey: queryKeys.annotationCoderAgreement(
      workspaceId ?? '',
      nodeIds,
      sql,
      columns,
      canonicalClassOptions,
    ),
    queryFn: async ({ signal }): Promise<CodeCombination[]> => {
      if (!workspaceId) throw new Error('Missing Project ID');
      const aggregateSql = codeCombinationsSql(sql, columns, canonicalClassOptions);
      const combinations: CodeCombination[] = [];
      let page = 1;
      let initialEtag: string | null | undefined;
      let hasNext: boolean;
      do {
        const aggregate = await queryWorkspaceSqlTable({
          path: { workspace_id: workspaceId },
          body: {
            mode: 'query',
            node_ids: nodeIds,
            sql: aggregateSql,
            page,
            page_size: COMPARISON_PAGE_SIZE,
          },
          signal,
        });
        initialEtag ??= aggregate.etag;
        if (initialEtag !== aggregate.etag) {
          throw new Error('Project changed while loading the annotation agreement');
        }
        combinations.push(
          ...aggregate.rows.map((row) => ({
            values: columns.map((_, index) => {
              const value = row[coderAlias(index)];
              return value == null ? null : displayCell(value);
            }),
            count: numericCount(row[COUNT_ALIAS]),
          })),
        );
        hasNext = aggregate.hasNext;
        page += 1;
      } while (hasNext);
      return combinations;
    },
    enabled: Boolean(workspaceId) && enabled && columns.length >= 3,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
