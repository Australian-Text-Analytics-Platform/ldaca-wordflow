import type { BuilderInput, DerivationBody } from '../builder/builderTypes';

export type SegmentUnit = 'sentence' | 'paragraph' | 'line' | 'pattern';
export type LeadMode = 'column' | 'drop';

/** Builds the segment derivation, or null while the form is incomplete. */
export function buildSegmentBody(
  input: BuilderInput,
  form: { unit: SegmentUnit; pattern: string; lead: LeadMode; leadColumn: string; name: string },
): DerivationBody | null {
  if (!input.column) return null;
  const base = {
    kind: 'segment' as const,
    source_node_id: input.id,
    column: input.column,
    unit: form.unit,
    name: form.name.trim() || undefined,
  };
  if (form.unit !== 'pattern') return base;
  if (!form.pattern) return null;
  if (form.lead === 'drop') return { ...base, pattern: form.pattern, lead: 'drop' };
  const leadColumn = form.leadColumn.trim();
  if (!leadColumn || input.columns.some((column) => column.name === leadColumn)) return null;
  return { ...base, pattern: form.pattern, lead: 'column', lead_column: leadColumn };
}
