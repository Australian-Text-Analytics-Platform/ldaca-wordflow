import {
  type ArrowField,
  isArrowDateField,
  isArrowDictionaryField,
  isArrowDurationField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowTimestampField,
} from '@/lib/arrow/arrowTable';
import type { SequentialAnalysisRequest } from '@/api';
import type { SequentialColumnType } from './hooks/sequentialChartModel';

type SequentialFrequency = NonNullable<SequentialAnalysisRequest['frequency']>;
type SequentialCustomIntervalUnit = NonNullable<SequentialAnalysisRequest['custom_interval_unit']>;

const SUB_DAY_FREQUENCIES = new Set<SequentialFrequency>(['second', 'minute', 'hourly']);
const SUB_DAY_UNITS = new Set<SequentialCustomIntervalUnit>(['seconds', 'minutes', 'hours']);

/** A date or date-time column, which Trends bins by calendar period. */
export const isTrendsDateField = (field: ArrowField): boolean =>
  isArrowDateField(field) || isArrowTimestampField(field);

/**
 * Whether Trends can use a column as its time axis. Used by: the Trends axis picker.
 * Dates and date-times bin by calendar period, numbers by interval, and categories give one
 * position per value. Elapsed time bins by seconds, minutes or hours (issue 324). Times of day
 * and intervals have no binning, so they are not offered (issue 316); the backend refuses them too.
 */
export const isTrendsAxisField = (field: ArrowField): boolean =>
  isTrendsDateField(field) ||
  isArrowDurationField(field) ||
  isArrowIntegerField(field) ||
  isArrowFloatField(field) ||
  // A category column: one bar per value, in its order (issue 318).
  isArrowDictionaryField(field);

/**
 * Default-choice rank for the axis picker: dates and elapsed times (a transcript's start time
 * before its line number, issue 324), then numbers, then categories (issue 318).
 */
export const trendsAxisRank = (field: ArrowField): number =>
  isTrendsDateField(field) || isArrowDurationField(field)
    ? 0
    : isArrowDictionaryField(field)
      ? 2
      : 1;

/**
 * Elapsed time bins by seconds, minutes or hours (issue 324): a calendar
 * period left over from a date column reads as minutes.
 */
export const elapsedFrequency = (
  columnType: SequentialColumnType,
  frequency: SequentialFrequency,
): SequentialFrequency =>
  columnType === 'elapsed' && !SUB_DAY_FREQUENCIES.has(frequency) && frequency !== 'custom'
    ? 'minute'
    : frequency;

export const elapsedUnit = (
  columnType: SequentialColumnType,
  unit: SequentialCustomIntervalUnit,
): SequentialCustomIntervalUnit =>
  columnType === 'elapsed' && !SUB_DAY_UNITS.has(unit) ? 'minutes' : unit;
