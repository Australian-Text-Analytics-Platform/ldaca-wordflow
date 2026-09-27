import type { Table } from 'apache-arrow';
import { showValue } from '../common/analysisValue';
import { VIZ_PALETTE } from '../common/vizPalette';
export const quotationFields = [
  'quote',
  'speaker',
  'verb',
  'quote_type',
  'quote_token_count',
  'is_floating_quote',
  'quote_start_idx',
  'quote_end_idx',
  'speaker_start_idx',
  'speaker_end_idx',
  'verb_start_idx',
  'verb_end_idx',
  'quote_row_idx',
] as const;
export interface Quote extends Record<string, unknown> {
  quote: string;
  quote_row_idx: number;
  speaker: string | null;
  verb: string | null;
  quote_start_idx: number;
  quote_end_idx: number;
  speaker_start_idx: number | null;
  speaker_end_idx: number | null;
  verb_start_idx: number | null;
  verb_end_idx: number | null;
}
export interface QuotationRow {
  documentId: string;
  source: Record<string, unknown>;
  quotes: Quote[];
}
type ArrowObject = Record<string, unknown> & { toJSON?: () => Record<string, unknown> };
export function quotationRows(table: Table): QuotationRow[] {
  return table.toArray().map((value) => {
    const row = (value as ArrowObject).toJSON?.() ?? (value as ArrowObject);
    const source = row.source as ArrowObject;
    const quotes = row.quotes
      ? Array.from(row.quotes as Iterable<ArrowObject>, (hit) => hit.toJSON?.() ?? hit)
      : [row];
    return {
      documentId: String(row.document_id),
      source: source.toJSON?.() ?? source,
      quotes: quotes.map(
        (quote) =>
          Object.fromEntries(
            Object.entries(quote).map(([key, value]) => [
              key,
              key.endsWith('_idx') && value != null ? Number(value) : value,
            ]),
          ) as Quote,
      ),
    };
  });
}
export const quoteColors = { quote: VIZ_PALETTE[2], speaker: VIZ_PALETTE[0], verb: VIZ_PALETTE[4] };
export const quotationCell = (row: QuotationRow, column: string, generated: boolean) =>
  generated
    ? row.quotes.map((q) => showValue(q[column])).join('\n')
    : showValue(row.source[column]);
