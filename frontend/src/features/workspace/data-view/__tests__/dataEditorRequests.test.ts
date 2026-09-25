import { describe, expect, it } from 'vitest';
import {
  buildCleanText,
  buildCombine,
  buildCount,
  parseCombineTemplate,
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
      scrollAnchor: 'text',
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
      regex: true,
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
        literal: false,
      },
      highlightColumns: ['text'],
      scrollAnchor: 'text',
    });
    // Plain text is the default in the form: the pattern is matched as written.
    expect(
      buildFindReplace({ ...base, pattern: '.', regex: false, target: 'same' }, columns)?.request,
    ).toMatchObject({ pattern: '.', literal: true });
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
        {
          column: 'text',
          pattern: '#\\w+',
          outputName: 'tags',
          firstOnly: false,
          connector: ' ',
          regex: true,
        },
        columns,
      )?.request,
    ).toMatchObject({ kind: 'replace', mode: 'extract', output_column: 'tags' });
    const combine = (template: string, outputName = 'both') =>
      buildCombine({ template, outputName, emptyValues: 'blank' }, columns);
    expect(combine('{text}', 'text')).toBeNull();
    expect(combine('just text')).toBeNull();
    expect(combine('{nope} {text}')).toBeNull();
    expect(combine('{party}: {text} {{x}}')).toEqual({
      request: {
        kind: 'combine_columns',
        parts: [
          { kind: 'column', column: 'party' },
          { kind: 'text', text: ': ' },
          { kind: 'column', column: 'text' },
          { kind: 'text', text: ' {x}' },
        ],
        output_column: 'both',
        empty_values: 'blank',
      },
      highlightColumns: ['both'],
      scrollAnchor: null,
    });
  });

  it('reports unknown columns and unreadable templates', () => {
    expect(parseCombineTemplate('{nope} and {nope}', columns)).toMatchObject({
      unknown: ['nope'],
      error: null,
    });
    expect(parseCombineTemplate('{text', columns).error).toMatch(/no matching/);
    expect(parseCombineTemplate('a } b', columns).error).toMatch(/}}/);
    expect(parseCombineTemplate('{}', columns).error).toMatch(/column name/);
  });

  it('builds cleaning and splitting edits and names split columns', () => {
    expect(
      buildCleanText({ column: 'text', operation: 'trim', target: 'same', outputName: '' }, columns)
        ?.request,
    ).toEqual({ kind: 'clean_text', column: 'text', operation: 'trim', output_column: null });
    const split = (delimiters: string[], parts = 3) =>
      buildSplit({ column: 'party', delimiters, direction: 'right', parts }, columns);
    expect(split(['-', ';', '-', ''])).toEqual({
      request: {
        kind: 'split_column',
        column: 'party',
        delimiters: ['-', ';'],
        direction: 'right',
        parts: 3,
      },
      highlightColumns: ['party_1', 'party_2', 'party_3'],
      scrollAnchor: 'party',
    });
    expect(split(['-'], 1)).toBeNull();
    expect(split(['', ''], 2)).toBeNull();
  });

  it('counts into a named column, defaulting to "<column> <measure>"', () => {
    const count = (overrides: Partial<Parameters<typeof buildCount>[0]> = {}) =>
      buildCount(
        {
          column: 'text',
          measure: 'words',
          pattern: '',
          regex: false,
          outputName: '',
          ...overrides,
        },
        columns,
      );
    expect(count()).toEqual({
      request: {
        kind: 'count',
        column: 'text',
        measure: 'words',
        pattern: null,
        regex: false,
        output_column: 'text word count',
      },
      highlightColumns: ['text word count'],
      scrollAnchor: 'text',
    });
    expect(count({ measure: 'matches' })).toBeNull();
    expect(count({ measure: 'matches', pattern: '.', outputName: 'dots' })?.request).toMatchObject({
      pattern: '.',
      regex: false,
      output_column: 'dots',
    });
    expect(count({ outputName: 'party' })).toBeNull();
  });
});
