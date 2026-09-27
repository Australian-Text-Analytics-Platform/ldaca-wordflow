import * as api from '@/features/project/api';
import { decodeArrowData } from '@/lib/arrow/decodeArrowTable';
import { bindInput, findColumn, selectText } from './sql';
import type { ReplaceRequest } from './replace/hooks/replaceRequestModel';

import type { ColumnMapping } from '@/features/project/api';
export type { ColumnMapping } from '@/features/project/api';
export interface Transformation {
  select: string;
  /** Only columns known to be unchanged are candidates for metadata copying. */
  mappings: ColumnMapping[];
  computedColumns?: string[];
  currentInput?: string;
}
export const resultSelect = (operation: Transformation) =>
  operation.currentInput
    ? bindInput(operation.select, operation.currentInput)
    : selectText(operation.select);

export async function previewSql(
  base: string,
  select: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
) {
  const decoded = decodeArrowData(
    await api.querySql(
      base,
      [
        {
          sql: `SELECT * FROM (${selectText(select)}) LIMIT ? OFFSET ?`,
          parameters: [pageSize + 1, (page - 1) * pageSize],
        },
      ],
      signal,
    ),
  );
  return {
    ...decoded,
    data: decoded.rows.slice(0, pageSize),
    pagination: { page, page_size: pageSize, has_next: decoded.rows.length > pageSize },
  };
}

/** Create a live result and its metadata atomically; never overwrite an input. */
export function applyTransformation(base: string, operation: Transformation, outputName: string) {
  return api.createView(base, {
    name: outputName,
    sql: resultSelect(operation),
    mappings: operation.mappings,
    computed_columns: operation.computedColumns,
  });
}

/** Find changes one column in place, using the same expression as its preview. */
export async function applyFind(
  base: string,
  target: Pick<api.ProjectNode, 'table_name' | 'kind'>,
  request: ReplaceRequest,
  columns: readonly string[],
) {
  if (target.kind === 'missing') throw new Error('The selected Data Block is unavailable');
  const { column, expression } = findColumn(request, columns);
  await api.changeColumn(base, target.table_name, { operation: 'transform', column, expression });
  return { table_name: target.table_name };
}
