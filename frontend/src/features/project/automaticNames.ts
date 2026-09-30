import type { QueryClient } from '@tanstack/react-query';
import type { Graph } from './api';

export type DataBlockOperation =
  | 'flt'
  | 'slc'
  | 'smp'
  | 'shf'
  | 'join'
  | 'stk'
  | 'bld'
  | 'cpy'
  | 'sw'
  | 'cb'
  | 'cc'
  | 'cc_doc'
  | 'qt'
  | 'qt_doc'
  | 'tm'
  | 'tm_dict'
  | 'tr'
  | 'cp'
  | 'sc'
  | 'hm'
  | 'sk';

// DuckDB identifiers fold ASCII case only, including for non-ASCII names.
const fold = (name: string) => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

function sourcePrefix(sources: readonly string[]): string {
  const limit = sources.length > 1 ? 7 : 16;
  return (
    sources
      .slice(0, 2)
      .map((source) => {
        const normalized = source.replace(/[^\p{Alphabetic}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
        return (
          Array.from(normalized)
            .slice(0, limit)
            .join('')
            .replace(/^_+|_+$/g, '') || 'data'
        );
      })
      .join('_') || 'data'
  );
}

/** Suggestions only: creation still validates the captured name transactionally. */
export function suggestDataBlockName(
  sources: readonly string[],
  operation: DataBlockOperation,
  existing: readonly string[],
): string {
  const names = new Set(existing.map(fold));
  const stem = `${sourcePrefix(sources)}_${operation}`;
  let number = 1;
  while (names.has(fold(`${stem}_${String(number)}`))) number++;
  return `${stem}_${String(number)}`;
}

/** Allocate a captured publication's outputs together, including identical truncated prefixes. */
export function suggestDataBlockNames<
  T extends { sources: readonly string[]; operation: DataBlockOperation },
>(outputs: readonly T[], existing: readonly string[]): (T & { name: string })[] {
  const reserved = [...existing];
  return outputs.map((output) => {
    const name = suggestDataBlockName(output.sources, output.operation, reserved);
    reserved.push(name);
    return { ...output, name };
  });
}

export function suggestColumnName(existing: readonly string[]): string {
  const names = new Set(existing.map(fold));
  let name = 'col';
  let number = 2;
  while (names.has(fold(name))) name = `col_${String(number++)}`;
  return name;
}

/** Read current registered names when opening a publication dialog; never fetch source rows. */
export function cachedDataBlockNames(cache: QueryClient, base: string): string[] {
  return (
    cache
      .getQueryData<Graph>(['native', base, 'graph', 'logical'])
      ?.nodes.map((node) => node.table_name) ?? []
  );
}
