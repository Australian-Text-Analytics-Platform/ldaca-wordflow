import type { ColumnChange } from '@/features/project/api';
import { identifier } from '@/features/project/objects';
import { literal } from '@/features/tools/preprocessing/sql';

export const EDITOR_TOOLS = {
  replace: 'Find/Replace',
  extract: 'Extract',
  combine: 'Combine',
  duplicate: 'Duplicate',
  clean: 'Clean',
  split: 'Split',
  count: 'Count',
  map: 'Map values',
  categories: 'Category order',
  overview: 'Corpus overview',
  delete: 'Delete columns',
} as const;
export type EditorTool = keyof typeof EDITOR_TOOLS;
export const CLEAN_OPERATIONS = {
  trim: 'Trim outer whitespace',
  whitespace: 'Collapse whitespace',
  lower: 'lowercase',
  upper: 'UPPERCASE',
  title: 'Title case',
  punctuation: 'Remove punctuation and symbols',
  digits: 'Remove digits',
  urls: 'Remove URLs',
  html: 'Remove HTML tags',
  xml: 'Remove XML markup',
} as const;
export interface EditorDraft {
  column: string;
  output: string;
  newColumn: boolean;
  pattern: string;
  replacement: string;
  regex: boolean;
  whole: boolean;
  sensitive: boolean;
  first: boolean;
  limit: number;
  connector: string;
  template: string;
  missing: 'blank' | 'missing';
  clean: keyof typeof CLEAN_OPERATIONS;
  delimiters: string[];
  newlines: boolean;
  right: boolean;
  parts: number;
  measure: 'words' | 'characters' | 'non_whitespace' | 'matches';
  deleted: string[];
  malformedOnly: boolean;
  mappings: { key: string | null; value: string | null }[];
  categoryOrder: string[] | null;
}
export function initialEditorDraft(column: string): EditorDraft {
  return {
    column,
    output: '',
    newColumn: false,
    pattern: '',
    replacement: '',
    regex: false,
    whole: false,
    sensitive: true,
    first: false,
    limit: 1,
    connector: ' ',
    template: '',
    missing: 'blank',
    clean: 'trim',
    delimiters: [],
    newlines: false,
    right: false,
    parts: 2,
    measure: 'words',
    deleted: [],
    malformedOnly: false,
    mappings: [],
    categoryOrder: null,
  };
}
const fold = (value: string) => value.replace(/[A-Z]/g, (c) => c.toLowerCase());
export function uniqueColumnName(stem: string, columns: readonly string[]): string {
  const taken = new Set(columns.map(fold));
  let name = stem;
  let suffix = 2;
  while (taken.has(fold(name))) name = `${stem} ${String(suffix++)}`;
  return name;
}
export function suggestedEditorName(
  tool: EditorTool,
  draft: EditorDraft,
  columns: readonly string[],
) {
  const suffix =
    tool === 'count'
      ? `${draft.measure.replaceAll('_', ' ')} count`
      : (
          {
            replace: 'replaced',
            extract: 'matches',
            combine: 'combined',
            duplicate: 'copy',
            clean: 'cleaned',
            split: 'split',
            delete: '',
            map: 'mapped',
            categories: '',
            overview: '',
          } as const
        )[tool];
  return uniqueColumnName(
    tool === 'combine' ? 'combined' : `${draft.column || 'text'} ${suffix}`,
    columns,
  );
}
export function combineExpression(
  template: string,
  columns: readonly string[],
  missing: EditorDraft['missing'],
) {
  const parts: string[] = [];
  let text = '';
  const flush = () => {
    if (text) parts.push(literal(text));
    text = '';
  };
  for (let index = 0; index < template.length; index++) {
    const char = template[index];
    if ((char === '{' || char === '}') && template[index + 1] === char) {
      text += char;
      index++;
    } else if (char === '{') {
      const end = template.indexOf('}', index + 1);
      if (end < 0) throw new Error('A { has no matching }.');
      const name = template.slice(index + 1, end);
      if (!columns.includes(name)) throw new Error(`Column is unavailable: ${name}`);
      flush();
      const source = `CAST(${identifier(name)} AS VARCHAR)`;
      parts.push(missing === 'blank' ? `coalesce(${source}, '')` : source);
      index = end;
    } else if (char === '}') throw new Error('Write }} for a literal closing brace.');
    else text += char;
  }
  flush();
  if (!parts.length) throw new Error('Enter a nonempty template.');
  return parts.join(' || ');
}
export interface EditorOperation {
  change: ColumnChange;
  select: string;
  outputs: string[];
  changed: string;
  invalidXml?: string;
}
/** Only ordinary SQL and the native shared column-change contract leave the form. */
export function compileEditor(
  tool: EditorTool,
  draft: EditorDraft,
  columns: readonly string[],
  preserveTypes = false,
): EditorOperation {
  if (tool === 'overview') throw new Error('Corpus overview reads the source without changing it.');
  if (tool === 'delete') {
    if (!draft.deleted.length) throw new Error('Choose columns to delete.');
    if (draft.deleted.length >= columns.length) throw new Error('Keep at least one column.');
    if (draft.deleted.some((name) => !columns.includes(name)))
      throw new Error('A selected column is unavailable.');
    return {
      change: { operation: 'delete_many', columns: draft.deleted },
      select: `SELECT * EXCLUDE (${draft.deleted.map(identifier).join(', ')}) FROM __wf_current`,
      outputs: [],
      changed: 'TRUE',
    };
  }
  if (tool !== 'combine' && !columns.includes(draft.column)) throw new Error('Choose a column.');
  const source = identifier(draft.column);
  if (tool === 'categories') {
    if (!draft.categoryOrder) throw new Error('Loading category values.');
    return {
      change: { operation: 'order_categories', column: draft.column, values: draft.categoryOrder },
      select: draft.categoryOrder.length
        ? `SELECT * REPLACE (CAST(CAST(${source} AS VARCHAR) AS ENUM (${draft.categoryOrder.map(literal).join(', ')})) AS ${source}) FROM __wf_current`
        : 'SELECT * FROM __wf_current',
      outputs: [draft.column],
      changed: 'FALSE',
    };
  }
  const text = `CAST(${source} AS VARCHAR)`;
  const matchArguments = `${text}, ${literal(draft.pattern)}, ${literal(draft.regex)}, ${literal(draft.whole)}, ${literal(draft.sensitive)}`;
  const matches = `wordflow_matches(${matchArguments})`;
  const needsPattern =
    tool === 'replace' || tool === 'extract' || (tool === 'count' && draft.measure === 'matches');
  if (needsPattern && !draft.pattern) throw new Error('Enter text or a pattern to find.');
  const output = (draft.output || suggestedEditorName(tool, draft, columns)).trim();
  const replace = (tool === 'replace' || tool === 'clean') && !draft.newColumn;
  const validateNew = (name: string) => {
    if (!name) throw new Error('Enter a column name.');
    if (columns.some((column) => fold(column) === fold(name)))
      throw new Error('A column with this name already exists.');
    return name;
  };
  let expression: string;
  let invalidXml: string | undefined;
  if (tool === 'replace')
    expression = `wordflow_replace(${text}, ${literal(draft.pattern)}, ${literal(draft.replacement)}, ${literal(draft.regex)}, ${literal(draft.whole)}, ${literal(draft.sensitive)}, ${literal(draft.first)})`;
  else if (tool === 'extract') {
    if (draft.first && (!Number.isInteger(draft.limit) || draft.limit < 1))
      throw new Error('Enter a positive match count.');
    expression = `array_to_string(${draft.first ? `list_slice(${matches}, 1, ${String(draft.limit)})` : matches}, ${literal(draft.connector)})`;
  } else if (tool === 'combine')
    expression = combineExpression(draft.template, columns, draft.missing);
  else if (tool === 'duplicate') expression = source;
  else if (tool === 'map') {
    if (!draft.mappings.length) throw new Error('Change at least one value.');
    expression = `CASE ${draft.mappings.map(({ key, value }) => `WHEN CAST(to_json(${source}) AS VARCHAR) IS NOT DISTINCT FROM ${key === null ? 'NULL' : literal(key)} THEN ${value === null ? 'NULL' : literal(value)}`).join(' ')} ELSE ${text} END`;
  } else if (tool === 'count')
    expression = {
      words: `wordflow_word_count(${text})`,
      characters: `length(${text})`,
      non_whitespace: `length(regexp_replace(${text}, '[\\p{Z}\\s]', '', 'g'))`,
      matches: `length(${matches})`,
    }[draft.measure];
  else if (tool === 'clean') {
    expression = {
      trim: `regexp_replace(${text}, '^[\\p{Z}\\s]+|[\\p{Z}\\s]+$', '', 'g')`,
      whitespace: `trim(regexp_replace(${text}, '[\\p{Z}\\s]+', ' ', 'g'))`,
      lower: `lower(${text})`,
      upper: `upper(${text})`,
      title: `wordflow_title_case(${text})`,
      punctuation: `regexp_replace(${text}, '[\\p{P}\\p{S}]', '', 'g')`,
      digits: `regexp_replace(${text}, '\\p{N}', '', 'g')`,
      urls: `regexp_replace(${text}, '(https?://|www\\.)[^\\s]+', '', 'gi')`,
      html: `regexp_replace(${text}, '<[^>]*>', '', 'g')`,
      xml: `wordflow_clean_xml(${text})`,
    }[draft.clean];
    if (draft.clean === 'xml')
      invalidXml = `${source} IS NOT NULL AND NOT wordflow_xml_valid(${text})`;
  } else {
    if (!Number.isInteger(draft.parts) || draft.parts < 2 || draft.parts > 50)
      throw new Error('Choose between 2 and 50 columns.');
    const delimiters = [
      ...new Set([...draft.delimiters, ...(draft.newlines ? ['\r\n', '\n', '\r'] : [])]),
    ];
    if (!delimiters.length || delimiters.some((value) => !value))
      throw new Error('Add a literal delimiter.');
    const split = `wordflow_split(${text}, ${literal(JSON.stringify(delimiters))}, ${String(draft.parts)}, ${literal(draft.right)})`;
    const reserved = [...columns];
    const outputs = Array.from({ length: draft.parts }, (_, index) => {
      const name = uniqueColumnName(`${draft.column}_${String(index + 1)}`, reserved);
      reserved.push(name);
      return name;
    });
    const expressions = outputs.map((column, index) => ({
      column,
      expression: `list_extract(${split}, ${String(index + 1)})`,
      replace: false,
    }));
    return {
      change: { operation: 'transform_many', columns: expressions },
      select: `SELECT *, ${expressions.map((item) => `${item.expression} AS ${identifier(item.column)}`).join(', ')} FROM __wf_current`,
      outputs,
      changed: `${source} IS NOT NULL`,
    };
  }
  const column = replace ? draft.column : validateNew(output);
  // Table assignment preserves its physical type; Preview must use that same cast.
  if (replace && preserveTypes) expression = `cast_to_type((${expression}), ${source})`;
  return {
    change: { operation: 'transform_many', columns: [{ column, expression, replace }] },
    select: `SELECT *${replace ? ` REPLACE (${expression} AS ${identifier(column)})` : `, ${expression} AS ${identifier(column)}`} FROM __wf_current${invalidXml && draft.malformedOnly ? ` WHERE ${invalidXml}` : ''}`,
    outputs: [column],
    changed: replace ? `${source} IS DISTINCT FROM (${expression})` : `(${expression}) IS NOT NULL`,
    invalidXml,
  };
}
