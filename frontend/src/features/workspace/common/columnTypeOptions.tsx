import { Bool, type DataType, Field, Float64, Int64, Utf8 } from 'apache-arrow';
import {
  GENERATED_COLUMN_KINDS,
  type GeneratedColumnKind,
} from '@/features/views/common/generatedColumns';
import { useQuery } from '@tanstack/react-query';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import { ColumnTypeSymbol } from '@/features/workspace/data-view/components/ColumnTypeSymbol';
import { arrowTypeDisplayName, type ArrowField } from '@/lib/arrow/arrowTable';
import { nodeSchemaQueryOptions } from '@/lib/nodeSchema';

/**
 * Column pickers show each column's data type with the symbol the Data Editor
 * uses in its column headers (123, 1.2, Aa, a tag, a calendar, a clock, a
 * timer), so every picker says what is being chosen in the same way
 * (Chao, 19 Nov 2026). The symbol's hover text is the type's plain name.
 */

/** Each column's Arrow field, by column name. */
export type ColumnFields = ReadonlyMap<string, ArrowField>;

/** The fields of a list of columns that carry them. */
export function columnFieldsOf(
  columns: readonly { name: string; field?: ArrowField }[],
): ColumnFields {
  const fields = new Map<string, ArrowField>();
  for (const column of columns) {
    if (column.field) fields.set(column.name, column.field);
  }
  return fields;
}

/**
 * A SearchableSelect option for a column, with its type symbol when the type
 * is known. `label` replaces the column's name as the text shown.
 */
export function columnOption(
  name: string,
  field: ArrowField | undefined,
  label?: string,
): SearchableSelectOption {
  const option: SearchableSelectOption =
    label === undefined ? { value: name } : { value: name, label };
  return field
    ? {
        ...option,
        icon: <ColumnTypeSymbol field={field} />,
        iconLabel: arrowTypeDisplayName(field),
      }
    : option;
}

/** `columnOption` for every name, looking each type up in `fields`. */
export function columnOptions(
  names: readonly string[],
  fields: ColumnFields | undefined,
): SearchableSelectOption[] {
  return names.map((name) => columnOption(name, fields?.get(name)));
}

const GENERATED_FIELD_TYPES = {
  text: () => new Utf8(),
  'whole number': () => new Int64(),
  decimal: () => new Float64(),
  'true/false': () => new Bool(),
} satisfies Record<GeneratedColumnKind, () => DataType>;

/**
 * A column's field where a result lists its columns: the source Data Block's
 * own, or, for a column the analysis adds (CONC_start_idx and the like), one
 * of its known type. Undefined when neither is known.
 */
export function resultColumnField(
  name: string,
  fields: ColumnFields | undefined,
): ArrowField | undefined {
  const own = fields?.get(name);
  if (own) return own;
  const kind = GENERATED_COLUMN_KINDS[name];
  return kind ? new Field(name, GENERATED_FIELD_TYPES[kind]()) : undefined;
}

/**
 * A Data Block's column types, from its schema (shared with every other
 * reader of that schema, so it is rarely a new request). Empty until it is
 * known; pickers then show names without symbols.
 */
export function useNodeColumnFields(
  workspaceId: string | null | undefined,
  nodeId: string | null | undefined,
): ColumnFields {
  const schema = useQuery({
    ...nodeSchemaQueryOptions({ workspaceId: workspaceId ?? '', nodeId: nodeId ?? '' }),
    enabled: Boolean(workspaceId && nodeId),
  });
  return columnFieldsOf(schema.data ?? []);
}
