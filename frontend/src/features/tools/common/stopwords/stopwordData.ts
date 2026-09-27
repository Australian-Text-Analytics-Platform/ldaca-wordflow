import { objectDependencies } from '@/features/project/projectChanges';
import * as api from '@/features/project/api';
import type { StopwordSource } from '@/features/project/api';
export { readStopwords, saveStopwords } from '@/features/project/api';
export type { StopwordSource } from '@/features/project/api';

export function completeStopwordSource(value: StopwordSource | null): StopwordSource | null {
  return value?.source.schema && value.source.name && value.column ? value : null;
}

export function stopwordSource(value: unknown): StopwordSource | null {
  if (!value || typeof value !== 'object' || !('source' in value) || !('column' in value))
    return null;
  const source = value.source;
  return source &&
    typeof source === 'object' &&
    'schema' in source &&
    'name' in source &&
    typeof source.schema === 'string' &&
    typeof source.name === 'string' &&
    typeof value.column === 'string'
    ? { source: { schema: source.schema, name: source.name }, column: value.column }
    : null;
}

export function stopwordQuery(base: string, selected: StopwordSource | null, active = true) {
  const schema = selected?.source.schema ?? '';
  const name = selected?.source.name ?? '';
  const column = selected?.column ?? '';
  return {
    queryKey: ['native', base, 'rows', schema, name, 'stopwords', column],
    enabled: active && Boolean(schema && name && column),
    placeholderData: (previous: string[] | undefined) => previous,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.readStopwords(base, { source: { schema, name }, column }, signal),
    meta: { ...objectDependencies({ schema, name }), reportError: false },
  };
}

/** Backend preparation owns naming, View copying, registration and logical parents. */
export function createStopwordTable(base: string, inputs: readonly StopwordSource[]) {
  return api.prepareStopwords(base, null, inputs);
}

export function writableStopwords(
  base: string,
  selected: StopwordSource | null,
  inputs: readonly StopwordSource[],
) {
  return api.prepareStopwords(base, selected, inputs);
}
