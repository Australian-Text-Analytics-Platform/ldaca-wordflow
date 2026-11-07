import { formatChartDate, parsePeriodLabel, type ChartDateUnit } from '@/lib/chartDates';
import type { SequentialAnalysisRequest, SequentialAnalysisResponse } from '@/api';
import type { MultiSeriesChartSeries } from '@/features/views/common/components/MultiSeriesChart';
import type { ChartExportLegendItem } from '@/lib/chartExport';
import type { XAxisComponentOption } from 'echarts/types/dist/option';
import { formatterFromSpec, portableFormatter } from '@/lib/chartHtml/portableFormatter';

type SequentialAnalysisDatum = Record<string, unknown>;
export type ChartTypeOption = 'line' | 'bar' | 'stacked-bar' | 'area';
export type SequentialXAxisType = 'category' | 'number';
/**
 * What the X axis column holds; "category" is one position per category value
 * (issue 318), "elapsed" elapsed time in seconds, labelled like 7:58 (issue 324).
 */
export type SequentialColumnType = 'datetime' | 'numeric' | 'category' | 'elapsed';
/**
 * What the chart's values are (Show as). Composition is each group's share of
 * its period's rows (issue 219). The other rates divide a group's rows by the
 * reference Data Block's words or rows in the same period and group.
 */
export type SequentialScale =
  | 'count'
  | 'composition'
  | 'per-million-words'
  | 'per-100k-words'
  | 'percent-of-rows';
export const SEQUENTIAL_SCALE_LABELS: Record<SequentialScale, string> = {
  count: 'Count',
  composition: 'Composition (% of period)',
  'per-million-words': 'Per million words',
  'per-100k-words': 'Per 100,000 words',
  'percent-of-rows': '% of reference rows',
};
/** The vertical axis title for each scale. */
export const SEQUENTIAL_SCALE_AXIS_NAMES: Record<SequentialScale, string> = {
  count: 'Rows',
  composition: '% of period',
  'per-million-words': 'Per million words',
  'per-100k-words': 'Per 100,000 words',
  'percent-of-rows': '% of reference rows',
};
const SCALE_FACTORS: Record<Exclude<SequentialScale, 'count' | 'composition'>, number> = {
  'per-million-words': 1_000_000,
  'per-100k-words': 100_000,
  'percent-of-rows': 100,
};
/** "Plain words" for the native tokeniser; other models keep their id. */
const tokenizerModelLabel = (model: string | null | undefined): string =>
  model === 'native:plain_words_en' ? 'Plain words' : (model ?? '');

/** "words in 'text' (Plain words)" or "rows": what a reference's totals count. */
const referenceMeasure = (reference: SequentialReferenceSummary, rows: boolean): string =>
  rows || !reference.textColumn
    ? 'rows'
    : `words in '${reference.textColumn}' (${tokenizerModelLabel(reference.tokenizerModel)})`;

/** The sentence under a chart that shows rates, naming what they divide by. */
export interface SequentialReferenceNote {
  /** What the rates divide by, and how the totals are grouped. */
  divides: string;
  /**
   * The Group By columns the reference lacks, whose groups share a period's
   * total: the clause to stress, then its consequence. Null when the totals
   * are grouped like the result.
   */
  missing: { columns: string; effect: string } | null;
}

export function referenceNote(
  reference: SequentialReferenceSummary,
  rows: boolean,
): SequentialReferenceNote {
  const by =
    reference.groupBy.length > 0
      ? `period and ${reference.groupBy.map((column) => `'${column}'`).join(', ')}`
      : 'period';
  const missing =
    reference.ignoredGroupBy.length > 0
      ? {
          columns: `${reference.ignoredGroupBy.map((column) => `'${column}'`).join(', ')} ${
            reference.ignoredGroupBy.length === 1 ? 'is' : 'are'
          } not in the reference`,
          effect: ", so every group of it shares the period's total.",
        }
      : null;
  return {
    divides: `Rates divide each group's rows by the ${referenceMeasure(reference, rows)} of '${reference.nodeName}' in the same ${by}.`,
    missing,
  };
}
type SequentialFrequency = NonNullable<SequentialAnalysisRequest['frequency']>;
type SequentialCustomIntervalUnit = NonNullable<SequentialAnalysisRequest['custom_interval_unit']>;

export const DEFAULT_MINIMUM_GROUP_COUNT = 10;

const NUMERIC_X_KEY = '__x_numeric__';
/** Raw count kept beside a normalised value, for the tooltip (issue 219). */
const COUNT_KEY_PREFIX = '__count__:';
/** The reference's words or rows a rate divides by, for the tooltip. */
const DENOMINATOR_KEY_PREFIX = '__denominator__:';
const CATEGORY_X_KEY = '__period_key__';

const SEQUENTIAL_ANALYSIS_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#ec4899',
  '#0ea5e9',
  '#22c55e',
] as const;

