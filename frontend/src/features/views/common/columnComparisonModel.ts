export interface ConfusionCount {
  reference: string;
  comparison: string;
  count: number;
}

export const INTERCODER_RELIABILITY_METRICS = [
  { value: 'percent_agreement', label: 'Percent Agreement', symbol: '%' },
  { value: 'cohens_kappa', label: 'Cohen’s Kappa', symbol: 'κ' },
  { value: 'krippendorffs_alpha', label: 'Krippendorff’s Alpha', symbol: 'α' },
] as const;

export type IntercoderReliabilityMetric = (typeof INTERCODER_RELIABILITY_METRICS)[number]['value'];

export const DEFAULT_INTERCODER_RELIABILITY_METRIC: IntercoderReliabilityMetric = 'cohens_kappa';

export const isIntercoderReliabilityMetric = (
  value: string,
): value is IntercoderReliabilityMetric =>
  INTERCODER_RELIABILITY_METRICS.some((metric) => metric.value === value);

interface ReferenceComparisonEdit {
  previousReference: string | null;
  nextReference: string | null;
  comparison: string | null;
}

/** Applies one persisted reference-cell edit to an aggregate confusion matrix. */
export const applyReferenceComparisonEdit = (
  rows: ConfusionCount[],
  { previousReference, nextReference, comparison }: ReferenceComparisonEdit,
): ConfusionCount[] => {
  if (comparison === null || previousReference === nextReference) return rows;

  const counts = new Map<string, ConfusionCount>(
    rows.map((row) => [JSON.stringify([row.reference, row.comparison]), { ...row }] as const),
  );
  const adjust = (reference: string, delta: number) => {
    const key = JSON.stringify([reference, comparison]);
    const current = counts.get(key);
    const count = (current?.count ?? 0) + delta;
    if (count <= 0) counts.delete(key);
    else counts.set(key, { reference, comparison, count });
  };

  if (previousReference !== null) adjust(previousReference, -1);
  if (nextReference !== null) adjust(nextReference, 1);

  return Array.from(counts.values()).sort(
    (left, right) =>
      left.reference.localeCompare(right.reference) ||
      left.comparison.localeCompare(right.comparison),
  );
};

