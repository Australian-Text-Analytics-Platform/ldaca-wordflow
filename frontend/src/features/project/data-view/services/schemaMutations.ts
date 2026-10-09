import type { ColumnCastType } from '@/features/project/api';
import {
  arrowExtensionName,
  arrowTypeDisplayName,
  type ArrowField,
} from '@/lib/arrow/decodeArrowTable';
import { DataType } from 'apache-arrow';
export type { ColumnCastType } from '../../api';

export const DATA_TYPES = [
  { value: 'string', label: 'text' },
  { value: 'categorical', label: 'category' },
  { value: 'integer', label: 'whole number' },
  { value: 'float', label: 'decimal' },
  { value: 'datetime', label: 'date and time' },
] as const;

export const isColumnCastType = (value: string): value is Extract<ColumnCastType, string> =>
  DATA_TYPES.some((type) => type.value === value);

/**
 * Displays a friendly label for canonical physical Arrow types while keeping
 * unknown types and extension identities exact.
 */
export const getTypeDisplayName = (field: ArrowField | undefined): string =>
  field && !arrowExtensionName(field) && DataType.isTimestamp(field.type) && field.type.timezone
    ? 'date and time with timezone'
    : field
      ? arrowTypeDisplayName(field)
      : 'unknown';

/** Cast identity distinguishes timestamp instants from unzoned wall-clock values. */
export const columnCastIdentity = (field: ArrowField): string =>
  DataType.isTimestamp(field.type)
    ? field.type.timezone
      ? 'datetime_tz'
      : 'datetime'
    : ((
        {
          text: 'string',
          category: 'categorical',
          'whole number': 'integer',
          decimal: 'float',
        } as Record<string, string>
      )[arrowTypeDisplayName(field)] ?? arrowTypeDisplayName(field));
