import { describe, expect, it } from 'vitest';
import { expandSheets } from '../batchTables';

describe('expandSheets (issue 323)', () => {
  it('lists each sheet of a workbook with several sheets, and other tables once', () => {
    const sheets: Record<string, string[]> = {
      'data/survey.xlsx': ['Responses', 'Codes'],
      'data/one.ods': ['Only'],
    };
    const rows = expandSheets(
      [
        { path: 'data/notes.csv', label: 'notes.csv' },
        { path: 'data/survey.xlsx', label: 'survey.xlsx' },
        { path: 'data/one.ods', label: 'one.ods' },
        { path: 'data/broken.xlsx', label: 'broken.xlsx' },
      ],
      (path) => sheets[path] ?? null,
    );
    expect(rows.map((row) => [row.label, row.sheet])).toEqual([
      ['notes.csv', undefined],
      ['survey.xlsx › Responses', 'Responses'],
      ['survey.xlsx › Codes', 'Codes'],
      ['one.ods', undefined],
      ['broken.xlsx', undefined],
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });
});
