import { DataType } from 'apache-arrow';
import {
  arrowExtensionName,
  isArrowStringField,
  type ArrowField,
} from '@/lib/arrow/decodeArrowTable';
import { identifier } from '@/features/project/api';
import { literal } from '../sql';

export type BuildType =
  | {
      family:
        | 'number'
        | 'text'
        | 'boolean'
        | 'date'
        | 'time'
        | 'timestamp'
        | 'unknown'
        | 'unsupported'
        | 'null';
    }
  | { family: 'list'; element: BuildType };
const number: BuildType = { family: 'number' };
const text: BuildType = { family: 'text' };
const boolean: BuildType = { family: 'boolean' };
const timestamp: BuildType = { family: 'timestamp' };
const unknown: BuildType = { family: 'unknown' };

/** Menu families only. Exact output types continue to come from DuckDB's Arrow schema. */
export function buildType(field: ArrowField | undefined): BuildType {
  if (!field || arrowExtensionName(field)) return { family: 'unsupported' };
  if (
    isArrowStringField(field) ||
    (DataType.isDictionary(field.type) && DataType.isUtf8(field.type.dictionary))
  )
    return text;
  const type = field.type;
  if (DataType.isInt(type) || DataType.isFloat(type) || DataType.isDecimal(type)) return number;
  if (DataType.isBool(type)) return boolean;
  if (DataType.isDate(type)) return { family: 'date' };
  if (DataType.isTime(type)) return { family: 'time' };
  if (DataType.isTimestamp(type)) return timestamp;
  if (DataType.isList(type) || DataType.isFixedSizeList(type))
    return { family: 'list', element: buildType(type.children[0]) };
  return { family: 'unsupported' };
}
export type BuildArgument =
  | 'value'
  | 'digits'
  | 'exponent'
  | 'start'
  | 'length'
  | 'end'
  | 'replacement'
  | 'delimiter'
  | 'format'
  | 'part'
  | 'unit'
  | 'direction'
  | 'index';
export interface OperationParameter {
  name: BuildArgument;
  label: string;
  value: string;
  options?: readonly string[];
  optional?: boolean;
  integer?: boolean;
}
type Arguments = Partial<Record<BuildArgument, string>>;
interface Definition {
  functionName?: string;
  syntax?: {
    name: string;
    input?: number;
    args: {
      name: BuildArgument;
      type: 'text' | 'number' | 'scalar' | 'element';
      optional?: boolean;
    }[];
  };

  label: string;
  group: string;
  accepts: (type: BuildType) => boolean;
  result: (type: BuildType) => BuildType;
  sql: (expression: string, args: Arguments, type: BuildType) => string;
  summary?: boolean;
  parameters?: (type: BuildType) => OperationParameter[];
  description?: string;
}
const scalar = (t: BuildType) => !['unknown', 'unsupported', 'list', 'null'].includes(t.family);
const numeric = (t: BuildType) => t.family === 'number';
const textual = (t: BuildType) => t.family === 'text';
const logical = (t: BuildType) => t.family === 'boolean';
const list = (t: BuildType) => t.family === 'list';
const numericList = (t: BuildType) => t.family === 'list' && numeric(t.element);
const textList = (t: BuildType) => t.family === 'list' && textual(t.element);
const temporal = (t: BuildType) => ['date', 'time', 'timestamp'].includes(t.family);
const dateOrTimestamp = (t: BuildType) => t.family === 'date' || t.family === 'timestamp';
const same = (t: BuildType) => t;
const parameter = (name: BuildArgument, label: string, value = ''): OperationParameter => ({
  name,
  label,
  value,
});
const arg = (args: Arguments, name: BuildArgument) => {
  const value = args[name];
  if (value === undefined) throw new Error(`Enter ${name}`);
  return value;
};
const integer = (value: string) => {
  if (!/^[+-]?\d+$/.test(value.trim())) throw new Error('Expected an integer');
  return value.trim();
};
const numericLiteral = (value: string) => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
    throw new Error('Expected a number');
  return value.trim();
};
const scalarLiteral = (value: string, type: BuildType) => {
  if (numeric(type)) return numericLiteral(value);
  if (logical(type)) {
    if (!/^(true|false)$/i.test(value)) throw new Error('Choose true or false');
    return value.toUpperCase();
  }
  return literal(value);
};
const scalarParameter = (type: BuildType): OperationParameter[] => [
  {
    ...parameter('value', 'Value', numeric(type) ? '0' : logical(type) ? 'false' : ''),
    ...(logical(type) ? { options: ['true', 'false'] } : {}),
  },
];
const fn = (
  label: string,
  group: string,
  name: string,
  accepts: Definition['accepts'],
  result: Definition['result'],
  summary = false,
): Definition => ({
  label,
  group,
  functionName: name,
  accepts,
  result,
  summary,
  sql: (e) => `${name}(${e})`,
});
const count = (label: string, sql: Definition['sql']): Definition => ({
  label,
  group: 'Column summaries',
  accepts: () => true,
  result: () => number,
  summary: true,
  sql,
});
const numericFunction = (label: string, name: string) =>
  fn(label, 'Numeric', name, numeric, () => number);
