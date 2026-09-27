import type { AnnotationClassDescriptionRow } from '@/api';
import { queryProjectSqlTable, sqlIdentifier, sqlTable } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';

const DISABLED_CLASS_DESCRIPTIONS_QUERY_KEY = [
  'projects',
  'annotation',
  'codebook',
  'disabled',
] as const;

interface UseAnnotationClassDescriptionsArgs {
  projectId: string | null;
  nodeId: string | null;
  classColumn: string | null;
  descriptionColumn: string | null;
}

export const normalizeClassDescriptionRows = (
  rows: AnnotationClassDescriptionRow[] | undefined,
): AnnotationClassDescriptionRow[] =>
  (rows ?? []).map((row) => ({
    class: row.class,
    description: row.description,
  }));

const jsonValueToText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

/**
 * Shared Codebook query for Annotation setup, editing, and AI gating.
 *
 * Used by: AnnotationFeature to count valid AI classes and
 * AnnotationClassDescriptionsEditor to render/edit the same Codebook Data
 * Block. Flow: build one stable enabled/disabled query key, fetch the selected
 * two-column Codebook when all selectors are present, and expose
 * normalized rows so callers never branch on missing class/description fields.
 */
export function useAnnotationClassDescriptions({
  projectId,
  nodeId,
  classColumn,
  descriptionColumn,
}: UseAnnotationClassDescriptionsArgs) {
  const canLoad = Boolean(projectId && nodeId && classColumn && descriptionColumn);
  const sql =
    nodeId && classColumn && descriptionColumn
      ? `SELECT ${sqlIdentifier(classColumn)}, ${sqlIdentifier(
          descriptionColumn,
        )} FROM ${sqlTable(nodeId)}`
      : '';
  const queryKey =
    canLoad && projectId && nodeId && classColumn && descriptionColumn
      ? queryKeys.projectSqlDrain(projectId, [nodeId], sql, 500, {
          classColumn,
          descriptionColumn,
        })
      : DISABLED_CLASS_DESCRIPTIONS_QUERY_KEY;

  const query = useQuery({
    queryKey,
    enabled: canLoad,
    queryFn: async ({ signal }) => {
      if (!projectId || !nodeId || !classColumn || !descriptionColumn) {
        throw new Error('Missing Codebook selection');
      }
      const rows: Record<string, unknown>[] = [];
      let page = 1;
      let initialEtag: string | null | undefined;
      let hasNext: boolean;
      do {
        const data = await queryProjectSqlTable({
          path: { workspace_id: projectId },
          body: {
            mode: 'query',
            node_ids: [nodeId],
            sql,
            page,
            page_size: 500,
          },
          signal,
        });
        initialEtag ??= data.etag;
        if (initialEtag !== data.etag) {
          throw new Error('Project changed while loading class descriptions');
        }
        rows.push(...data.rows);
        hasNext = data.hasNext;
        page += 1;
      } while (hasNext);
      return {
        rows: rows.map((row) => ({
          class: jsonValueToText(row[classColumn]),
          description: jsonValueToText(row[descriptionColumn]),
        })),
      };
    },
  });

  return {
    canLoad,
    queryKey,
    query,
    rows: normalizeClassDescriptionRows(query.data?.rows),
  };
}
