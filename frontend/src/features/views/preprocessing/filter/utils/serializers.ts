import type {
  ConditionRange,
  ConditionValue,
  FilterCondition,
  FilterConditionWithId,
  FilterRequest,
} from '../../types';
import { isArrowDateField } from '@/lib/arrow/arrowTable';
import { hasNonEmptyValue } from '../../utils/typeUtils';

/**
 * The date picker emits a UTC timestamp for the local day the user picked. A
 * Date column has no time zone, so send that local calendar day instead;
 * otherwise midnight in Sydney would compare as the previous day (issue 187).
 */
const toLocalCalendarDay = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${String(parsed.getFullYear())}-${month}-${day}`;
};

const toCalendarDays = (value: ConditionValue): ConditionValue => {
  if (typeof value === 'string') return value ? toLocalCalendarDay(value) : value;
  if (value && typeof value === 'object' && !Array.isArray(value) && 'start' in value) {
    return {
      start: typeof value.start === 'string' ? toLocalCalendarDay(value.start) : value.start,
      end: typeof value.end === 'string' ? toLocalCalendarDay(value.end) : value.end,
    };
  }
  return value;
};

/**
 * Converts UI-only filter condition records into the backend request condition
 * shape. Filter preview and apply paths both call this serializer.
 * Called by `buildFilterRequestPayload` for preview and apply requests.
 * Steps: drop incomplete rows, normalize range/date/list values, and preserve boolean/regex
 * flags for backend request payloads.
 */
const serializeConditionsForRequest = (conditions: FilterConditionWithId[]) => {
  return conditions.map<FilterCondition>((condition) => {
    let value: ConditionValue;
    if (condition.operator === 'is_null') {
      value = null;
    } else if (condition.value instanceof Date) {
      value = condition.value.toISOString();
    } else if (Array.isArray(condition.value)) {
      value = condition.value.map((entry: string | number | boolean | Date | null) =>
        entry instanceof Date ? entry.toISOString() : entry,
      );
    } else if (
      condition.value &&
      typeof condition.value === 'object' &&
      'start' in condition.value
    ) {
      const range = condition.value;
      /**
       * Normalizes one range edge to the nullable ISO/string payload expected by the API.
       * Called for both `start` and `end` while serializing a between condition.
       */
      const normalizeEdge = (edge: ConditionRange['start']): string | null => {
        if (!edge) return null;
        if (edge instanceof Date) return edge.toISOString();
        const trimmed = typeof edge === 'string' ? edge.trim() : '';
        return trimmed.length > 0 ? trimmed : null;
      };
      value = {
        start: normalizeEdge(range.start),
        end: normalizeEdge(range.end),
      };
    } else {
      const currentValue = condition.value;
      value = currentValue ?? '';
    }

    if (condition.field && isArrowDateField(condition.field)) value = toCalendarDays(value);

    const payload: FilterCondition = {
      column: condition.column,
      operator: condition.operator,
      value: value as FilterCondition['value'],
    };

    if (condition.negate !== undefined) payload.negate = condition.negate;
    if (condition.regex !== undefined) payload.regex = condition.regex;
    if (condition.caseSensitive !== undefined) payload.case_sensitive = condition.caseSensitive;

    return payload;
  });
};

/**
 * Builds a complete FilterRequest from UI conditions, logic, and optional auto
 * node name. Filter preview and apply share this payload builder.
 * Used by: useFilterSubTabSections hook.
 */
export const buildFilterRequestPayload = (
  conditions: FilterConditionWithId[],
  logic: string,
  newNodeName?: string,
): FilterRequest => ({
  conditions: serializeConditionsForRequest(conditions),
  logic: logic === 'or' ? 'or' : 'and',
  name: newNodeName?.trim() ? newNodeName : undefined,
});

/**
 * Determines whether a condition is ready to send to preview/apply. Filter
 * buttons and preview payload construction use this validation gate.
 * Used by: useFilterSubTabSections hook, autoNodeNames utilities.
 * Flow: require a column, allow null checks without values, accept either side of between ranges, and otherwise require a non-empty value.
 */
export const isConditionComplete = (condition: FilterConditionWithId): boolean => {
  if (!condition.column) return false;
  if (condition.operator === 'is_null') return true;
  if (condition.operator === 'between') {
    const range =
      condition.value && typeof condition.value === 'object'
        ? (condition.value as ConditionRange)
        : { start: null, end: null };
    return hasNonEmptyValue(range.start) || hasNonEmptyValue(range.end);
  }
  return hasNonEmptyValue(condition.value);
};
