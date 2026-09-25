/**
 * Pure builders from Data Editor tool forms to Data Block Edits (issue 143).
 * Each returns the edit to preview and apply plus the columns it adds or
 * changes (highlighted in the table), or `null` while the form is incomplete.
 */
import type { DataEditorEdit } from './dataEditorToolStore';

export interface DataEditorDraft {
  request: DataEditorEdit;
  highlightColumns: string[];
  /**
   * The column the table scrolls to the left edge of the panel while
   * previewing, so the changed or new column beside it shows (issue 154);
   * `null` scrolls to the end, where Combine columns adds its column.
   */
  scrollAnchor: string | null;
}

export type OutputTarget = 'same' | 'new';

export const CLEAN_TEXT_OPERATIONS = [
  { value: 'trim', label: 'Trim spaces at the start and end' },
  { value: 'collapse_whitespace', label: 'Collapse repeated spaces' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'title_case', label: 'Title Case' },
  { value: 'remove_punctuation', label: 'Remove punctuation and symbols' },
  { value: 'remove_digits', label: 'Remove digits' },
  { value: 'remove_urls', label: 'Remove web links (URLs)' },
  { value: 'remove_html_tags', label: 'Remove HTML tags' },
  { value: 'remove_xml_tags', label: 'Remove XML tags and markup' },
] as const;

export type CleanTextOperation = (typeof CLEAN_TEXT_OPERATIONS)[number]['value'];

/** Finder-style copy name, matching the backend: "text copy", "text copy 2", ... */
export function duplicateColumnName(column: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  let candidate = `${column} copy`;
  let number = 2;
  while (taken.has(candidate)) {
    candidate = `${column} copy ${String(number)}`;
    number += 1;
  }
  return candidate;
}

const newName = (value: string, columns: readonly string[]): string | null => {
  const trimmed = value.trim();
  return trimmed && !columns.includes(trimmed) ? trimmed : null;
};

export function buildFindReplace(
  form: {
    column: string;
    pattern: string;
    replacement: string;
    target: OutputTarget;
    outputName: string;
    firstOnly: boolean;
    regex: boolean;
  },
  columns: readonly string[],
): DataEditorDraft | null {
  if (!columns.includes(form.column) || !form.pattern) return null;
  const output = form.target === 'new' ? newName(form.outputName, columns) : null;
  if (form.target === 'new' && !output) return null;
  return {
    request: {
      kind: 'replace',
      source_column: form.column,
      pattern: form.pattern,
      replacement: form.replacement,
      output_column: output,
      mode: 'replace',
      count: form.firstOnly ? 'first' : 'all',
      literal: !form.regex,
    },
    highlightColumns: [output ?? form.column],
    scrollAnchor: form.column,
  };
}

export function buildExtract(
  form: {
    column: string;
    pattern: string;
    outputName: string;
    firstOnly: boolean;
    connector: string;
    regex: boolean;
  },
  columns: readonly string[],
): DataEditorDraft | null {
  const output = newName(form.outputName, columns);
  if (!columns.includes(form.column) || !form.pattern || !output) return null;
  return {
    request: {
      kind: 'replace',
      source_column: form.column,
      pattern: form.pattern,
      output_column: output,
      mode: 'extract',
      count: form.firstOnly ? 'first' : 'all',
      connector: form.connector,
      literal: !form.regex,
    },
    highlightColumns: [output],
    scrollAnchor: form.column,
  };
}

type CombinePart = { kind: 'text'; text: string } | { kind: 'column'; column: string };

export type EmptyValues = 'blank' | 'empty_result';

export interface ParsedTemplate {
  parts: CombinePart[];
  /** Column names in braces that are not on the Data Block. */
  unknown: string[];
  /** Why the template cannot be read, such as an unclosed brace. */
  error: string | null;
}

/**
 * Reads a Combine columns template such as "{title}: {body}". A column is
 * written in braces; "{{" and "}}" stand for literal braces.
 */
export function parseCombineTemplate(template: string, columns: readonly string[]): ParsedTemplate {
  const parts: CombinePart[] = [];
  const unknown: string[] = [];
  let text = '';
  const flushText = () => {
    if (text) parts.push({ kind: 'text', text });
    text = '';
  };
  let index = 0;
  while (index < template.length) {
    const char = template.charAt(index);
    const next = template.charAt(index + 1);
    if ((char === '{' && next === '{') || (char === '}' && next === '}')) {
      text += char;
      index += 2;
      continue;
    }
    if (char === '}') {
      return { parts, unknown, error: 'Write }} for a literal closing brace.' };
    }
    if (char === '{') {
      const close = template.indexOf('}', index + 1);
      if (close < 0) {
        return { parts, unknown, error: 'A { has no matching }.' };
      }
      const column = template.slice(index + 1, close);
      if (!column) {
        return { parts, unknown, error: 'Put a column name inside the braces.' };
      }
      flushText();
      parts.push({ kind: 'column', column });
      if (!columns.includes(column) && !unknown.includes(column)) unknown.push(column);
      index = close + 1;
      continue;
    }
    text += char;
    index += 1;
  }
  flushText();
  return { parts, unknown, error: null };
}

