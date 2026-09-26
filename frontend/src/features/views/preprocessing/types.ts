/**
 * Shared types for data preprocessing features
 */

import type { FilterConditionInput } from '@/api';
import type { ArrowField } from '@/lib/arrow/arrowTable';
import type { Field } from 'apache-arrow';

type FilterOperator = FilterConditionInput['operator'];

export type FilterCondition = FilterConditionInput;

export interface FilterRequest {
  conditions: FilterCondition[];
  logic?: 'and' | 'or';
  name?: string;
}

/**
 * UI-side narrowing of the value space — what the filter form actually
 * produces before serialization. The serializer in
 * `filter/utils/serializers.ts` widens this into the `value: unknown`
 * the API accepts.
 */
export interface ConditionRange {
  start: string | Date | null;
  end: string | Date | null;
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
  | Date
  | ConditionRange
  | TopicCoverageConditionValue
  | null
  | (string | number | boolean | Date | null)[];

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
  /** Result size, reported by the Data Builder tools that count their rows. */
  total_rows?: number | null;
}

export type PreviewRow = Record<string, unknown>;

// Cross was removed from the Join tool (issue 186); saved cross joins still load.
export type JoinType = 'left' | 'inner' | 'right' | 'full' | 'semi' | 'anti';

export interface JoinPreviewRequestPayload {
  workspaceId: string;
  leftNodeId: string;
  rightNodeId: string;
  leftOn?: string;
  rightOn?: string;
  joinType: JoinType;
}

export interface ConcatPreviewRequestPayload {
  workspaceId: string;
  nodeIds: string[];
  deduplicate: boolean;
}

export interface ConcatNodeSummary {
  nodeId: string;
  displayName: string;
  columns: string[];
  normalizedColumns: string[];
  fields: Record<string, Field>;
  columnCount: number;
}

interface ConcatSchemaMismatch {
  nodeId: string;
  nodeName: string;
  details: string[];
}

export interface ConcatSchemaAnalysis {
  summaries: ConcatNodeSummary[];
  ready: boolean;
  issues: string;
  mismatches: ConcatSchemaMismatch[];
  baseColumns: string[];
  baseColumnCount: number;
}

export const PREVIEW_PAGE_SIZE_OPTIONS = [10, 20, 50];
export const MAX_CONCAT_NODES = 6;
export const MAX_JOIN_NODES = 2;

/** Join types with plain-language explanations shown beside the selector (issue 179). */
export const JOIN_TYPE_OPTIONS: { value: JoinType; label: string; description: string }[] = [
  {
    value: 'left',
    label: 'Left',
    description:
      'Keeps every row of the left data block and adds matching values from the right; rows without a match get empty cells.',
  },
  {
    value: 'inner',
    label: 'Inner',
    description: 'Keeps only rows that match in both data blocks.',
  },
  {
    value: 'right',
    label: 'Right',
    description:
      'Keeps every row of the right data block and adds matching values from the left; rows without a match get empty cells.',
  },
  {
    value: 'full',
    label: 'Full',
    description:
      'Keeps every row of both data blocks, matched where possible; missing values are left empty.',
  },
  {
    value: 'semi',
    label: 'Keep matches',
    description:
      'Keeps the left rows that have a match in the right, without adding any right columns.',
  },
  {
    value: 'anti',
    label: 'Keep non-matches',
    description: 'Keeps the left rows that have no match in the right.',
  },
];
