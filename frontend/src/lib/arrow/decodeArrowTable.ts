import {
  DataType,
  tableFromIPC,
  type Field,
  type Table,
  type Type,
  type TypeMap,
} from 'apache-arrow';

const ARROW_EXTENSION_NAME = 'ARROW:extension:name';
const COMMON_ARROW_TYPE_DISPLAY_NAMES = new Map<string, string>([
  ['Utf8View', 'string'],
  ['Utf8', 'string'],
  ['Dictionary<Uint32, Utf8View>', 'categorical'],
  ['Int64', 'integer'],
  ['Float64', 'float'],
  ['Timestamp<MICROSECOND, UTC>', 'datetime'],
]);

/** Every concrete Arrow type supplies its native schema spelling via `toString`. */
export type ArrowDataType = DataType<Type, TypeMap> & { toString(): string };
export type ArrowField = Field<ArrowDataType>;

export interface ArrowColumn {
  name: string;
  field: ArrowField;
}

export interface ArrowTableData {
  table: Table<TypeMap>;
  columns: string[];
  schema: ArrowColumn[];
  rows: Record<string, unknown>[];
}

const isArrowStringType = (type: ArrowDataType): boolean =>
  DataType.isUtf8(type) || DataType.isLargeUtf8(type) || DataType.isUtf8View(type);

const arrowListChild = (type: ArrowDataType): ArrowField | undefined => {
  if (!DataType.isList(type) && !DataType.isLargeList(type) && !DataType.isFixedSizeList(type)) {
    return undefined;
  }
  return type.children[0];
};

/** Returns the exact extension identity carried by the IPC field metadata. */
export const arrowExtensionName = (field: ArrowField): string | null =>
  field.metadata.get(ARROW_EXTENSION_NAME) ?? null;

/**
 * Names a decoded field without translating it into a Wordflow-specific type.
 * Used by schema controls and diagnostics: semantic extensions retain the
 * exact identity published in IPC metadata; ordinary fields use Apache
 * Arrow's own native type spelling.
 */
export const arrowTypeName = (field: ArrowField): string =>
  arrowExtensionName(field) ?? field.type.toString();

/**
 * Provides friendly labels for Wordflow's canonical physical Arrow types.
 * Extension identities and unrecognized native spellings remain exact so the
 * UI never hides a distinct type that may need explicit normalization.
 */
export const arrowTypeDisplayName = (field: ArrowField): string => {
  const extensionName = arrowExtensionName(field);
  if (extensionName !== null) return extensionName;
  if (DataType.isDate(field.type)) return 'date';
  if (DataType.isDecimal(field.type))
    return `decimal (${String(field.type.precision)}, ${String(field.type.scale)})`;
  if (
    DataType.isDictionary(field.type) &&
    !field.type.indices.isSigned &&
    [8, 16, 32].includes(field.type.indices.bitWidth) &&
    isArrowStringType(field.type.dictionary as ArrowDataType)
  )
    return 'categorical';
  const nativeTypeName = field.type.toString();
  return COMMON_ARROW_TYPE_DISPLAY_NAMES.get(nativeTypeName) ?? nativeTypeName;
};

/** Native Arrow predicates used by feature-specific behavior at its call site. */
export const isArrowStringField = (field: ArrowField): boolean => isArrowStringType(field.type);

export const isArrowStringListField = (field: ArrowField): boolean => {
  const child = arrowListChild(field.type);
  return child !== undefined && isArrowStringType(child.type);
};

export const isArrowDictionaryField = (field: ArrowField): boolean =>
  DataType.isDictionary(field.type);

export const isArrowIntegerField = (field: ArrowField): boolean => DataType.isInt(field.type);

export const isArrowFloatField = (field: ArrowField): boolean =>
  DataType.isFloat(field.type) || DataType.isDecimal(field.type);

export const isArrowBooleanField = (field: ArrowField): boolean => DataType.isBool(field.type);

export const isArrowTemporalField = (field: ArrowField): boolean =>
  DataType.isDate(field.type) ||
  DataType.isTime(field.type) ||
  DataType.isTimestamp(field.type) ||
  DataType.isDuration(field.type) ||
  DataType.isInterval(field.type);

/** Display normalization; editors use lossless scalar values instead. */
export const normalizeArrowValue = (value: unknown, type?: ArrowDataType): unknown => {
  if (value === null || value === undefined) return value;
  if (type && DataType.isDictionary(type))
    return normalizeArrowValue(value, type.dictionary as ArrowDataType);
  // Both Arrow date getters expose milliseconds. Use UTC calendar components,
  // never the host timezone, and leave the physical field/type untouched.
  if (type && DataType.isDate(type) && (typeof value === 'number' || value instanceof Date))
    return new Date(value).toISOString().split('T')[0];
  if (type && DataType.isDecimal(type) && value instanceof Uint32Array) {
    // Arrow's Decimal getter returns an unscaled BigNum; never round it through Number.
    const raw = value.toString();
    const sign = raw.startsWith('-') ? '-' : '';
    const digits = raw.replace(/^-/, '').padStart(type.scale + 1, '0');
    return type.scale > 0
      ? `${sign}${digits.slice(0, -type.scale)}.${digits.slice(-type.scale)}`
      : `${sign}${digits}${'0'.repeat(-type.scale)}`;
  }
  if (
    type &&
    (DataType.isList(type) || DataType.isLargeList(type) || DataType.isFixedSizeList(type)) &&
    typeof value === 'object' &&
    Symbol.iterator in value
  ) {
    return Array.from(value as Iterable<unknown>, (child) =>
      normalizeArrowValue(child, type.children[0]?.type as ArrowDataType | undefined),
    );
  }
  if (type && DataType.isStruct(type) && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      type.children.map((field) => [
        field.name,
        normalizeArrowValue(record[field.name], field.type as ArrowDataType),
      ]),
    );
  }
  if (type && DataType.isTimestamp(type) && typeof value === 'number') {
    return new Date(value).toISOString();
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((child) => normalizeArrowValue(child));
  if (typeof value === 'object' && 'toJSON' in value) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return normalizeArrowValue((toJSON as () => unknown).call(value));
    }
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeArrowValue(child)]),
    );
  }
  return value;
};

/** Decode an already parsed Arrow table without a serialization round trip. */
export function decodeArrowData(table: Table<TypeMap>): ArrowTableData {
  const used = new Set<string>();
  const schema = table.schema.fields.map((field) => {
    let name = field.name;
    let suffix = 1;
    while (used.has(name)) name = `${field.name}_${String(suffix++)}`;
    used.add(name);
    return { name, field: field as ArrowField };
  });
  const columns = schema.map((column) => column.name);
  // SQL results can have duplicate field names. Read by position and give only
  // the presentation keys unique names; the original Arrow fields stay intact.
  const rows = Array.from({ length: table.numRows }, (_, index) =>
    Object.fromEntries(
      schema.map((column, columnIndex) => [
        column.name,
        normalizeArrowValue(table.getChildAt(columnIndex)?.get(index), column.field.type),
      ]),
    ),
  );
  return { table, columns, schema, rows };
}

export const decodeArrowTable = async (source: Blob | ArrayBuffer): Promise<ArrowTableData> => {
  try {
    const buffer = source instanceof Blob ? await source.arrayBuffer() : source;
    const table = tableFromIPC<TypeMap>(buffer);
    return decodeArrowData(table);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Arrow table decode failed: ${message}`, { cause: error });
  }
};
