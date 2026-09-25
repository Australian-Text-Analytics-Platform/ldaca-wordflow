import type { PreviewNodeCreationData } from '@/api';
import {
  isArrowBooleanField,
  isArrowDictionaryField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowStringField,
  isArrowTemporalField,
  type ArrowField,
} from '@/lib/arrow/arrowTable';

/** A complete derivation body, as the create and preview endpoints take it. */
export type DerivationBody = NonNullable<PreviewNodeCreationData['body']>;

export type ColumnKind = 'text' | 'number' | 'date' | 'boolean' | 'other';

/** The broad type a Data Builder tool needs to offer the right options. */
export function columnKind(field: ArrowField | undefined): ColumnKind {
  if (!field) return 'other';
  if (isArrowStringField(field) || isArrowDictionaryField(field)) return 'text';
  if (isArrowIntegerField(field) || isArrowFloatField(field)) return 'number';
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
  columns: { name: string; kind: ColumnKind }[];
}
