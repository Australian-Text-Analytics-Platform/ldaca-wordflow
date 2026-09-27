import { DataType } from 'apache-arrow';
import {
  arrowExtensionName,
  arrowTypeDisplayName,
  type ArrowField,
} from '@/lib/arrow/decodeArrowTable';
import type { ColumnCastType } from '../../api';
export type { ColumnCastType } from '../../api';

export const DATA_TYPES = [
  { value: 'string', label: 'string' },
  { value: 'categorical', label: 'categorical' },
  { value: 'integer', label: 'integer' },
  { value: 'float', label: 'float' },
  { value: 'datetime', label: 'datetime' },
] as const;

export const isColumnCastType = (value: string): value is Extract<ColumnCastType, string> =>
  DATA_TYPES.some((type) => type.value === value);

/**
 * Displays a friendly label for canonical physical Arrow types while keeping
 * unknown types and extension identities exact.
 */
export const getTypeDisplayName = (field: ArrowField | undefined): string =>
  field && !arrowExtensionName(field) && DataType.isTimestamp(field.type) && field.type.timezone
    ? 'datetime with timezone'
    : field
      ? arrowTypeDisplayName(field)
      : 'unknown';

/** Cast identity distinguishes timestamp instants from unzoned wall-clock values. */
export const columnCastIdentity = (field: ArrowField): string =>
  DataType.isTimestamp(field.type)
    ? field.type.timezone
      ? 'datetime_tz'
      : 'datetime'
    : arrowTypeDisplayName(field);
