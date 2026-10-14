import { identifier, objectSql, type DataTarget } from '@/features/project/objects';
import { DataType } from 'apache-arrow';
import { isArrowStringField, type ArrowColumn } from '@/lib/arrow/decodeArrowTable';

export function columnExamplesSql(target: DataTarget, columns: readonly ArrowColumn[]) {
  return `SELECT ${columns
    .map(({ name, field }) => {
      const source = identifier(name);
      const present =
        isArrowStringField(field) || DataType.isDictionary(field.type)
          ? `regexp_matches(CAST(${source} AS VARCHAR), '[^\\p{Z}\\p{Cc}\\p{Cf}]')`
          : DataType.isFloat(field.type)
            ? `NOT isnan(${source})`
            : 'TRUE';
      return `left(CAST(first(${source}) FILTER (WHERE ${source} IS NOT NULL AND ${present}) AS VARCHAR), 200) AS ${source}`;
    })
    .join(', ')} FROM ${objectSql(target)}`;
}

export function corpusOverviewSql(target: DataTarget, column: string, columnCount: number) {
  const text = `CAST(${identifier(column)} AS VARCHAR)`;
  return `SELECT count(*) AS rows, ${columnCount} AS columns, count(*) FILTER (WHERE ${text} IS NULL OR NOT regexp_matches(${text}, '[^\\p{Z}\\p{Cc}\\p{Cf}]')) AS empty_documents, count(${text}) - count(DISTINCT ${text}) AS duplicate_documents, coalesce(sum(length(${text})), 0) AS characters, min(length(${text})) AS minimum_length, median(length(${text})) AS median_length, avg(length(${text})) AS mean_length, max(length(${text})) AS maximum_length FROM ${objectSql(target)}`;
}
