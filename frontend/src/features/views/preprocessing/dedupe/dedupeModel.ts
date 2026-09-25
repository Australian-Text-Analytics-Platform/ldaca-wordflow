import type { BuilderInput, DerivationBody } from '../builder/builderTypes';

/**
 * Deduplicate always compares the deduplicating column (the one picked
 * in the inputs panel), plus any additional columns; selecting every other
 * column compares whole rows (issue 158). Near-duplicate matching applies to
 * the deduplicating column when it holds text.
 */
export function buildDedupeBodies(
  input: BuilderInput,
  form: {
    additional: string[];
    nearText: boolean;
    ignoreLinks: boolean;
    name: string;
  },
): { kept: DerivationBody; duplicates: DerivationBody } | null {
  const basis = input.column;
  if (!basis || !input.columns.some((column) => column.name === basis)) return null;
  const names = new Set(input.columns.map((column) => column.name));
  const columns = [
    basis,
    ...input.columns
      .map((column) => column.name)
      .filter((name) => name !== basis && form.additional.includes(name) && names.has(name)),
  ];
  const isText = input.columns.find((column) => column.name === basis)?.kind === 'text';
  const nearColumn = form.nearText && isText ? basis : null;
  const base = form.name.trim() || input.name;
  const shared = {
    kind: 'deduplicate' as const,
    source_node_id: input.id,
    columns,
    near_text_column: nearColumn,
    ignore_links_mentions: nearColumn !== null && form.ignoreLinks,
  };
  return {
    kept: { ...shared, output: 'kept', name: `${base}_deduplicated` },
    duplicates: { ...shared, output: 'duplicates', name: `${base}_duplicates` },
  };
}