/** Assigns deterministic colours shared by chart, legend, and export metadata. */
const getSequentialPaletteColor = (index: number) => {
  const colorIndex = index % SEQUENTIAL_ANALYSIS_PALETTE.length;
  return SEQUENTIAL_ANALYSIS_PALETTE.reduce<string>(
    (selected, color, paletteIndex) => (paletteIndex === colorIndex ? color : selected),
    SEQUENTIAL_ANALYSIS_PALETTE[0],
  );
};

/**
 * The date precision of a result's periods, for chart labels (issue 213):
 * sub-day periods show the time, weeks and days the date, and so on.
 */
const chartDateUnitFor = (
  frequency: SequentialFrequency,
  customUnit: SequentialCustomIntervalUnit | null,
): ChartDateUnit => {
  switch (frequency) {
    case 'second':
      return 'second';
    case 'minute':
    case 'hourly':
      return 'minute';
    case 'daily':
    case 'weekly':
      return 'day';
    case 'monthly':
      return 'month';
    case 'quarterly':
      return 'quarter';
    case 'yearly':
      return 'year';
    case 'custom':
      return customUnit === 'seconds'
        ? 'second'
        : customUnit === 'minutes' || customUnit === 'hours'
          ? 'minute'
          : 'day';
  }
};

/** Formats a linear-axis coordinate according to the result's declared domain. */
function formatSequentialAxisTick(
  value: unknown,
  columnType: SequentialColumnType,
  formatInstant: (ms: number) => string,
): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (columnType === 'elapsed') return ELAPSED_TICK(numeric);
  return columnType === 'datetime' ? formatInstant(numeric) : String(numeric);
}

const ELAPSED_TICK = formatterFromSpec({ kind: 'elapsed' }, formatChartDate);

export interface SequentialResultSummaryFallbacks {
  timeColumn: string;
  groupBy: string[];
  columnType: SequentialColumnType;
  numericOrigin: number | null;
  numericInterval: number | null;
  frequency: SequentialFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: SequentialCustomIntervalUnit | null;
}

type SequentialChartParameters = Partial<
  Pick<
    SequentialAnalysisRequest,
    | 'time_column'
    | 'group_by_columns'
    | 'column_type'
    | 'numeric_origin'
    | 'numeric_interval'
    | 'frequency'
    | 'custom_interval_value'
    | 'custom_interval_unit'
  >
>;

interface SequentialResultSummary {
  timeColumn: string;
  groupBy: string[];
  columnType: SequentialColumnType;
  numericOrigin: number | null;
  numericInterval: number | null;
  rawFrequency: SequentialFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: SequentialCustomIntervalUnit | null;
  frequencyDisplay: string;
  /** The reference Data Block the result was normalised against, if any. */
  reference: SequentialReferenceSummary | null;
}

export interface SequentialReferenceSummary {
  nodeName: string;
  /** The text column whose words were counted, or null for rows only. */
  textColumn: string | null;
  tokenizerModel: string | null;
  /** The group columns the reference shares, which split its totals. */
  groupBy: string[];
  /** Group columns the reference lacks: their groups share a period's total. */
  ignoredGroupBy: string[];
}

interface SequentialChartDiagnostic {
  code:
    | 'invalid-group-columns'
    | 'invalid-period'
    | 'invalid-count'
    | 'invalid-group-value'
    | 'invalid-result-index'
    | 'invalid-parameters';
  message: string;
  rowIndex?: number;
}

type SequentialGroupValue = string | number | boolean | null;

interface SequentialCanonicalRow {
  periodIndex: number;
  periodKey: string;
  timePeriod: string | number;
  axisValue: string | number;
  periodStart: string | number;
  periodEnd: string | number;
  count: number;
  groupId: string;
  groupIndex: number;
  groupLabel: string;
  groupValues: Record<string, SequentialGroupValue>;
  /** The reference's rows and words for this period and shared group, when known. */
  referenceRows: number | null;
  referenceWords: number | null;
  /** The shared group values a reference total belongs to, as one key. */
  denominatorKey: string;
}

interface SequentialChartGroup {
  id: string;
  index: number;
  label: string;
  color: string;
  hidden: boolean;
  values: Record<string, SequentialGroupValue>;
  memberGroupIndices: number[];
  totalCount: number;
  selectedCount: number;
  legendText: string;
}

interface SequentialVisibilityCounts {
  totalPointCount: number;
  totalDocumentCount: number;
  shownPointCount: number;
  shownDocumentCount: number;
  chosenPointCount: number;
  chosenDocumentCount: number;
}

export interface BuildSequentialChartModelInput {
  results: SequentialAnalysisResponse | null | undefined;
  parameters: SequentialChartParameters | null | undefined;
  fallbacks: SequentialResultSummaryFallbacks;
  chartType: ChartTypeOption;
  xAxisType: SequentialXAxisType;
  minimumGroupCount: number;
  uncased: boolean;
  excludedGroupIndices: Set<number>;
  selectedPeriodIndices: Set<number>;
  /** Series name when nothing is grouped: the Data Block's name (#205 item 21). */
  ungroupedLabel?: string;
  /** Show as: counts, composition, or a rate against the reference Data Block. */
  scale?: SequentialScale;
}

