import {
  type ArrowField,
  isArrowDateField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowTimestampField,
} from '@/lib/arrow/arrowTable';

/** A date or date-time column, which Trends bins by calendar period. */
export const isTrendsDateField = (field: ArrowField): boolean =>
  isArrowDateField(field) || isArrowTimestampField(field);

/**
 * Whether Trends can use a column as its time axis. Used by: the Trends axis picker.
 * Dates and date-times bin by calendar period and numbers by interval. Times of day, durations
 * and intervals have no binning, so they are not offered (issue 316); the backend refuses them too.
 */
export const isTrendsAxisField = (field: ArrowField): boolean =>
  isTrendsDateField(field) || isArrowIntegerField(field) || isArrowFloatField(field);
