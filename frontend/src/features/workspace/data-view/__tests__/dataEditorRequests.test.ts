import { describe, expect, it } from 'vitest';
import {
  buildCleanText,
  buildCombine,
  buildDuplicate,
  buildExtract,
  buildFindReplace,
  buildSplit,
  duplicateColumnName,
} from '../dataEditorRequests';

const columns = ['id', 'text', 'party', 'text copy'];

describe('Data Editor request builders (issue 143)', () => {
  it('names duplicates like copied files', () => {
    expect(duplicateColumnName('party', columns)).toBe('party copy');
    expect(duplicateColumnName('text', columns)).toBe('text copy 2');
    expect(buildDuplicate({ column: 'text' }, columns)).toEqual({
      request: { kind: 'duplicate_column', column: 'text' },
      highlightColumns: ['text copy 2'],
    });
    expect(buildDuplicate({ column: 'missing' }, columns)).toBeNull();
  });

  it('builds find and replace in place or into a new column', () => {
    const base = {
      column: 'text',
      pattern: '\\s+',
      replacement: ' ',
      firstOnly: false,
      outputName: '',
    };
    expect(buildFindReplace({ ...base, target: 'same' }, columns)).toEqual({
      request: {
        kind: 'replace',
        source_column: 'text',
        pattern: '\\s+',
        replacement: ' ',
        output_column: null,
        mode: 'replace',
        count: 'all',
      },
      highlightColumns: ['text'],
    });
    expect(buildFindReplace({ ...base, target: 'new' }, columns)).toBeNull();
    expect(buildFindReplace({ ...base, target: 'new', outputName: 'party' }, columns)).toBeNull();
    expect(
      buildFindReplace({ ...base, target: 'new', outputName: 'tidy', firstOnly: true }, columns)
        ?.request,
    ).toMatchObject({ output_column: 'tidy', count: 'first' });
    expect(buildFindReplace({ ...base, pattern: '', target: 'same' }, columns)).toBeNull();
  });

  it('requires a fresh name for extracted and combined columns', () => {
    expect(
      buildExtract(
        { column: 'text', pattern: '#\\w+', outputName: 'tags', firstOnly: false, connector: ' ' },
        columns,
      )?.request,
    ).toMatchObject({ kind: 'replace', mode: 'extract', output_column: 'tags' });
    expect(
      buildCombine({ columns: ['text'], separator: ' ', outputName: 'both' }, columns),
    ).toBeNull();
    const combined = buildCombine(
      { columns: ['party', 'text'], separator: ': ', outputName: 'both' },
      columns,
    );
    expect(combined?.request).toEqual({
      kind: 'expression',
      context: 'with_columns',
      expressions: [
        {
          alias: 'both',
          expression: {
            op: 'add',
            left: {
              op: 'add',
              left: { op: 'column', name: 'party' },
              right: { op: 'literal', value: ': ' },
            },
            right: { op: 'column', name: 'text' },
          },
        },
      ],
    });
  });

  it('builds cleaning and splitting edits and names split columns', () => {
    expect(
      buildCleanText({ column: 'text', operation: 'trim', target: 'same', outputName: '' }, columns)
        ?.request,
    ).toEqual({ kind: 'clean_text', column: 'text', operation: 'trim', output_column: null });
    expect(buildSplit({ column: 'party', delimiter: '-', parts: 3 }, columns)).toEqual({
      request: { kind: 'split_column', column: 'party', delimiter: '-', parts: 3 },
      highlightColumns: ['party_1', 'party_2', 'party_3'],
    });
    expect(buildSplit({ column: 'party', delimiter: '-', parts: 1 }, columns)).toBeNull();
    expect(buildSplit({ column: 'party', delimiter: '', parts: 2 }, columns)).toBeNull();
  });
});
