import { describe, expect, it } from 'vitest';
import { describeSkippedFiles } from '../skippedFiles';

describe('describeSkippedFiles', () => {
  it('lists skipped files by extension, largest first', () => {
    expect(
      describeSkippedFiles([
        { extension: 'csv', reason: 'unsupported_type', count: 4 },
        { extension: 'pdf', reason: 'unsupported_type', count: 30 },
        { extension: 'txt', reason: 'not_utf8', count: 2 },
        { extension: '', reason: 'unsupported_type', count: 1 },
      ]),
    ).toBe(
      '37 files skipped while loading: pdf - 30, csv - 4, txt (not UTF-8) - 2, (no extension) - 1',
    );
  });

  it('uses the singular for one file', () => {
    expect(describeSkippedFiles([{ extension: 'exe', reason: 'unsupported_type', count: 1 }])).toBe(
      '1 file skipped while loading: exe - 1',
    );
  });
});
