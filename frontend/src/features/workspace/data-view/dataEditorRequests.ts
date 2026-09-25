/**
 * Pure builders from Data Editor tool forms to Data Block Edits (issue 143).
 * Each returns the edit to preview and apply plus the columns it adds or
 * changes (highlighted in the table), or `null` while the form is incomplete.
 */
import type { ExpressionItemInput } from '@/api';
import type { DataEditorEdit } from './dataEditorToolStore';

export interface DataEditorDraft {
  request: DataEditorEdit;
  highlightColumns: string[];
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
    },
    highlightColumns: [output ?? form.column],
  };
}

export function buildExtract(
  form: {
    column: string;
    pattern: string;
    outputName: string;
    firstOnly: boolean;
    connector: string;
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
    },
    highlightColumns: [output],
  };
}

type ExpressionSpec = ExpressionItemInput['expression'];

export function buildCombine(
  form: { columns: string[]; separator: string; outputName: string },
  columns: readonly string[],
): DataEditorDraft | null {
  const output = newName(form.outputName, columns);
  const parts = form.columns.filter((column) => columns.includes(column));
  const [first, ...rest] = parts;
  if (!output || !first || rest.length === 0) return null;
  const expression = rest.reduce<ExpressionSpec>(
    (left, column) => {
      const withSeparator: ExpressionSpec = form.separator
        ? { op: 'add', left, right: { op: 'literal', value: form.separator } }
        : left;
      return { op: 'add', left: withSeparator, right: { op: 'column', name: column } };
    },
    { op: 'column', name: first },
  );
  return {
    request: {
      kind: 'expression',
      context: 'with_columns',
      expressions: [{ expression, alias: output }],
    },
    highlightColumns: [output],
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
  };
}

export function buildSplit(
  form: { column: string; delimiter: string; parts: number },
  columns: readonly string[],
): DataEditorDraft | null {
  if (!columns.includes(form.column) || !form.delimiter) return null;
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
      delimiter: form.delimiter,
      parts: form.parts,
    },
    highlightColumns: outputs,
  };
}
