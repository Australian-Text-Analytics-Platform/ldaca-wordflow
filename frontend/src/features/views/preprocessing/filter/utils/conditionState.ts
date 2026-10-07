import {
  isArrowDictionaryField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowStringListField,
  isArrowDurationField,
  isArrowTemporalField,
  type ArrowField,
} from '@/lib/arrow/arrowTable';
import { isTopicCoverageField } from '@/lib/arrow/semanticTypes';
import { getOperatorsForField } from '../../utils/typeUtils';
import type {
  ConditionColumnOption,
  ConditionValue,
  FilterCondition,
  FilterConditionWithId,
} from '../../types';

interface FilterConditionPrefillRequest {
  kind: 'datetime' | 'numeric';
  conditionId: string;
  column: string;
  operator: FilterCondition['operator'];
}

interface FilterConditionLoadRequest {
  column: string;
}

export interface FilterConditionChangeResult {
  condition: FilterConditionWithId;
  checklistLoadRequest: FilterConditionLoadRequest | null;
  prefillRequest: FilterConditionPrefillRequest | null;
  shouldResetSearch: boolean;
}

/**
 * Picks the first supported operator for a column type when filter rows are
 * created or retargeted.
 * Used by: useFilterSubTabSections and condition-state tests so row creation
 * and row updates share one defaulting rule.
 */
const getDefaultOperatorForFilterField = (
  field: ArrowField | undefined,
): FilterCondition['operator'] => {
  const operators = getOperatorsForField(field);
  return (operators[0]?.value as FilterCondition['operator'] | undefined) ?? 'eq';
};

const isChecklistField = (field: ArrowField | undefined): boolean =>
  field !== undefined &&
  (isArrowDictionaryField(field) || isArrowStringListField(field) || isTopicCoverageField(field));

const getDefaultValueForColumn = (
  field: ArrowField | undefined,
  operator: FilterCondition['operator'],
): ConditionValue => {
  if (isTopicCoverageField(field)) return { topic_id: 0, threshold: 0.05 };
  return operator === 'in' ? [] : '';
};

const getPrefillRequest = (
  conditionId: string,
  field: ArrowField | undefined,
  column: string | undefined,
  operator: FilterCondition['operator'],
): FilterConditionPrefillRequest | null => {
  if (!column || operator === 'is_null') return null;
  // Elapsed time fills with the column's smallest and largest values, as
  // numbers do (issue 324).
  if (
    field &&
    isArrowDurationField(field) &&
    (operator === 'gte' || operator === 'lte' || operator === 'between')
  ) {
    return { kind: 'numeric', conditionId, column, operator };
  }
  if (field && isArrowTemporalField(field)) {
    return { kind: 'datetime', conditionId, column, operator };
  }
  if (
    field &&
    (isArrowIntegerField(field) || isArrowFloatField(field)) &&
    (operator === 'gte' || operator === 'lte' || operator === 'between')
  ) {
    return { kind: 'numeric', conditionId, column, operator };
  }
  return null;
};

/**
 * Creates a filter row seeded from the first available column.
 * Used by: useFilterSubTabSections add-condition action so default operator,
 * value, and dtype logic stays aligned with condition updates.
 */
export const createFilterCondition = (
  id: string,
  firstColumn: ConditionColumnOption | undefined,
): FilterConditionWithId => {
  const field = firstColumn?.field;
  const operator = getDefaultOperatorForFilterField(field);
  return {
    id,
    column: firstColumn?.name ?? '',
    operator,
    value: getDefaultValueForColumn(field, operator),
    field,
    negate: false,
    regex: false,
    caseSensitive: false,
  };
};

/**
 * Applies one user edit to a filter condition and reports side effects the
 * hook should run after state updates.
 * Used by: useFilterSubTabSections so the hook can keep async categorical and
 * prefill requests outside the pure condition transition logic.
 * Flow: update the requested field, reset incompatible value state on column
 * changes, normalize categorical/list values on operator changes, and return
 * checklist-load or prefill requests for the caller.
 */
export const applyFilterConditionFieldChange = <Key extends keyof FilterConditionWithId>({
  condition,
  field,
  value,
  availableColumns,
}: {
  condition: FilterConditionWithId;
  field: Key;
  value: FilterConditionWithId[Key];
  availableColumns: ConditionColumnOption[];
}): FilterConditionChangeResult => {
  const updated = { ...condition, [field]: value };
  let checklistLoadRequest: FilterConditionLoadRequest | null = null;
  let prefillRequest: FilterConditionPrefillRequest | null = null;

  if (field === 'column') {
    const columnInfo = availableColumns.find((column) => column.name === value);
    if (columnInfo) {
      const operator = getDefaultOperatorForFilterField(columnInfo.field);
      updated.field = columnInfo.field;
      updated.operator = operator;
      updated.value = getDefaultValueForColumn(columnInfo.field, operator);
      updated.regex = false;
      updated.caseSensitive = false;

      if (isChecklistField(columnInfo.field)) {
        checklistLoadRequest = { column: columnInfo.name };
      }
      prefillRequest = getPrefillRequest(condition.id, columnInfo.field, columnInfo.name, operator);
    }
  }

  if (field === 'operator') {
    const operator = value as FilterCondition['operator'];
    if (operator === 'in') {
      updated.value = Array.isArray(updated.value) ? updated.value : [];
      if (isChecklistField(updated.field) && updated.column) {
        checklistLoadRequest = { column: updated.column };
      }
    } else if (
      updated.field &&
      isArrowDictionaryField(updated.field) &&
      Array.isArray(updated.value)
    ) {
      updated.value = updated.value[0] ?? '';
    }

    if (updated.field && isArrowTemporalField(updated.field) && updated.column) {
      updated.value = '';
    }
    // A number range is only valid for between (issue 290): leaving between
    // used to keep {start, end} behind a blank number box and the request
    // then failed with a generic error.
    const isRange =
      updated.value !== null && typeof updated.value === 'object' && 'start' in updated.value;
    if (operator === 'between' && !isRange) {
      updated.value = { start: null, end: null };
    } else if (operator !== 'between' && isRange) {
      updated.value = '';
    }
    prefillRequest = getPrefillRequest(condition.id, updated.field, updated.column, operator);
  }

  return {
    condition: updated,
    checklistLoadRequest,
    prefillRequest,
    shouldResetSearch: field === 'column' || field === 'operator',
  };
};