export interface SequentialChartModel {
  chartType: ChartTypeOption;
  xAxisType: SequentialXAxisType;
  uncased: boolean;
  status: 'ready' | 'empty' | 'malformed';
  diagnostics: SequentialChartDiagnostic[];
  summary: SequentialResultSummary;
  chartData: SequentialAnalysisDatum[];
  axisData: SequentialAnalysisDatum[];
  xKey: typeof CATEGORY_X_KEY | typeof NUMERIC_X_KEY;
  xAxis: XAxisComponentOption;
  tooltip: {
    labelFormatter: (value: string | number) => string;
    /** Tooltip text for one group in one period: the count, and its share when normalised. */
    valueFormatter: (seriesKey: string, row: Record<string, unknown>) => string;
  };
  /**
   * The scale the chart shows, and those it can show: composition needs two
   * groups that meet the minimum group count (issue 219), the rates a
   * reference Data Block with words or rows.
   */
  scale: SequentialScale;
  availableScales: SequentialScale[];
  /** Rows counted in one group and period, also when the chart shows percentages (issue 269). */
  overviewValue: (row: Record<string, unknown>, seriesKey: string) => number;
  groups: SequentialChartGroup[];
  groupFilter: {
    minimumCount: number;
    filteredGroupCount: number;
    totalGroupCount: number;
  };
  supportsUncased: boolean;
  series: MultiSeriesChartSeries[];
  legend: ChartExportLegendItem[];
  selection: {
    selectedIndices: Set<number>;
    selectedCount: number;
    hasInvalidSelection: boolean;
    selectedPeriodIds: number[];
  };
  excludedGroupIndices: number[];
  eligibleDocumentCount: number;
  counts: SequentialVisibilityCounts;
}

function buildReferenceSummary(
  results: SequentialAnalysisResponse | null | undefined,
): SequentialReferenceSummary | null {
  // Tests and older results may lack a source.
  const source: SequentialAnalysisResponse['source'] | undefined = results?.source;
  const reference = source?.reference;
  if (!reference) return null;
  return {
    nodeName: reference.node_name,
    textColumn: reference.text_column ?? null,
    tokenizerModel: reference.tokenizer_model ?? null,
    groupBy: reference.group_by_columns,
    ignoredGroupBy: reference.ignored_group_by_columns,
  };
}

function buildSummary(
  parameters: SequentialChartParameters | null | undefined,
  fallbacks: SequentialResultSummaryFallbacks,
  diagnostics: SequentialChartDiagnostic[],
  reference: SequentialReferenceSummary | null,
): SequentialResultSummary {
  const timeColumn = parameters?.time_column ?? fallbacks.timeColumn;
  let groupBy = fallbacks.groupBy;
  if (parameters?.group_by_columns) {
    const validColumns = parameters.group_by_columns.filter((column) => column.trim().length > 0);
    groupBy = Array.from(new Set(validColumns));
    if (
      validColumns.length !== parameters.group_by_columns.length ||
      groupBy.length !== validColumns.length
    ) {
      diagnostics.push({
        code: 'invalid-group-columns',
        message: 'Ignored blank or duplicate group-by columns.',
      });
    }
  }
  const columnType = parameters?.column_type ?? fallbacks.columnType;
  const numericOrigin =
    columnType === 'numeric' ? (parameters?.numeric_origin ?? fallbacks.numericOrigin) : null;
  let numericInterval =
    columnType === 'numeric' ? (parameters?.numeric_interval ?? fallbacks.numericInterval) : null;
  const rawFrequency = parameters?.frequency ?? fallbacks.frequency;
  let customIntervalValue = parameters?.custom_interval_value ?? fallbacks.customIntervalValue;
  const customIntervalUnit = parameters?.custom_interval_unit ?? fallbacks.customIntervalUnit;
  if (columnType === 'numeric' && (numericInterval === null || numericInterval <= 0)) {
    if (parameters?.numeric_interval !== undefined) {
      diagnostics.push({
        code: 'invalid-parameters',
        message: 'Result numeric interval was not a positive finite number.',
      });
    }
    numericInterval = null;
  }
  if (
    rawFrequency === 'custom' &&
    (customIntervalValue === null ||
      !Number.isInteger(customIntervalValue) ||
      customIntervalValue <= 0)
  ) {
    if (parameters?.custom_interval_value !== undefined) {
      diagnostics.push({
        code: 'invalid-parameters',
        message: 'Result custom interval was not a positive whole number.',
      });
    }
    customIntervalValue = null;
  }
  const frequencyDisplay =
    columnType === 'category'
      ? 'One bar per value'
      : columnType === 'numeric'
        ? 'Numeric bins'
        : rawFrequency === 'custom'
          ? customIntervalValue && customIntervalUnit
            ? `Every ${String(customIntervalValue)} ${customIntervalUnit}`
            : 'Custom interval'
          : rawFrequency;
  return {
    timeColumn,
    groupBy,
    columnType,
    numericOrigin,
    numericInterval,
    rawFrequency,
    customIntervalValue,
    customIntervalUnit,
    frequencyDisplay,
    reference,
  };
}

