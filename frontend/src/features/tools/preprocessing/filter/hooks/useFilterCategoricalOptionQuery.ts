import { objectDependencies } from '@/features/project/projectChanges';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { DataType } from 'apache-arrow';

import { identifier as sqlIdentifier } from '@/features/project/api';
import { literal as sqlString, table as sqlTable } from '../../sql';
import { previewSql } from '../../projectPreprocessing';
import {
  arrowTypeName,
  isArrowDictionaryField,
  isArrowStringListField,
} from '@/lib/arrow/decodeArrowTable';
import { isTopicCoverageField } from '@/lib/arrow/semanticTypes';
import type { ConditionColumnOption } from '../../types';
import {
  buildCategoricalOptionEntries,
  type CategoricalOptionEntry,
  getCategoricalOptionKey,
  toCategoricalPrimitive,
} from '../utils/categoricalOptions';

const CATEGORICAL_PAGE_SIZE = 500;

const mergeOptions = (
  current: CategoricalOptionEntry[],
  incoming: CategoricalOptionEntry[],
): CategoricalOptionEntry[] => {
  const merged = new Map(current.map((option) => [option.key, option]));
  incoming.forEach((option) => {
    merged.set(option.key, option);
  });
  return Array.from(merged.values());
};

const topicIds = (column: ConditionColumnOption | undefined): number[] => {
  const type = column?.field.type;
  if (!type || !DataType.isFixedSizeList(type)) return [];
  return Array.from({ length: type.listSize }, (_value, index) => index - 1);
};

const optionSql = (
  nodeId: string,
  column: string,
  unwrapList: boolean,
  searchQuery: string,
): string => {
  const value = sqlIdentifier('value');
  const count = sqlIdentifier('count');
  const source = unwrapList
    ? `SELECT UNNEST(${sqlIdentifier(column)}) AS ${value} FROM ${sqlTable(nodeId)}`
    : `SELECT ${sqlIdentifier(column)} AS ${value} FROM ${sqlTable(nodeId)}`;
  const trimmedSearch = searchQuery.trim();
  const where = trimmedSearch
    ? ` WHERE contains(lower(CAST(${value} AS VARCHAR)), lower(${sqlString(trimmedSearch)}))`
    : '';
  return `SELECT ${value}, COUNT(*) AS ${count} FROM (${source}) AS ${sqlIdentifier(
    'values',
  )}${where} GROUP BY ${value} ORDER BY ${value} ASC NULLS FIRST`;
};

const categoricalCount = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
};

interface UseFilterCategoricalOptionQueryArgs {
  projectBase: string | null;
  nodeId: string | null;
  column: string;
  searchQuery: string;
  columnOption?: ConditionColumnOption;
}

/** Owns one condition's paginated categorical values as an immutable Query resource. */
export function useFilterCategoricalOptionQuery({
  projectBase,
  nodeId,
  column,
  searchQuery,
  columnOption,
}: UseFilterCategoricalOptionQueryArgs) {
  const field = columnOption?.field;
  const identity = JSON.stringify([
    projectBase,
    nodeId,
    column,
    field ? arrowTypeName(field) : null,
  ]);
  const [debouncedState, setDebouncedState] = useState({ identity, value: searchQuery });
  const debouncedSearch = debouncedState.identity === identity ? debouncedState.value : '';

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedState({ identity, value: searchQuery });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [identity, searchQuery]);

  const isTopicCoverage = isTopicCoverageField(field);
  const isDictionary = field !== undefined && isArrowDictionaryField(field);
  const isStringList = field !== undefined && isArrowStringListField(field);
  const canQuery =
    Boolean(projectBase !== null && nodeId && column) && (isDictionary || isStringList);
  const sql = nodeId && column ? optionSql(nodeId, column, isStringList, debouncedSearch) : '';
  const queryKey = ['native', projectBase, 'preprocessing-options', nodeId, sql];
  const query = useInfiniteQuery({
    queryKey,
    enabled: canQuery,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      if (projectBase === null || !nodeId) throw new Error('Missing categorical query identity');
      const response = await previewSql(projectBase, sql, pageParam, CATEGORICAL_PAGE_SIZE, signal);
      return { rows: response.data, hasNext: response.pagination.has_next, page: pageParam };
    },
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.page + 1 : undefined),
    retry: false,
    maxPages: 4,
    gcTime: 0,
    meta: { ...objectDependencies(nodeId ?? ''), errorToastId: 'preprocessing-options' },
  });

  const pages = query.data?.pages ?? [];
  const topicOptions = isTopicCoverage
    ? buildCategoricalOptionEntries(topicIds(columnOption), false)
    : [];
  const pageOptions = pages.map((page) => {
    const rawValues = page.rows.map((row) => row.value);
    const countsByKey = new Map(
      page.rows.flatMap((row) => {
        const count = categoricalCount(row.count);
        return count === undefined
          ? []
          : [[getCategoricalOptionKey(toCategoricalPrimitive(row.value)), count] as const];
      }),
    );
    const hasNull =
      isDictionary &&
      debouncedSearch.trim().length === 0 &&
      rawValues.some((value) => value === null);
    return buildCategoricalOptionEntries(rawValues, hasNull).map((option) => ({
      ...option,
      count: countsByKey.get(option.key),
    }));
  });
  const options = isTopicCoverage
    ? topicOptions
    : pageOptions.reduce<CategoricalOptionEntry[]>(mergeOptions, []);

  return {
    options,
    loading: query.isLoading || query.isFetchingNextPage,
    error: query.error instanceof Error ? query.error.message : null,
    hasNext: query.hasNextPage,
    loadMore: () => query.fetchNextPage().then(() => undefined),
    retry: () => query.refetch().then(() => undefined),
  };
}
