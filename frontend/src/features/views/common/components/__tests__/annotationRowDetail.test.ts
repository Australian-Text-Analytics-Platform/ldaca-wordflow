import { describe, expect, it } from 'vitest';

import { buildAnnotationRowDetailPayload, HIDDEN_COMPARISON_TEXT } from '../annotationRowDetail';

describe('buildAnnotationRowDetailPayload (issue 92)', () => {
  const row = {
    text: 'Full text',
    annotation: 'old',
    reviewer: 'job',
    second: 'covid',
    url: 'https://x',
  };

  it('lists every visible column in table order and keeps unrevealed comparisons masked', () => {
    const payload = buildAnnotationRowDetailPayload(row, {
      textColumn: 'text',
      annotationColumn: 'annotation',
      annotationValue: 'new',
      correctionColumn: null,
      comparisonColumns: ['reviewer', 'second'],
      revealedComparisonColumns: new Set(['second']),
      metadataColumns: ['url'],
    });

    expect(payload.textColumn).toBe('text');
    expect(payload.record).toEqual({
      text: 'Full text',
      annotation: 'new',
      reviewer: HIDDEN_COMPARISON_TEXT,
      second: 'covid',
      url: 'https://x',
    });
    expect(Object.keys(payload.record)).toEqual([
      'text',
      'annotation',
      'reviewer',
      'second',
      'url',
    ]);
  });
});
