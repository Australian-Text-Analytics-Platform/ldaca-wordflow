import type { BuilderInput, DerivationBody } from '../builder/builderTypes';

export function buildDedupeBodies(
  input: BuilderInput,
  form: {
    compare: string[] | null;
    nearText: boolean;
    ignoreLinks: boolean;
    name: string;
  },
): { kept: DerivationBody; duplicates: DerivationBody } | null {
  const compare = form.compare ?? [];
  if (form.compare !== null && compare.length === 0 && !form.nearText) return null;
  const nearColumn = form.nearText && input.column ? input.column : null;
  const base = form.name.trim() || input.name;
  const shared = {
    kind: 'deduplicate' as const,
    source_node_id: input.id,
    // An empty list compares every column, so "chosen columns" with only
    // the near-duplicate text sends that column alone.
    columns: form.compare !== null && compare.length === 0 && nearColumn ? [nearColumn] : compare,
    near_text_column: nearColumn,
    ignore_links_mentions: Boolean(nearColumn) && form.ignoreLinks,
  };
  return {
    kept: { ...shared, output: 'kept', name: `${base}_deduplicated` },
    duplicates: { ...shared, output: 'duplicates', name: `${base}_duplicates` },
  };
}