/**
 * A finite non-negative number, or null when absent (no reference total).
 * The reference totals are Int64 columns, which the Arrow decoder hands over
 * as digit strings; the hit count is UInt32 and arrives as a number.
 */
function optionalCount(value: unknown): number | null {
  const count = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
}

function isPeriodBoundary(value: unknown): value is string | number {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim().length > 0)
  );
}

function periodCoordinate(value: string | number, columnType: SequentialColumnType): number {
  // A category axis is placed by its period index (normalizeRows).
  if (columnType !== 'datetime') {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }
  return new Date(value).getTime();
}

function normalizeGroupValue(value: unknown): SequentialGroupValue | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function buildGroupIdentity(
  row: Record<string, unknown>,
  groupBy: string[],
): {
  id: string;
  index: number;
  label: string;
  values: Record<string, SequentialGroupValue>;
} | null {
  const groupIndex = row.group_index;
  if (!Number.isInteger(groupIndex) || Number(groupIndex) < 0) return null;
  if (groupBy.length === 0) {
    return {
      id: `group:${String(groupIndex)}`,
      index: Number(groupIndex),
      label: 'Count',
      values: {},
    };
  }
  const values = Object.create(null) as Record<string, SequentialGroupValue>;
  const tuple: SequentialGroupValue[] = [];
  for (const column of groupBy) {
    const value = normalizeGroupValue(row[column]);
    if (value === undefined) return null;
    values[column] = value;
    tuple.push(value);
  }
  return {
    id: `group:${String(groupIndex)}`,
    index: Number(groupIndex),
    label: tuple.map((value) => String(value ?? '')).join(' - '),
    values,
  };
}

function caseFoldedGroupId(
  values: Record<string, SequentialGroupValue>,
  groupBy: string[],
): string {
  const tuple = groupBy.map((column) => {
    const value = values[column] ?? null;
    if (typeof value === 'string') return ['string', value.toLowerCase()];
    if (value === null) return ['null'];
    return [typeof value, value];
  });
  return `uncased:${encodeURIComponent(JSON.stringify(tuple))}`;
}

/** Joins exact display labels with the fully lowercase spelling first when present. */
function joinCaseVariantLabels(labels: readonly string[]): string {
  return Array.from(new Set(labels))
    .sort((left, right) => {
      const leftLowercase = left === left.toLowerCase();
      const rightLowercase = right === right.toLowerCase();
      if (leftLowercase !== rightLowercase) return leftLowercase ? -1 : 1;
      return left.localeCompare(right);
    })
    .join('/');
}

function normalizeRows(
  results: SequentialAnalysisResponse | null | undefined,
  summary: SequentialResultSummary,
  diagnostics: SequentialChartDiagnostic[],
): SequentialCanonicalRow[] {
  const data = results?.data ?? [];

  const rows: SequentialCanonicalRow[] = [];
  data.forEach((row, rowIndex) => {
    if (!Number.isInteger(row.period_index) || Number(row.period_index) < 0) {
      diagnostics.push({
        code: 'invalid-result-index',
        message: 'Ignored a row without a valid period index.',
        rowIndex,
      });
      return;
    }
    // A category position has no start, end or raw value; its period index places
    // it, and time_period_formatted labels it (issue 318).
    const isCategory = summary.columnType === 'category';
    const periodStart = isCategory ? Number(row.period_index) : row.period_start;
    const periodEnd = isCategory ? Number(row.period_index) : row.period_end;
    if (!isPeriodBoundary(periodStart) || !isPeriodBoundary(periodEnd)) {
      diagnostics.push({
        code: 'invalid-period',
        message: 'Ignored a row with missing period boundaries.',
        rowIndex,
      });
      return;
    }
    const startCoordinate = periodCoordinate(periodStart, summary.columnType);
    const endCoordinate = periodCoordinate(periodEnd, summary.columnType);
    if (
      !Number.isFinite(startCoordinate) ||
      !Number.isFinite(endCoordinate) ||
      endCoordinate < startCoordinate
    ) {
      diagnostics.push({
        code: 'invalid-period',
        message: `Ignored a row whose period is invalid or inverted for ${summary.columnType} results.`,
        rowIndex,
      });
      return;
    }
    if (
      typeof row.sequential_count !== 'number' ||
      !Number.isFinite(row.sequential_count) ||
      row.sequential_count < 0
    ) {
      diagnostics.push({
        code: 'invalid-count',
        message: 'Ignored a row whose sequential count was not a non-negative finite number.',
        rowIndex,
      });
      return;
    }
    const group = buildGroupIdentity(row, summary.groupBy);
    if (!group) {
      diagnostics.push({
        code: 'invalid-group-value',
        message: 'Ignored a row with an unsupported group value.',
        rowIndex,
      });
      return;
    }
    const rawTimePeriod = isCategory
      ? Number(row.period_index)
      : isPeriodBoundary(row.time_period)
        ? row.time_period
        : null;
    if (
      rawTimePeriod === null ||
      !Number.isFinite(periodCoordinate(rawTimePeriod, summary.columnType))
    ) {
      diagnostics.push({
        code: 'invalid-period',
        message: 'Ignored a row without a valid raw time-period value.',
        rowIndex,
      });
      return;
    }
    const timePeriod = isPeriodBoundary(row.time_period_formatted)
      ? row.time_period_formatted
      : rawTimePeriod;
    const denominatorGroupBy = summary.reference?.groupBy ?? [];
    rows.push({
      periodIndex: Number(row.period_index),
      periodKey: String(row.period_index),
      timePeriod,
      axisValue: rawTimePeriod,
      periodStart,
      periodEnd,
      count: row.sequential_count,
      groupId: group.id,
      groupIndex: group.index,
      groupLabel: group.label,
      groupValues: group.values,
      referenceRows: optionalCount(row.reference_rows),
      referenceWords: optionalCount(row.reference_words),
      denominatorKey: JSON.stringify(
        denominatorGroupBy.map((column) => group.values[column] ?? null),
      ),
    });
  });
  return rows.sort((left, right) => {
    return (
      periodCoordinate(left.axisValue, summary.columnType) -
      periodCoordinate(right.axisValue, summary.columnType)
    );
  });
}

