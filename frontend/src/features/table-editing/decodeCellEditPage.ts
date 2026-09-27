import type { AnnotationReviewSummary } from '@/features/project/api';
import { DataType, tableFromIPC, type Field } from 'apache-arrow';
import { normalizeArrowValue } from '@/lib/arrow/decodeArrowTable';

/** Transport fields are indexed by schema metadata and never enter the visible table schema. */
export function decodeCellEditPage(buffer: ArrayBuffer, pageSize: number) {
  const table = tableFromIPC(buffer);
  const raw = table.schema.metadata.get('wordflow:cell-edit');
  if (!raw) throw new Error('Editing page is missing its row references');
  const metadata = JSON.parse(raw) as {
    row_ref: number;
    values: Record<string, number>;
    column_count: number;
  };
  const schema = table.schema.fields
    .slice(0, metadata.column_count)
    .map((field: Field<DataType>) => ({ name: field.name, field }));
  const rowRefs = table.getChildAt(metadata.row_ref);
  if (!rowRefs) throw new Error('Editing page is missing its row references');
  const length = Math.min(table.numRows, pageSize);
  const columns = schema.map((s) => s.name);
  const editableValues = Array.from(
    { length },
    (_, row) =>
      Object.fromEntries(
        Object.entries(metadata.values).map(([name, index]) => {
          const value: unknown = table.getChildAt(index)?.get(row);
          if (value !== null && typeof value !== 'string') throw new Error('Invalid editing value');
          return [name, value];
        }),
      ) as Record<string, string | null>,
  );
  const options = Object.create(null) as Record<string, string[]>;
  schema.forEach(({ name, field }, index) => {
    const vector = table.getChildAt(index);
    if (DataType.isDictionary(field.type) && vector) {
      const dictionary = vector.data[0]?.dictionary;
      if (dictionary) options[name] = Array.from(dictionary, (value: unknown) => String(value));
    }
  });
  const review = table.schema.metadata.get('wordflow:annotation-review');
  return {
    review: review ? (JSON.parse(review) as AnnotationReviewSummary) : undefined,
    schema,
    columns,
    editableValues,
    options,
    rowRefs: Array.from({ length }, (_, row) => String(rowRefs.get(row))),
    rows: Array.from({ length }, (_, rowIndex) =>
      Object.fromEntries(
        schema.map(({ name, field }, columnIndex) => [
          name,
          Object.hasOwn(editableValues[rowIndex] ?? {}, name)
            ? editableValues[rowIndex]?.[name]
            : normalizeArrowValue(table.getChildAt(columnIndex)?.get(rowIndex), field.type),
        ]),
      ),
    ),
    hasNext: table.numRows > pageSize,
  };
}
