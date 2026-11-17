import { describe, expect, it } from 'vitest';
import { checkRunTarget, runProcessingMode, runTargetWording } from '../runTargetCheck';

describe('the annotation column a Run writes to (issue 499)', () => {
  it('sorts the column into empty, codes, not codes and unknown', () => {
    expect(checkRunTarget('a', { filled: 0, notCodes: 0, examples: [] }, 10)).toEqual({
      kind: 'empty',
    });
    expect(checkRunTarget('a', { filled: 4, notCodes: 0, examples: [] }, 10).kind).toBe('codes');
    expect(checkRunTarget('a', { filled: 4, notCodes: 1, examples: ['x'] }, 10).kind).toBe(
      'not_codes',
    );
    expect(checkRunTarget('a', undefined, 10).kind).toBe('unknown');
  });

  it('overwrites the whole column when any value is not a code', () => {
    const notCodes = checkRunTarget('a', { filled: 4, notCodes: 1, examples: ['x'] }, 10);
    const codes = checkRunTarget('a', { filled: 4, notCodes: 0, examples: [] }, 10);
    expect(runProcessingMode(notCodes, 'fill_missing')).toBe('reprocess_all');
    expect(runProcessingMode(codes, 'fill_missing')).toBe('fill_missing');
  });

  it('words a partly mismatched column and an unknown one', () => {
    const partly = runTargetWording(
      checkRunTarget('job', { filled: 40, notCodes: 12, examples: ['promise'] }, 50),
      'fill_missing',
      { advanced: true },
    );
    expect(partly.line).toBe(
      '12 of the 40 values in job are not codes in the selected codebook (for example “promise”). Check that the right column and codebook are selected: Run would overwrite the whole column.',
    );
    expect(partly.warning).toBe(true);
    expect(partly.dialog?.destructive).toBe(true);

    const unknown = runTargetWording(checkRunTarget('job', undefined, 50), 'fill_missing', {
      advanced: true,
    });
    expect(unknown.line).toBeNull();
    expect(unknown.dialog?.confirm).toBe('Run');
  });

  it('names the Advanced setting when Advanced is on', () => {
    const wording = runTargetWording(
      checkRunTarget('job', { filled: 1, notCodes: 0, examples: [] }, 2),
      'fill_missing',
      { advanced: true },
    );
    expect(wording.line).toBe(
      'job already holds codes in 1 of 2 rows. Run will fill only the 1 empty row.',
    );
    expect(wording.dialog?.body).toContain('change “Which rows to annotate” in Advanced settings');
  });
});