const numericSummary = (label: string, name: string) =>
  fn(label, 'Column summaries', name, numeric, () => number, true);
const textFunction = (label: string, name: string, result: BuildType = text) =>
  fn(label, 'Text', name, textual, () => result);
const listFunction = (
  label: string,
  name: string,
  result: Definition['result'] = same,
  accepts: Definition['accepts'] = list,
) => fn(label, 'List', name, accepts, result);
const dateParts = (type: BuildType) => [
  ...(type.family !== 'time'
    ? ['year', 'quarter', 'month', 'day', 'isodow', 'dayofyear', 'week']
    : []),
  ...(type.family !== 'date' ? ['hour', 'minute', 'second'] : []),
];
const units = (type: BuildType) => [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  ...(type.family === 'timestamp' ? ['hour', 'minute', 'second'] : []),
];

/** One catalogue owns menu eligibility, parameters, output families and native SQL. */
const BUILD_OPERATIONS = {
  is_null: {
    label: 'Is NULL',
    group: 'General',
    accepts: () => true,
    result: () => boolean,
    sql: (e) => `(${e}) IS NULL`,
  },
  is_not_null: {
    label: 'Is not NULL',
    group: 'General',
    accepts: () => true,
    result: () => boolean,
    sql: (e) => `(${e}) IS NOT NULL`,
  },
  fill_null: {
    syntax: { name: 'coalesce', input: 0, args: [{ name: 'value', type: 'scalar' }] },
    label: 'Fill NULL',
    group: 'General',
    accepts: scalar,
    result: same,
    parameters: scalarParameter,
    sql: (e, a, t) => `coalesce(${e}, ${scalarLiteral(arg(a, 'value'), t)})`,
  },
  count: count('Count non-NULL', (e) => `count(${e})`),
  count_null: count('Count NULL', (e) => `countif((${e}) IS NULL)`),
  count_distinct: {
    ...count('Count distinct', (e) => `count(DISTINCT ${e})`),
    accepts: (t) => !['unknown', 'unsupported'].includes(t.family),
  },
  min: fn('Minimum', 'Column summaries', 'min', scalar, same, true),
  max: fn('Maximum', 'Column summaries', 'max', scalar, same, true),
  abs: numericFunction('Absolute value', 'abs'),
  sign: numericFunction('Sign', 'sign'),
  round: {
    syntax: { name: 'round', input: 0, args: [{ name: 'digits', type: 'number' }] },
    ...numericFunction('Round', 'round'),
    parameters: () => [{ ...parameter('digits', 'Decimal places', '0'), integer: true }],
    sql: (e, a) => `round(${e}, ${integer(arg(a, 'digits'))})`,
  },
  trunc: {
    syntax: { name: 'trunc', input: 0, args: [{ name: 'digits', type: 'number' }] },
    ...numericFunction('Truncate', 'trunc'),
    parameters: () => [{ ...parameter('digits', 'Decimal places', '0'), integer: true }],
    sql: (e, a) => `trunc(${e}, ${integer(arg(a, 'digits'))})`,
  },
  floor: numericFunction('Floor', 'floor'),
  ceil: numericFunction('Ceiling', 'ceil'),
  sqrt: numericFunction('Square root', 'sqrt'),
  power: {
    syntax: { name: 'power', input: 0, args: [{ name: 'exponent', type: 'number' }] },
    ...numericFunction('Power', 'power'),
    parameters: () => [parameter('exponent', 'Exponent', '2')],
    sql: (e, a) => `power(${e}, ${numericLiteral(arg(a, 'exponent'))})`,
  },
  ln: numericFunction('Natural logarithm', 'ln'),
  log10: numericFunction('Base-10 logarithm', 'log10'),
  exp: numericFunction('Exponential', 'exp'),
  sum: numericSummary('Sum', 'sum'),
  mean: numericSummary('Mean', 'avg'),
  median: numericSummary('Median', 'median'),
  stddev: numericSummary('Sample standard deviation', 'stddev_samp'),
  variance: numericSummary('Sample variance', 'var_samp'),
  lower: textFunction('Lowercase', 'lower'),
  upper: textFunction('Uppercase', 'upper'),
  trim: textFunction('Trim both ends', 'trim'),
  ltrim: textFunction('Trim left', 'ltrim'),
  rtrim: textFunction('Trim right', 'rtrim'),
  strip_accents: textFunction('Strip accents', 'strip_accents'),
  text_length: textFunction('Character length', 'length', number),
  text_reverse: textFunction('Reverse text', 'reverse'),
  substring: {
    syntax: {
      name: 'substring',
      input: 0,
      args: [
        { name: 'start', type: 'number' },
        { name: 'length', type: 'number', optional: true },
      ],
    },
    ...textFunction('Substring', 'substring'),
    parameters: () => [
      { ...parameter('start', 'Start (1-based; negatives count from end)', '1'), integer: true },
      { ...parameter('length', 'Length (blank means remainder)'), optional: true, integer: true },
    ],
    sql: (e, a) =>
      `substring(${e}, ${integer(arg(a, 'start'))}${a.length ? `, ${integer(a.length)}` : ''})`,
  },
  replace: {
    syntax: {
      name: 'replace',
      input: 0,
      args: [
        { name: 'value', type: 'text' },
        { name: 'replacement', type: 'text' },
      ],
    },
    ...textFunction('Replace literal text', 'replace'),
    parameters: () => [parameter('value', 'Find text'), parameter('replacement', 'Replacement')],
    sql: (e, a) => `replace(${e}, ${literal(arg(a, 'value'))}, ${literal(arg(a, 'replacement'))})`,
  },
  contains: {
    syntax: { name: 'contains', input: 0, args: [{ name: 'value', type: 'text' }] },
    ...textFunction('Contains', 'contains', boolean),
    parameters: () => [parameter('value', 'Text')],
    sql: (e, a) => `contains(${e}, ${literal(arg(a, 'value'))})`,
  },
  starts_with: {
    syntax: { name: 'starts_with', input: 0, args: [{ name: 'value', type: 'text' }] },
    ...textFunction('Starts with', 'starts_with', boolean),
    parameters: () => [parameter('value', 'Text')],
    sql: (e, a) => `starts_with(${e}, ${literal(arg(a, 'value'))})`,
  },
  ends_with: {
    syntax: { name: 'ends_with', input: 0, args: [{ name: 'value', type: 'text' }] },
    ...textFunction('Ends with', 'ends_with', boolean),
    parameters: () => [parameter('value', 'Text')],
    sql: (e, a) => `ends_with(${e}, ${literal(arg(a, 'value'))})`,
  },
  split: {
    syntax: { name: 'string_split', input: 0, args: [{ name: 'delimiter', type: 'text' }] },
    ...textFunction('Split', 'string_split', { family: 'list', element: text }),
    parameters: () => [parameter('delimiter', 'Delimiter', ' ')],
    sql: (e, a) => `string_split(${e}, ${literal(arg(a, 'delimiter'))})`,
  },
  parse_datetime: {
    syntax: { name: 'strptime', input: 0, args: [{ name: 'format', type: 'text' }] },
    ...textFunction('Parse datetime', 'strptime', timestamp),
    parameters: () => [parameter('format', 'DuckDB datetime format', '%Y-%m-%d %H:%M:%S')],
    description: 'Strict parsing. Use .%f for fractional seconds and %z for a UTC offset.',
    sql: (e, a) => `strptime(${e}, ${literal(arg(a, 'format'))})`,
  },
  date_part: {
    syntax: { name: 'date_part', input: 1, args: [{ name: 'part', type: 'text' }] },
    label: 'Extract date/time part',
    group: 'Date/time',
    accepts: temporal,
    result: () => number,
    parameters: (t) => [{ ...parameter('part', 'Part', dateParts(t)[0]), options: dateParts(t) }],
    description: 'isodow: Monday=1; week: ISO week; second: whole seconds.',
    sql: (e, a) => `date_part(${literal(arg(a, 'part'))}, ${e})`,
  },
  date_trunc: {
    syntax: { name: 'date_trunc', input: 1, args: [{ name: 'unit', type: 'text' }] },
    label: 'Truncate date/time',
    group: 'Date/time',
    accepts: dateOrTimestamp,
    result: () => timestamp,
    parameters: (t) => [{ ...parameter('unit', 'Unit', 'day'), options: units(t) }],
    sql: (e, a) => `date_trunc(${literal(arg(a, 'unit'))}, ${e})`,
  },
  format_datetime: {
    syntax: { name: 'strftime', input: 0, args: [{ name: 'format', type: 'text' }] },
    label: 'Format date/time',
    group: 'Date/time',
    accepts: dateOrTimestamp,
    result: () => text,
    parameters: () => [parameter('format', 'DuckDB datetime format', '%Y-%m-%d')],
    sql: (e, a) => `strftime(${e}, ${literal(arg(a, 'format'))})`,
  },
  not: {
    label: 'NOT',
    group: 'Boolean',
    accepts: logical,
    result: () => boolean,
    sql: (e) => `NOT (${e})`,
  },
  is_true: {
    label: 'Is true',
    group: 'Boolean',
    accepts: logical,
    result: () => boolean,
    sql: (e) => `(${e}) IS TRUE`,
  },
  is_false: {
    label: 'Is false',
    group: 'Boolean',
    accepts: logical,
    result: () => boolean,
    sql: (e) => `(${e}) IS FALSE`,
  },
  count_true: { ...count('Count true', (e) => `countif(${e})`), accepts: logical },
  count_false: { ...count('Count false', (e) => `countif(NOT (${e}))`), accepts: logical },
  all_true: fn('All true', 'Column summaries', 'bool_and', logical, () => boolean, true),
  any_true: fn('Any true', 'Column summaries', 'bool_or', logical, () => boolean, true),
  list_length: listFunction('List length', 'length', () => number),
  list_count: listFunction('Non-NULL element count', 'list_count', () => number),
  list_distinct: {
    ...listFunction('Distinct elements', 'list_distinct'),
    description: 'Removes NULLs and duplicates; element order may change.',
  },
  list_sort: {
    syntax: { name: 'list_sort', input: 0, args: [{ name: 'direction', type: 'text' }] },
    ...listFunction('Sort elements', 'list_sort'),
    parameters: () => [{ ...parameter('direction', 'Direction', 'ASC'), options: ['ASC', 'DESC'] }],
    sql: (e, a) => `list_sort(${e}, ${literal(arg(a, 'direction'))})`,
  },
  list_reverse: listFunction('Reverse elements', 'list_reverse'),
  list_extract: {
    syntax: { name: 'list_extract', input: 0, args: [{ name: 'index', type: 'number' }] },
    ...listFunction('Element at index', 'list_extract', (t) =>
      t.family === 'list' ? t.element : unknown,
    ),
    parameters: () => [
      { ...parameter('index', 'Index (1-based; negatives count from end)', '1'), integer: true },
    ],
    sql: (e, a) => `list_extract(${e}, ${integer(arg(a, 'index'))})`,
  },
  list_slice: {
    syntax: {
      name: 'list_slice',
      input: 0,
      args: [
        { name: 'start', type: 'number' },
        { name: 'end', type: 'number' },
      ],
    },
    ...listFunction('Slice elements', 'list_slice'),
    parameters: () => [
      { ...parameter('start', 'Start (inclusive)', '1'), integer: true },
      { ...parameter('end', 'End (inclusive)', '-1'), integer: true },
    ],
    sql: (e, a) => `list_slice(${e}, ${integer(arg(a, 'start'))}, ${integer(arg(a, 'end'))})`,
  },
  list_contains: {
    syntax: { name: 'list_contains', input: 0, args: [{ name: 'value', type: 'element' }] },
    ...listFunction(
      'Contains element',
      'list_contains',
      () => boolean,
      (t) => t.family === 'list' && scalar(t.element),
    ),
    parameters: (t) => scalarParameter(t.family === 'list' ? t.element : unknown),
    sql: (e, a, t) =>
      `list_contains(${e}, ${scalarLiteral(arg(a, 'value'), t.family === 'list' ? t.element : unknown)})`,
  },
  list_join: {
    syntax: { name: 'array_to_string', input: 0, args: [{ name: 'delimiter', type: 'text' }] },
    ...listFunction('Join text elements', 'array_to_string', () => text, textList),
    parameters: () => [parameter('delimiter', 'Delimiter', ' ')],
    description: 'NULL elements are skipped.',
    sql: (e, a) => `array_to_string(${e}, ${literal(arg(a, 'delimiter'))})`,
  },
  list_sum: listFunction('Sum elements', 'list_sum', () => number, numericList),
  list_mean: listFunction('Mean of elements', 'list_avg', () => number, numericList),
  list_min: listFunction('Minimum element', 'list_min', () => number, numericList),
  list_max: listFunction('Maximum element', 'list_max', () => number, numericList),
} satisfies Record<string, Definition>;
export type BuildOperationKind = keyof typeof BUILD_OPERATIONS;
/** Arguments stay lossless text; parameter definitions constrain names, required values and enums. */
export interface BuildOperation {
  kind: BuildOperationKind;
  arguments: Arguments;
  summary?: { kind: 'window' } | { kind: 'scalar'; source: string[] };
}
export const operationDefinition = (kind: BuildOperationKind): Definition => BUILD_OPERATIONS[kind];
export const operationKinds = Object.keys(BUILD_OPERATIONS) as BuildOperationKind[];
export function operationDefaults(kind: BuildOperationKind, type: BuildType): BuildOperation {
  return {
    kind,
    ...(operationDefinition(kind).summary ? { summary: { kind: 'window' as const } } : {}),
    arguments: Object.fromEntries(
      (operationDefinition(kind).parameters?.(type) ?? []).map((p) => [p.name, p.value]),
    ),
  };
}
export interface BuildChain {
  sql: string;
  type: BuildType;
  summarized: boolean;
}
export function applyBuildOperation(chain: BuildChain, operation: BuildOperation): BuildChain {
  const def = operationDefinition(operation.kind);
  if (!def.accepts(chain.type) && chain.type.family !== 'unknown')
    throw new Error(`${def.label} is not available for ${chain.type.family}`);
  if (def.summary && chain.summarized)
    throw new Error('Only one column summary is allowed in a chain');
  for (const p of def.parameters?.(chain.type) ?? []) {
    const value = arg(operation.arguments, p.name);
    if (p.options && !p.options.includes(value)) throw new Error(`Choose a valid ${p.label}`);
    if (p.integer && (!p.optional || value)) integer(value);
  }
  return renderBuildOperation(chain, operation);
}
/** Render the catalogue's SQL independently of eligibility validation, including draft steps. */
export function renderBuildOperation(chain: BuildChain, operation: BuildOperation): BuildChain {
  const def = operationDefinition(operation.kind);
  let sql = def.sql(chain.sql, operation.arguments, chain.type);
  if (def.summary)
    sql =
      operation.summary?.kind === 'scalar'
        ? `(SELECT ${sql} FROM ${operation.summary.source.map(identifier).join('.')})`
        : `(${sql} OVER ())`;
  return {
    sql: `(${sql})`,
    // Opaque SQL stays unknown unless the operation accepts any input type.
    type:
      chain.type.family === 'unknown' && !def.accepts(chain.type)
        ? unknown
        : def.result(chain.type),
    summarized: chain.summarized || Boolean(def.summary),
  };
}
export function columnChain(
  column: string,
  field: ArrowField | undefined,
  operations: BuildOperation[],
): BuildChain {
  if (!field) throw new Error(`Column “${column}” is unavailable`);
  let chain: BuildChain = { sql: identifier(column), type: buildType(field), summarized: false };
  operations.forEach((operation, index) => {
    try {
      chain = applyBuildOperation(chain, operation);
    } catch (error) {
      throw new Error(
        `Column “${column}”, step ${String(index + 1)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });
  return chain;
}
