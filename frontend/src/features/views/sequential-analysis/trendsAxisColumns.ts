import {
  type ArrowField,
  isArrowDateField,
  isArrowDictionaryField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowTimestampField,
} from '@/lib/arrow/arrowTable';

/** A date or date-time column, which Trends bins by calendar period. */
export const isTrendsDateField = (field: ArrowField): boolean =>
  isArrowDateField(field) || isArrowTimestampField(field);

/**
 * Whether Trends can use a column as its time axis. Used by: the Trends axis picker.
 * Dates and date-times bin by calendar period, numbers by interval, and categories give one
 * position per value. Times of day, durations and intervals have no binning, so they are not
 * offered (issue 316); the backend refuses them too.
 */
export const isTrendsAxisField = (field: ArrowField): boolean =>
  isTrendsDateField(field) ||
  isArrowIntegerField(field) ||
  isArrowFloatField(field) ||
  // A category column: one bar per value, in its order (issue 318).
  isArrowDictionaryField(field);

/** Default-choice rank for the axis picker: dates, then numbers, then categories (issue 318). */
export const trendsAxisRank = (field: ArrowField): number =>
  isTrendsDateField(field) ? 0 : isArrowDictionaryField(field) ? 2 : 1;
