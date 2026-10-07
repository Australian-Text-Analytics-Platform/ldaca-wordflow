import type { PreviewNodeCreationData } from '@/api';
import {
  isArrowBooleanField,
  isArrowDictionaryField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowStringField,
  isArrowDurationField,
  isArrowTemporalField,
  type ArrowField,
} from '@/lib/arrow/arrowTable';

/** A complete derivation body, as the create and preview endpoints take it. */
export type DerivationBody = NonNullable<PreviewNodeCreationData['body']>;

export type ColumnKind = 'text' | 'number' | 'date' | 'elapsed' | 'boolean' | 'other';

/** The broad type a Data Builder tool needs to offer the right options. */
export function columnKind(field: ArrowField | undefined): ColumnKind {
  if (!field) return 'other';
  if (isArrowStringField(field) || isArrowDictionaryField(field)) return 'text';
  if (isArrowIntegerField(field) || isArrowFloatField(field)) return 'number';
  // Elapsed time, such as a transcript's start time (issue 324).
  if (isArrowDurationField(field)) return 'elapsed';
  if (isArrowTemporalField(field)) return 'date';
  if (isArrowBooleanField(field)) return 'boolean';
  return 'other';
}

/** The Data Builder's selected input, as each tool receives it. */
export interface BuilderInput {
  id: string;
  name: string;
  /** The column picked in the inputs panel, usually the text to analyse. */
  column: string;
  /** `typeLabel` is the plain type name the Data Editor shows (issue 205). */
  columns: { name: string; kind: ColumnKind; typeLabel?: string }[];
}
