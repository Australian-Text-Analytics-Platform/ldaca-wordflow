import { describe, expect, it } from 'vitest';
import {
  annotationColumnCodebookHint,
  codebookFitFromValues,
  codebookFitNotes,
  codebookFitSql,
  parseCodebookFitRows,
} from '../codebookFit';

const codes = ['Promise', 'Cuts', 'Other'];

describe('codebook fit (issue 498)', () => {
  it('asks for every column in one query and reads the totals and examples back', () => {
    const sql = codebookFitSql('SELECT * FROM "node"', ['job.gemini25', 'Job_AI'], codes);
    expect(sql.split(' UNION ALL ')).toHaveLength(4);
    expect(sql).toContain("IN ('Promise', 'Cuts', 'Other')");
    expect(sql).toContain('LIMIT 3');

    const fits = parseCodebookFitRows(
      [
        { __fit_column: 0, __fit_value: null, __fit_filled: 40, __fit_not_codes: 12 },
        { __fit_column: 0, __fit_value: 'promise', __fit_filled: 9, __fit_not_codes: 0 },
        { __fit_column: 1, __fit_value: null, __fit_filled: BigInt(0), __fit_not_codes: 0 },
      ],
      ['job.gemini25', 'Job_AI'],
    );
    expect(fits.get('job.gemini25')).toEqual({ filled: 40, notCodes: 12, examples: ['promise'] });
    expect(fits.get('Job_AI')).toEqual({ filled: 0, notCodes: 0, examples: [] });
  });

  it('counts values on screen the same way, most frequent examples first', () => {
    expect(codebookFitFromValues(['Promise', 'x', ' y ', 'x', null, '', 'z', 'w'], codes)).toEqual({
      filled: 6,
      notCodes: 5,
      examples: ['x', 'w', 'y'],
    });
  });

  it('names a column with no codes, says how many were left out otherwise, and stays quiet when all fit', () => {
    const notes = codebookFitNotes([
      {
        column: 'job.gemini25',
        fit: { filled: 40, notCodes: 12, examples: ['promise'] },
        everyScore: true,
      },
      { column: 'Job_AI', fit: { filled: 30, notCodes: 30, examples: ['Yes', 'No'] } },
      { column: 'Job_human', fit: { filled: 30, notCodes: 0, examples: [] } },
      { column: 'empty', fit: { filled: 0, notCodes: 0, examples: [] } },
    ]);
    expect(notes.map((note) => note.text)).toEqual([
      '12 values in job.gemini25 are not codes in the selected codebook and were left out.',
      'None of the values in Job_AI are codes in the selected codebook (for example “Yes”, “No”), so Job_AI is left out of this score. Check the codebook.',
    ]);
    expect(notes.map((note) => note.leftOut)).toEqual([false, true]);
  });

  it('says the annotation column applies to every score', () => {
    const [note] = codebookFitNotes([
      {
        column: 'job.gemini25',
        fit: { filled: 3, notCodes: 3, examples: ['Other'] },
        everyScore: true,
      },
    ]);
    expect(note?.text).toBe(
      'None of the values in job.gemini25 are codes in the selected codebook (for example “Other”), so job.gemini25 is left out of every score, since all of them compare against it. Check the codebook.',
    );
  });

  it('hints above the table only when most or all annotation values are not codes', () => {
    expect(
      annotationColumnCodebookHint(
        'job.gemini25',
        { filled: 10, notCodes: 6, examples: [] },
        codes,
      ),
    ).toBe(
      'Most values in job.gemini25 are not codes in the selected codebook (Promise, Cuts, Other), so the scores leave them out. Is the right codebook selected?',
    );
    expect(
      annotationColumnCodebookHint(
        'job.gemini25',
        { filled: 10, notCodes: 10, examples: [] },
        codes,
      ),
    ).toBe(
      'None of the values in job.gemini25 are codes in the selected codebook (Promise, Cuts, Other), so the scores leave them out. Is the right codebook selected?',
    );
    expect(
      annotationColumnCodebookHint(
        'job.gemini25',
        { filled: 10, notCodes: 5, examples: [] },
        codes,
      ),
    ).toBeNull();
    expect(
      annotationColumnCodebookHint('job.gemini25', { filled: 10, notCodes: 10, examples: [] }, []),
    ).toBeNull();
  });
});