/** Calculates chance-corrected agreement from confusion-matrix counts. */
export const calculateCohensKappa = (rows: ConfusionCount[]): number | null => {
  const referenceTotals = new Map<string, number>();
  const comparisonTotals = new Map<string, number>();
  let total = 0;
  let agreements = 0;

  rows.forEach((row) => {
    total += row.count;
    referenceTotals.set(row.reference, (referenceTotals.get(row.reference) ?? 0) + row.count);
    comparisonTotals.set(row.comparison, (comparisonTotals.get(row.comparison) ?? 0) + row.count);
    if (row.reference === row.comparison) agreements += row.count;
  });

  if (total === 0) return null;
  const labels = new Set([...referenceTotals.keys(), ...comparisonTotals.keys()]);
  const observedAgreement = agreements / total;
  const expectedAgreement =
    Array.from(labels).reduce(
      (sum, label) => sum + (referenceTotals.get(label) ?? 0) * (comparisonTotals.get(label) ?? 0),
      0,
    ) /
    total ** 2;
  if (expectedAgreement === 1) return null;
  return (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
};

/** Calculates the observed share of exact label matches. */
export const calculatePercentAgreement = (rows: ConfusionCount[]): number | null => {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;
  const agreements = rows.reduce(
    (sum, row) => sum + (row.reference === row.comparison ? row.count : 0),
    0,
  );
  return agreements / total;
};

/** Calculates nominal Krippendorff’s Alpha for two annotation columns. */
export const calculateKrippendorffsAlpha = (rows: ConfusionCount[]): number | null => {
  const categoryTotals = new Map<string, number>();
  let pairCount = 0;
  let disagreements = 0;

  rows.forEach((row) => {
    pairCount += row.count;
    categoryTotals.set(row.reference, (categoryTotals.get(row.reference) ?? 0) + row.count);
    categoryTotals.set(row.comparison, (categoryTotals.get(row.comparison) ?? 0) + row.count);
    if (row.reference !== row.comparison) disagreements += row.count;
  });

  const valueCount = pairCount * 2;
  if (pairCount === 0 || valueCount < 2) return null;
  const observedDisagreement = disagreements / pairCount;
  const expectedDisagreement =
    (valueCount ** 2 -
      Array.from(categoryTotals.values()).reduce((sum, count) => sum + count ** 2, 0)) /
    (valueCount * (valueCount - 1));
  if (expectedDisagreement === 0) return null;
  return 1 - observedDisagreement / expectedDisagreement;
};

/**
 * An ordered-scale codebook (Chao, 16 Nov 2026): its levels, lowest first,
 * and the codes outside the scale, such as Not applicable.
 */
export interface OrderedScale {
  levels: readonly string[];
  outside: readonly string[];
}

/** A scale codebook's classes, in order: those named in ``outside`` are not levels. */
export const orderedScale = (
  classes: readonly string[],
  outside: readonly string[],
): OrderedScale => ({
  levels: classes.filter((name) => !outside.includes(name)),
  outside: classes.filter((name) => outside.includes(name)),
});

/**
 * Ordered-scale statistics. A near miss between levels is a smaller
 * disagreement than a far one, scaled so the lowest against the highest
 * level costs 1. A code outside the scale is not near any level: against a
 * level or another outside code it costs 1, as much as the two most distant
 * levels, and against itself 0. Pairs with a label that is neither are left
 * out (the comparison queries already keep only codebook labels).
 */
const scalePairs = (rows: ConfusionCount[], scale: OrderedScale) => {
  const codes = [...scale.levels, ...scale.outside];
  const position = new Map(codes.map((label, index) => [label, index] as const));
  const pairs = rows.flatMap((row) => {
    const reference = position.get(row.reference);
    const comparison = position.get(row.comparison);
    return reference === undefined || comparison === undefined || row.count <= 0
      ? []
      : [{ reference, comparison, count: row.count }];
  });
  return { codeCount: codes.length, levelCount: scale.levels.length, pairs };
};

/**
 * Cohen’s Kappa with quadratic weights: a disagreement between levels costs
 * the squared distance in levels, over the squared width of the scale.
 */
export const calculateWeightedKappa = (
  rows: ConfusionCount[],
  scale: OrderedScale,
): number | null => {
  const { codeCount, levelCount, pairs } = scalePairs(rows, scale);
  if (levelCount < 2) return null;
  const weight = (first: number, second: number): number =>
    first < levelCount && second < levelCount
      ? ((first - second) / (levelCount - 1)) ** 2
      : first === second
        ? 0
        : 1;
  const referenceTotals = new Array<number>(codeCount).fill(0);
  const comparisonTotals = new Array<number>(codeCount).fill(0);
  let total = 0;
  let observed = 0;
  pairs.forEach(({ reference, comparison, count }) => {
    total += count;
    referenceTotals[reference] = (referenceTotals[reference] ?? 0) + count;
    comparisonTotals[comparison] = (comparisonTotals[comparison] ?? 0) + count;
    observed += weight(reference, comparison) * count;
  });
  if (total === 0) return null;
  let expected = 0;
  referenceTotals.forEach((referenceCount, reference) => {
    comparisonTotals.forEach((comparisonCount, comparison) => {
      expected += (weight(reference, comparison) * referenceCount * comparisonCount) / total;
    });
  });
  if (expected === 0) return null;
  return 1 - observed / expected;
};

/**
 * Krippendorff’s Alpha with the ordinal distance between levels, scaled so
 * the lowest against the highest level is 1, for two annotation columns.
 */
export const calculateOrdinalAlpha = (
  rows: ConfusionCount[],
  scale: OrderedScale,
): number | null => {
  const { codeCount, levelCount, pairs } = scalePairs(rows, scale);
  if (levelCount < 2) return null;
  // Coincidence matrix: each coded pair counts once in each direction.
  const coincidences = Array.from({ length: codeCount }, () =>
    new Array<number>(codeCount).fill(0),
  );
  const coincide = (first: number, second: number, count: number) => {
    const row = coincidences[first];
    if (row) row[second] = (row[second] ?? 0) + count;
  };
  pairs.forEach(({ reference, comparison, count }) => {
    coincide(reference, comparison, count);
    coincide(comparison, reference, count);
  });
  const codeTotals = coincidences.map((row) => row.reduce((sum, count) => sum + count, 0));
  const valueCount = codeTotals.reduce((sum, count) => sum + count, 0);
  if (valueCount < 2) return null;
  const codeTotal = (code: number): number => codeTotals[code] ?? 0;
  // Ordinal distance: the values lying between two levels, inclusive, minus half of each end.
  const ordinal = (low: number, high: number): number => {
    let between = 0;
    for (let level = low; level <= high; level += 1) between += codeTotal(level);
    return (between - (codeTotal(low) + codeTotal(high)) / 2) ** 2;
  };
  const widest = ordinal(0, levelCount - 1);
  const distance = (first: number, second: number): number =>
    first < levelCount && second < levelCount
      ? widest === 0
        ? 0
        : ordinal(first, second) / widest
      : 1;
  let observed = 0;
  let expected = 0;
  for (let first = 0; first < codeCount; first += 1) {
    for (let second = first + 1; second < codeCount; second += 1) {
      const squared = distance(first, second);
      observed += 2 * (coincidences[first]?.[second] ?? 0) * squared;
      expected += 2 * codeTotal(first) * codeTotal(second) * squared;
    }
  }
  if (expected === 0) return null;
  return 1 - ((valueCount - 1) * observed) / expected;
};

/**
 * The chosen statistic. With an ordered ``scale``, Kappa is weighted and
 * Alpha ordinal; Percent Agreement stays exact matches.
 */
export const calculateIntercoderReliability = (
  rows: ConfusionCount[],
  metric: IntercoderReliabilityMetric,
  scale?: OrderedScale | null,
): number | null => {
  if (metric === 'percent_agreement') return calculatePercentAgreement(rows);
  if (metric === 'krippendorffs_alpha') {
    return scale ? calculateOrdinalAlpha(rows, scale) : calculateKrippendorffsAlpha(rows);
  }
  return scale ? calculateWeightedKappa(rows, scale) : calculateCohensKappa(rows);
};

/** The statistic's name; on a scale, Kappa is weighted and Alpha ordinal. */
export const intercoderReliabilityLabel = (
  metric: IntercoderReliabilityMetric,
  ordered = false,
): string => {
  const label = INTERCODER_RELIABILITY_METRICS.find((option) => option.value === metric)?.label;
  if (!ordered || metric === 'percent_agreement') return label ?? '';
  return metric === 'cohens_kappa' ? `${label ?? ''} (weighted)` : `${label ?? ''} (ordinal)`;
};

/** The short symbol on the score badge: κ, or κw for weighted Kappa, α or αo for ordinal Alpha. */
export const intercoderReliabilitySymbol = (
  metric: IntercoderReliabilityMetric,
  ordered = false,
): string => {
  const symbol = INTERCODER_RELIABILITY_METRICS.find((option) => option.value === metric)?.symbol;
  if (!ordered || metric === 'percent_agreement') return symbol ?? '';
  return metric === 'cohens_kappa' ? 'κw' : 'αo';
};

export const formatIntercoderReliability = (
  value: number,
  metric: IntercoderReliabilityMetric,
  ordered = false,
): string =>
  metric === 'percent_agreement'
    ? `${(value * 100).toFixed(1)}%`
    : `${intercoderReliabilitySymbol(metric, ordered)} ${value.toFixed(3)}`;