/**
 * Builds the complete render and export domain for one Sequential result.
 *
 * Used by: `SequentialAnalysisFeature`, which keeps task submission and chart
 * interaction state outside this pure boundary. Flow: validate saved params and
 * rows, normalize one canonical row representation, assign collision-safe
 * series ids, pivot/backfill/sort chart rows, build category/linear axis data,
 * and derive series, legend, visibility counts, and selection metadata from that
 * same source. Partial valid rows remain usable while diagnostics make malformed
 * payloads explicit instead of trusting casts or silent fallbacks.
 */
export function buildSequentialChartModel({
  results,
  parameters,
  fallbacks,
  chartType: requestedChartType,
  xAxisType: requestedXAxisType,
  minimumGroupCount,
  uncased,
  excludedGroupIndices,
  selectedPeriodIndices,
  ungroupedLabel,
  scale: requestedScale = 'count',
}: BuildSequentialChartModelInput): SequentialChartModel {
  const diagnostics: SequentialChartDiagnostic[] = [];
  const summary = buildSummary(parameters, fallbacks, diagnostics, buildReferenceSummary(results));
  // Categories have no distance between them, so they are always evenly spaced (issue 318).
  const xAxisType: SequentialXAxisType =
    summary.columnType === 'category' ? 'category' : requestedXAxisType;
  // Lines and areas suggest a progression between categories; they show as bars.
  const chartType: ChartTypeOption =
    summary.columnType === 'category' &&
    (requestedChartType === 'line' || requestedChartType === 'area')
      ? 'bar'
      : requestedChartType;
  const canonicalRows = normalizeRows(results, summary, diagnostics);

  const groupsById = new Map<
    string,
    Pick<SequentialChartGroup, 'id' | 'index' | 'label' | 'values'>
  >();
  canonicalRows.forEach((row) => {
    groupsById.set(row.groupId, {
      id: row.groupId,
      index: row.groupIndex,
      label: summary.groupBy.length === 0 && ungroupedLabel ? ungroupedLabel : row.groupLabel,
      values: row.groupValues,
    });
  });
  const exactGroupBases = Array.from(groupsById.values()).sort(
    (left, right) => left.index - right.index,
  );

  const supportsUncased = exactGroupBases.some((group) =>
    Object.values(group.values).some((value) => typeof value === 'string'),
  );
  const displayGroupsById = new Map<
    string,
    Pick<SequentialChartGroup, 'id' | 'index' | 'label' | 'values' | 'memberGroupIndices'> & {
      labels: string[];
    }
  >();
  const displayIdByExactId = new Map<string, string>();
  exactGroupBases.forEach((group) => {
    const hasStringValue = Object.values(group.values).some((value) => typeof value === 'string');
    const id =
      uncased && hasStringValue ? caseFoldedGroupId(group.values, summary.groupBy) : group.id;
    displayIdByExactId.set(group.id, id);
    const existing = displayGroupsById.get(id);
    if (existing) {
      existing.memberGroupIndices.push(group.index);
      existing.labels.push(group.label);
      existing.label = joinCaseVariantLabels(existing.labels);
      return;
    }
    displayGroupsById.set(id, {
      id,
      index: group.index,
      label: group.label,
      labels: [group.label],
      values: group.values,
      memberGroupIndices: [group.index],
    });
  });
  const groupBases = Array.from(displayGroupsById.values())
    .sort((left, right) => left.index - right.index)
    .map(({ labels: _labels, ...group }) => group);

  const normalizedMinimumGroupCount = Number.isFinite(minimumGroupCount)
    ? Math.max(0, Math.floor(minimumGroupCount))
    : 0;
  const groupTotals = new Map<string, number>();
  canonicalRows.forEach((row) => {
    const displayId = displayIdByExactId.get(row.groupId) ?? row.groupId;
    groupTotals.set(displayId, (groupTotals.get(displayId) ?? 0) + row.count);
  });
  const countFilteredGroupIds = new Set(
    summary.groupBy.length === 0 || normalizedMinimumGroupCount === 0
      ? []
      : groupBases
          .filter((group) => (groupTotals.get(group.id) ?? 0) < normalizedMinimumGroupCount)
          .map((group) => group.id),
  );
  const countFilteredGroupIndices = new Set(
    groupBases
      .filter((group) => countFilteredGroupIds.has(group.id))
      .flatMap((group) => group.memberGroupIndices),
  );
  const effectiveExcludedGroupIndices = new Set([
    ...excludedGroupIndices,
    ...countFilteredGroupIndices,
  ]);
  const filterEligibleGroupBases = groupBases.filter(
    (group) => !countFilteredGroupIds.has(group.id),
  );

  const buckets = new Map<string, SequentialAnalysisDatum>();
  canonicalRows.forEach((row) => {
    const existing = buckets.get(row.periodKey);
    const entry = existing ?? {
      [CATEGORY_X_KEY]: row.periodKey,
      __period_index__: row.periodIndex,
      time_period: row.timePeriod,
      __axis_value__: row.axisValue,
      period_start: row.periodStart,
      period_end: row.periodEnd,
    };
    const displayId = displayIdByExactId.get(row.groupId) ?? row.groupId;
    if (!effectiveExcludedGroupIndices.has(row.groupIndex)) {
      entry[displayId] = Number(entry[displayId] ?? 0) + row.count;
    }
    if (existing) {
      if (
        periodCoordinate(row.periodStart, summary.columnType) <
        periodCoordinate(existing.period_start as string | number, summary.columnType)
      ) {
        entry.period_start = row.periodStart;
      }
      if (
        periodCoordinate(row.periodEnd, summary.columnType) >
        periodCoordinate(existing.period_end as string | number, summary.columnType)
      ) {
        entry.period_end = row.periodEnd;
      }
    }
    buckets.set(row.periodKey, entry);
  });
  const chartData = Array.from(buckets.values()).sort((left, right) => {
    return Number(left.__period_index__) - Number(right.__period_index__);
  });
  chartData.forEach((row) => {
    filterEligibleGroupBases.forEach((group) => {
      if (row[group.id] === undefined) row[group.id] = 0;
    });
  });
  // Composition (issue 219, as v0.8): a period's total adds up every group
  // that meets the minimum group count, hidden ones included, so hiding a
  // group never changes a percentage. A period with no rows has none.
  const availableScales: SequentialScale[] = ['count'];
  if (filterEligibleGroupBases.length >= 2) availableScales.push('composition');
  if (summary.reference?.textColumn) {
    availableScales.push('per-million-words', 'per-100k-words');
  }
  if (summary.reference) availableScales.push('percent-of-rows');
  const scale: SequentialScale = availableScales.includes(requestedScale)
    ? requestedScale
    : 'count';
  if (scale === 'composition') {
    const periodTotals = new Map<string, number>();
    canonicalRows.forEach((row) => {
      const displayId = displayIdByExactId.get(row.groupId) ?? row.groupId;
      if (countFilteredGroupIds.has(displayId)) return;
      periodTotals.set(row.periodKey, (periodTotals.get(row.periodKey) ?? 0) + row.count);
    });
    chartData.forEach((row) => {
      const total = periodTotals.get(String(row[CATEGORY_X_KEY])) ?? 0;
      filterEligibleGroupBases.forEach((group) => {
        const count = row[group.id];
        if (typeof count !== 'number') return;
        row[`${COUNT_KEY_PREFIX}${group.id}`] = count;
        row[group.id] = total > 0 ? (count / total) * 100 : null;
      });
    });
  } else if (scale !== 'count') {
    // A rate divides a group's rows by the reference's words or rows in the
    // same period and shared group. Groups merged by Ignore capitals, and
    // groups of a column the reference lacks, can share one reference total,
    // which counts once; a group without a total has no rate.
    interface Denominator {
      keys: Set<string>;
      total: number;
      missing: boolean;
    }
    const denominators = new Map<string, Map<string, Denominator>>();
    canonicalRows.forEach((row) => {
      const displayId = displayIdByExactId.get(row.groupId) ?? row.groupId;
      const perPeriod = denominators.get(row.periodKey) ?? new Map<string, Denominator>();
      const entry: Denominator = perPeriod.get(displayId) ?? {
        keys: new Set<string>(),
        total: 0,
        missing: false,
      };
      if (!entry.keys.has(row.denominatorKey)) {
        entry.keys.add(row.denominatorKey);
        const value = scale === 'percent-of-rows' ? row.referenceRows : row.referenceWords;
        if (value === null) entry.missing = true;
        else entry.total += value;
      }
      perPeriod.set(displayId, entry);
      denominators.set(row.periodKey, perPeriod);
    });
    chartData.forEach((row) => {
      const perPeriod = denominators.get(String(row[CATEGORY_X_KEY]));
      filterEligibleGroupBases.forEach((group) => {
        const count = row[group.id];
        if (typeof count !== 'number') return;
        const entry = perPeriod?.get(group.id);
        const denominator = entry && !entry.missing && entry.keys.size > 0 ? entry.total : null;
        row[`${COUNT_KEY_PREFIX}${group.id}`] = count;
        row[`${DENOMINATOR_KEY_PREFIX}${group.id}`] = denominator;
        row[group.id] =
          denominator !== null && denominator > 0
            ? (count / denominator) * SCALE_FACTORS[scale]
            : null;
      });
    });
  }
  // Dates read the same in both spacings and in the tooltip, whatever the
  // browser's locale (issue 213). Period labels come from the backend in the
  // time column's own zone; the offset between a label and its instant lets
  // "To scale" ticks, which are instants, show the same wall-clock dates.
  const dateUnit = chartDateUnitFor(summary.rawFrequency, summary.customIntervalUnit);
  let zoneOffsetMs = 0;
  const categoryLabelsByKey = new Map<string, string | number>();
  chartData.forEach((row) => {
    const key = row[CATEGORY_X_KEY];
    const label = row.time_period;
    if (typeof key !== 'string' || !isPeriodBoundary(label)) return;
    if (summary.columnType === 'datetime' && typeof label === 'string') {
      const wallClock = parsePeriodLabel(label);
      if (wallClock !== null) {
        const axisValue = row.__axis_value__;
        if (categoryLabelsByKey.size === 0 && isPeriodBoundary(axisValue)) {
          const instant = periodCoordinate(axisValue, 'datetime');
          if (Number.isFinite(instant)) zoneOffsetMs = wallClock - instant;
        }
        categoryLabelsByKey.set(key, formatChartDate(wallClock, dateUnit));
        return;
      }
    }
    categoryLabelsByKey.set(key, label);
  });
  const formatInstant = (ms: number) => formatChartDate(ms + zoneOffsetMs, dateUnit);
  const categoryLabelFor = (value: unknown): string | number => {
    if (typeof value === 'string') {
      const label = categoryLabelsByKey.get(value);
      if (label !== undefined) return label;
    }
    return isPeriodBoundary(value) ? value : '';
  };

  const orderedSelection = Array.from(selectedPeriodIndices).sort((left, right) => left - right);
  const validSelectedEntries = orderedSelection
    .map((index) => ({ index, row: chartData[index] }))
    .filter((entry): entry is { index: number; row: SequentialAnalysisDatum } =>
      Boolean(entry.row),
    );
  const hasInvalidSelection = validSelectedEntries.length !== orderedSelection.length;
  const validSelectedIndices = new Set(validSelectedEntries.map((entry) => entry.index));
  const selectedPeriodIds = validSelectedEntries.map((entry) => Number(entry.row.__period_index__));
  const selectedPeriodIdSet = new Set(selectedPeriodIds);
  const sumCounts = (rows: SequentialCanonicalRow[]) =>
    rows.reduce((total, row) => total + row.count, 0);
  const selectedGroupTotals = new Map<string, number>();
  canonicalRows.forEach((row) => {
    const displayId = displayIdByExactId.get(row.groupId) ?? row.groupId;
    if (selectedPeriodIdSet.has(row.periodIndex)) {
      selectedGroupTotals.set(displayId, (selectedGroupTotals.get(displayId) ?? 0) + row.count);
    }
  });
  // Shares count hidden groups too, so hiding a group changes no percentage
  // (issue 219, Chao's decision).
  const eligibleTotal = filterEligibleGroupBases.reduce(
    (total, group) => total + (groupTotals.get(group.id) ?? 0),
    0,
  );
  const groupColorById = new Map(
    groupBases.map((group, index) => [group.id, getSequentialPaletteColor(index)]),
  );
  const groups: SequentialChartGroup[] = filterEligibleGroupBases.map((group) => {
    const color = groupColorById.get(group.id) ?? SEQUENTIAL_ANALYSIS_PALETTE[0];
    const hidden = group.memberGroupIndices.every((memberIndex) =>
      excludedGroupIndices.has(memberIndex),
    );
    const totalCount = groupTotals.get(group.id) ?? 0;
    const selectedCount = selectedGroupTotals.get(group.id) ?? 0;
    const countText =
      validSelectedIndices.size > 0
        ? `${String(selectedCount)}/${String(totalCount)}`
        : String(totalCount);
    const share = `${eligibleTotal > 0 ? ((totalCount / eligibleTotal) * 100).toFixed(1) : '0.0'}%`;
    const detail = hidden ? `${countText} · ${share} · Hidden` : `${countText} · ${share}`;
    return {
      ...group,
      color,
      hidden,
      totalCount,
      selectedCount,
      legendText: `${group.label} (${detail})`,
    };
  });
  const axisData =
    xAxisType === 'number'
      ? chartData.map((row) => ({
          ...row,
          [NUMERIC_X_KEY]: periodCoordinate(
            row.__axis_value__ as string | number,
            summary.columnType,
          ),
        }))
      : chartData;
  const xAxis: XAxisComponentOption =
    xAxisType === 'number'
      ? {
          type: 'value',
          min: 'dataMin',
          max: 'dataMax',
          splitNumber: 10,
          axisLabel: {
            // Rebuilt in the interactive HTML download (issue 278); the same
            // labels as formatSequentialAxisTick.
            formatter: portableFormatter(
              summary.columnType === 'datetime'
                ? { kind: 'chartDate', unit: dateUnit, offsetMs: zoneOffsetMs }
                : summary.columnType === 'elapsed'
                  ? { kind: 'elapsed' }
                  : { kind: 'number' },
            ),
            rotate: 45,
          },
        }
      : {
          type: 'category',
          axisLabel: {
            formatter: (value) => String(categoryLabelFor(value)),
            rotate: 45,
            // Overlap hiding may drop any label, including the first or last
            // period; always show both so the range is clear (issue 185).
            showMinLabel: true,
            showMaxLabel: true,
          },
        };
  const visibleGroups = groups.filter((group) => !group.hidden);
  const series: MultiSeriesChartSeries[] = visibleGroups.map((group) => ({
    key: group.id,
    color: group.color,
    label: group.label,
  }));
  const legendType = chartType === 'line' ? 'line' : chartType === 'area' ? 'area' : 'bar';
  const legend: ChartExportLegendItem[] = groups.map((group) => ({
    label: group.legendText,
    color: group.color,
    type: legendType,
    hidden: group.hidden,
  }));

  const shownRows = canonicalRows.filter(
    (row) => !effectiveExcludedGroupIndices.has(row.groupIndex),
  );
  const chosenRows = shownRows.filter((row) => selectedPeriodIdSet.has(row.periodIndex));
  const counts: SequentialVisibilityCounts = {
    totalPointCount: canonicalRows.length,
    totalDocumentCount: sumCounts(canonicalRows),
    shownPointCount: shownRows.length,
    shownDocumentCount: sumCounts(shownRows),
    chosenPointCount: validSelectedIndices.size > 0 ? chosenRows.length : 0,
    chosenDocumentCount: validSelectedIndices.size > 0 ? sumCounts(chosenRows) : 0,
  };
  return {
    chartType,
    xAxisType,
    uncased,
    status: diagnostics.length > 0 ? 'malformed' : canonicalRows.length > 0 ? 'ready' : 'empty',
    diagnostics,
    summary,
    chartData,
    axisData,
    xKey: xAxisType === 'number' ? NUMERIC_X_KEY : CATEGORY_X_KEY,
    xAxis,
    tooltip: {
      labelFormatter:
        xAxisType === 'number'
          ? (value) => formatSequentialAxisTick(value, summary.columnType, formatInstant)
          : (value) => String(categoryLabelFor(value)),
      valueFormatter: (seriesKey, row) => {
        if (scale === 'count') {
          const count = row[seriesKey];
          return typeof count === 'number' ? count.toLocaleString() : '—';
        }
        const count = row[`${COUNT_KEY_PREFIX}${seriesKey}`];
        const value = row[seriesKey];
        const countText = typeof count === 'number' ? count.toLocaleString() : '—';
        if (scale === 'composition') {
          return typeof value === 'number'
            ? `${countText} (${value.toFixed(1)}%)`
            : `${countText} (no rows in this period)`;
        }
        const denominator = row[`${DENOMINATOR_KEY_PREFIX}${seriesKey}`];
        const unit = scale === 'percent-of-rows' ? 'rows' : 'words';
        if (typeof value !== 'number' || typeof denominator !== 'number') {
          return `${countText} (no reference ${unit} in this period)`;
        }
        const rate = value.toFixed(1);
        const of = `of ${denominator.toLocaleString()} ${unit}`;
        return scale === 'percent-of-rows'
          ? `${countText} (${rate}% ${of})`
          : `${countText} (${rate} per ${scale === 'per-million-words' ? 'million' : '100,000'} ${of})`;
      },
    },
    availableScales,
    overviewValue: (row, seriesKey) => {
      const count = row[scale === 'count' ? seriesKey : `${COUNT_KEY_PREFIX}${seriesKey}`];
      return typeof count === 'number' ? count : 0;
    },
    scale,
    groups,
    groupFilter: {
      minimumCount: normalizedMinimumGroupCount,
      filteredGroupCount: countFilteredGroupIds.size,
      totalGroupCount: groupBases.length,
    },
    supportsUncased,
    series,
    legend,
    selection: {
      selectedIndices: validSelectedIndices,
      selectedCount: validSelectedIndices.size,
      hasInvalidSelection,
      selectedPeriodIds,
    },
    excludedGroupIndices: Array.from(effectiveExcludedGroupIndices)
      .filter((index) => exactGroupBases.some((group) => group.index === index))
      .sort((left, right) => left - right),
    eligibleDocumentCount:
      validSelectedIndices.size > 0 ? sumCounts(chosenRows) : sumCounts(shownRows),
    counts,
  };
}
