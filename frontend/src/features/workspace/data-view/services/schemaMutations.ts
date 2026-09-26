import { arrowTypeDisplayName, type ArrowColumn, type ArrowField } from '@/lib/arrow/arrowTable';

export const DATA_TYPES = [
  { value: 'string', label: 'text' },
  { value: 'categorical', label: 'categorical' },
  { value: 'integer', label: 'integer' },
  { value: 'float', label: 'decimal' },
  { value: 'datetime', label: 'datetime' },
  // A calendar date with no time of day (issue 187).
  { value: 'date', label: 'date' },
] as const;

export type ColumnCastType = (typeof DATA_TYPES)[number]['value'];

/** The user-facing name of a cast target, e.g. "decimal" for float (issue 178). */
export const castTypeLabel = (value: ColumnCastType): string =>
  DATA_TYPES.find((type) => type.value === value)?.label ?? value;

export const isColumnCastType = (value: string): value is ColumnCastType =>
  DATA_TYPES.some((type) => type.value === value);

/**
 * Indexes decoded Arrow schema fields for headers.
 * Used by useColumnMutations after schema refreshes to update cast controls.
 */
export const extractColumnFields = (
  schema: ArrowColumn[] | null | undefined,
): Record<string, ArrowField> =>
  Object.fromEntries((schema ?? []).map((column) => [column.name, column.field]));

/**
 * Displays a friendly label for canonical physical Arrow types while keeping
 * unknown types and extension identities exact.
 */
export const getTypeDisplayName = (field: ArrowField | undefined): string =>
  field ? arrowTypeDisplayName(field) : 'unknown';