/** Text for inserting a column into a template, as "{name}". */
export const templateColumnToken = (column: string): string => `{${column}}`;

export function buildCombine(
  form: { template: string; outputName: string; emptyValues: EmptyValues },
  columns: readonly string[],
): DataEditorDraft | null {
  const output = newName(form.outputName, columns);
  const parsed = parseCombineTemplate(form.template, columns);
  if (!output || parsed.error || parsed.unknown.length > 0) return null;
  if (!parsed.parts.some((part) => part.kind === 'column')) return null;
  return {
    request: {
      kind: 'combine_columns',
      parts: parsed.parts,
      output_column: output,
      empty_values: form.emptyValues,
    },
    highlightColumns: [output],
    scrollAnchor: null,
  };
}

export function buildDuplicate(
  form: { column: string },
  columns: readonly string[],
): DataEditorDraft | null {
  if (!columns.includes(form.column)) return null;
  return {
    request: { kind: 'duplicate_column', column: form.column },
    highlightColumns: [duplicateColumnName(form.column, columns)],
    scrollAnchor: form.column,
  };
}

export function buildCleanText(
  form: { column: string; operation: CleanTextOperation; target: OutputTarget; outputName: string },
  columns: readonly string[],
): DataEditorDraft | null {
  if (!columns.includes(form.column)) return null;
  const output = form.target === 'new' ? newName(form.outputName, columns) : null;
  if (form.target === 'new' && !output) return null;
  return {
    request: {
      kind: 'clean_text',
      column: form.column,
      operation: form.operation,
      output_column: output,
    },
    highlightColumns: [output ?? form.column],
    scrollAnchor: form.column,
  };
}

export type SplitDirection = 'left' | 'right';

export function buildSplit(
  form: { column: string; delimiters: string[]; direction: SplitDirection; parts: number },
  columns: readonly string[],
): DataEditorDraft | null {
  const delimiters = [...new Set(form.delimiters.filter((delimiter) => delimiter.length > 0))];
  if (!columns.includes(form.column) || delimiters.length === 0) return null;
  if (!Number.isInteger(form.parts) || form.parts < 2 || form.parts > 50) return null;
  const outputs = Array.from(
    { length: form.parts },
    (_value, index) => `${form.column}_${String(index + 1)}`,
  );
  if (outputs.some((output) => columns.includes(output))) return null;
  return {
    request: {
      kind: 'split_column',
      column: form.column,
      delimiters,
      direction: form.direction,
      parts: form.parts,
    },
    highlightColumns: outputs,
    scrollAnchor: form.column,
  };
}

export const COUNT_MEASURES = [
  { value: 'words', label: 'Words', suffix: 'word count' },
  { value: 'characters', label: 'Characters', suffix: 'character count' },
  {
    value: 'characters_no_spaces',
    label: 'Characters, not counting spaces',
    suffix: 'character count (no spaces)',
  },
  { value: 'matches', label: 'Matches of a text or pattern', suffix: 'match count' },
] as const;

export type CountMeasure = (typeof COUNT_MEASURES)[number]['value'];

/** The count column's name when the user leaves it blank: "text word count". */
export function defaultCountName(column: string, measure: CountMeasure): string {
  const suffix = COUNT_MEASURES.find((option) => option.value === measure)?.suffix ?? 'count';
  return `${column || 'text'} ${suffix}`;
}

export function buildCount(
  form: {
    column: string;
    measure: CountMeasure;
    pattern: string;
    regex: boolean;
    outputName: string;
  },
  columns: readonly string[],
): DataEditorDraft | null {
  if (!columns.includes(form.column)) return null;
  if (form.measure === 'matches' && !form.pattern) return null;
  const output = newName(form.outputName || defaultCountName(form.column, form.measure), columns);
  if (!output) return null;
  return {
    request: {
      kind: 'count',
      column: form.column,
      measure: form.measure,
      pattern: form.measure === 'matches' ? form.pattern : null,
      regex: form.measure === 'matches' && form.regex,
      output_column: output,
    },
    highlightColumns: [output],
    scrollAnchor: form.column,
  };
}
