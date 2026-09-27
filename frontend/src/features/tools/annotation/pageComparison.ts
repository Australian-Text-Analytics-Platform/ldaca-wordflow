import type { AnnotationComparison, AnnotationPrediction } from '@/features/project/api';

/** Preview is bounded to one page. Presentation comparisons never submit another prediction. */
export function pageComparison(
  column: string,
  predictions: AnnotationPrediction[],
  values: unknown[],
  codes: string[] | null,
): AnnotationComparison {
  const valid = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const label = value.trim();
    return codes === null || codes.includes(label) ? label : null;
  };
  const result: AnnotationComparison = {
    column,
    included: 0,
    excluded: 0,
    agreement: null,
    kappa: null,
    alpha: null,
    matrix: [],
  };
  const margins = new Map<string, { a: number; b: number }>();
  let agreements = 0;
  for (const [index, prediction] of predictions.entries()) {
    const a = prediction?.status === 'success' ? valid(prediction.label) : null;
    const b = valid(values[index]);
    if (a === null || b === null) {
      result.excluded++;
      continue;
    }
    result.included++;
    if (a === b) agreements++;
    const left = margins.get(a) ?? { a: 0, b: 0 };
    left.a++;
    margins.set(a, left);
    const right = margins.get(b) ?? { a: 0, b: 0 };
    right.b++;
    margins.set(b, right);
    const pair = result.matrix.find((p) => p.annotation === a && p.comparison === b);
    if (pair) pair.count++;
    else result.matrix.push({ annotation: a, comparison: b, count: 1 });
  }
  result.matrix.sort(
    (a, b) => a.annotation.localeCompare(b.annotation) || a.comparison.localeCompare(b.comparison),
  );
  const n = result.included;
  if (!n) return result;
  const observed = agreements / n;
  const expected = [...margins.values()].reduce((sum, m) => sum + (m.a / n) * (m.b / n), 0);
  result.agreement = observed;
  if (expected < 1) result.kappa = (observed - expected) / (1 - expected);
  const ratings = 2 * n;
  const same = [...margins.values()].reduce((sum, m) => sum + (m.a + m.b) * (m.a + m.b - 1), 0);
  const disagreement = 1 - same / (ratings * (ratings - 1));
  if (disagreement > 0) result.alpha = 1 - (1 - observed) / disagreement;
  return result;
}
