import type { Table } from 'apache-arrow';
export interface Match {
  match_order: number;
  left_context: string;
  matched_text: string;
  right_context: string;
  start_idx: number;
  end_idx: number;
  l1: string;
  r1: string;
  l1_frequency: bigint | number;
  r1_frequency: bigint | number;
  extraction: string;
}
export interface DocumentRow {
  documentId: string;
  source: Record<string, unknown>;
  matches: Match[];
  sourceIndex: number;
}
export function decodeConcordanceRows(table: Table, sourceIndex: number): DocumentRow[] {
  return table.toArray().map((value) => {
    const row = (value as { toJSON: () => Record<string, unknown> }).toJSON();
    const source = row.source as { toJSON?: () => Record<string, unknown> } & Record<
      string,
      unknown
    >;
    const nested = row.matches as
      | Iterable<{ toJSON?: () => Record<string, unknown> } & Record<string, unknown>>
      | undefined;
    const hits = nested ? Array.from(nested, (hit) => hit.toJSON?.() ?? hit) : [row];
    return {
      documentId: String(row.document_id),
      source: source.toJSON?.() ?? source,
      sourceIndex,
      matches: hits.map(
        (hit) =>
          ({
            ...hit,
            match_order: Number(hit.match_order),
            start_idx: Number(hit.start_idx),
            end_idx: Number(hit.end_idx),
          }) as unknown as Match,
      ),
    };
  });
}
export { showValue } from '../common/analysisValue';
export function interleave<T>(sources: T[][]): T[] {
  return Array.from({ length: Math.max(0, ...sources.map((rows) => rows.length)) }, (_, index) =>
    sources.flatMap((rows) => (rows[index] === undefined ? [] : [rows[index]])),
  ).flat();
}
