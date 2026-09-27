import { objectDependencies } from '@/features/project/projectChanges';
import { useQuery } from '@tanstack/react-query';
import {
  identifier,
  objectRef,
  objectSql,
  querySql,
  type DataTarget,
} from '@/features/project/api';
import { detectLanguageIso6391 } from './languageDetection';

interface DetectedColumnLanguageArgs {
  base: string;
  target: DataTarget | null;
  column: string | null;
  enabled?: boolean;
}

/** Cache only the language recommendation, never document text in query metadata. */
export function useDetectedColumnLanguage({
  base,
  target,
  column,
  enabled = true,
}: DetectedColumnLanguageArgs) {
  const source = target === null ? null : objectRef(target);
  const schema = source?.schema ?? null;
  const name = source?.name ?? null;
  return useQuery({
    queryKey: ['native', base, 'rows', schema, name, 'language', column],
    enabled: enabled && source !== null && Boolean(column),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    meta: { ...objectDependencies({ schema: schema ?? '', name: name ?? '' }), reportError: false },
    queryFn: async ({ signal }) => {
      if (schema === null || name === null || !column) return null;
      const table = await querySql(
        base,
        [
          {
            sql: `SELECT substring(CAST(${identifier(column)} AS VARCHAR), 1, 20000) FROM ${objectSql({ schema, name })} LIMIT 100`,
          },
        ],
        signal,
      );
      signal.throwIfAborted();
      const values = table.getChildAt(0);
      let text = '';
      if (values) {
        for (const value of values) {
          if (typeof value !== 'string') continue;
          const next = value.replace(/\s+/g, ' ').trim();
          if (!next) continue;
          text = `${text}${text ? ' ' : ''}${next}`.slice(0, 20_000);
          if (text.length === 20_000) break;
        }
      }
      return detectLanguageIso6391(text, signal, base);
    },
  });
}
