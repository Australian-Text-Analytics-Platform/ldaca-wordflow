import { expect, it } from 'vitest';
import { pageComparison } from './pageComparison';
it('matches native nominal agreement with missing, invalid and failed predictions excluded', () => {
  const predictions = ['A', 'A', 'B', 'B', null, 'obsolete'].map((label) => ({
    status: 'success' as const,
    label,
  }));
  const value = pageComparison(
    'reference',
    [...predictions, { status: 'failed', error: { code: 'failed', message: 'failed' } }],
    ['A', 'B', 'A', 'B', 'A', 'A', 'A'],
    ['A', 'B'],
  );
  expect(value).toMatchObject({ included: 4, excluded: 3, agreement: 0.5, kappa: 0, alpha: 0.125 });
});
it('keeps exact case and excludes degenerate coefficients', () => {
  expect(
    pageComparison('label', [{ status: 'success', label: ' A ' }], ['A'], ['A']),
  ).toMatchObject({ agreement: 1, kappa: null, alpha: null });
  expect(pageComparison('label', [{ status: 'success', label: 'A' }], ['a'], ['A'])).toMatchObject({
    included: 0,
    excluded: 1,
  });
});
