/**
 * Shared types for data preprocessing features
 */

import type { ArrowField } from '@/lib/arrow/decodeArrowTable';

type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_null'
  | 'in'
  | 'between';
export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: ConditionValue;
  negate?: boolean;
  regex?: boolean;
  case_sensitive?: boolean;
  field?: ArrowField;
}

export interface FilterRequest {
  conditions: FilterCondition[];
  logic?: 'and' | 'or';
  name?: string;
}

/**
 * Local filter draft values. The SQL builder consumes these directly;
 * only generated SQL statements and positional parameters cross HTTP.
 */
export interface ConditionRange {
  start: string | null;
  end: string | null;
}
/** Value shape for a Topic Coverage filter condition. */
interface TopicCoverageConditionValue {
  topic_id: number;
  threshold: number;
}
export type ConditionValue =
  | string
  | number
  | boolean
  | ConditionRange
  | TopicCoverageConditionValue
  | null
  | (string | number | boolean | null)[];

export interface ConditionColumnOption {
  name: string;
  /** Exact extension identity or native Arrow type name decoded from IPC. */
  typeName: string;
  label?: string;
  field: ArrowField;
}

/**
 * Extended interface for UI with tracking ID. Uses camelCase
 * `caseSensitive` (the form state shape) which the serializer converts
 * to `case_sensitive` for the API.
 */
export interface FilterConditionWithId {
  id: string;
  column: string;
  operator: FilterOperator;
  value: ConditionValue;
  negate?: boolean;
  regex?: boolean;
  caseSensitive?: boolean;
  /** Authoritative decoded field for operator and value-editor behavior. */
  field?: ArrowField;
  [key: string]: ConditionValue | ArrowField | undefined;
}

export interface PreviewPagination {
  page: number;
  page_size: number;
  has_next: boolean;
}

export type PreviewRow = Record<string, unknown>;

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'semi' | 'anti' | 'cross';

export interface ConcatPreviewRequestPayload {
  projectBase: string;
  nodeIds: string[];
  deduplicate: boolean;
}

export const PREVIEW_PAGE_SIZE_OPTIONS = [10, 20, 50];

export const JOIN_TYPE_OPTIONS: { value: JoinType; description: string }[] = [
  { value: 'inner', description: 'Only rows with matching keys in both data blocks.' },
  {
    value: 'left',
    description: 'All rows from the left data block plus matching rows from the right.',
  },
  {
    value: 'right',
    description: 'All rows from the right data block plus matching rows from the left.',
  },
  { value: 'full', description: 'All rows from both data blocks; missing matches become nulls.' },
  {
    value: 'semi',
    description: 'Rows from the left data block that have at least one match in the right.',
  },
  {
    value: 'anti',
    description: 'Rows from the left data block that do not match anything in the right.',
  },
  { value: 'cross', description: 'Cartesian product of all rows; ignores column selections.' },
];
