import type { RowDetailCustomization, RowDetailPayload } from '../common/components/RowDetailPanel';
import {
  CONCORDANCE_COLUMN_KEYS,
  CONCORDANCE_PRESENTATION_COLUMNS,
} from '../common/generatedColumns';
import {
  CONCORDANCE_DETAIL_COLOR,
  renderConcordanceDetailText,
  type ConcordanceDetailHit,
} from './concordanceDetailText';
import { ConcordanceMatchedForm } from './components/ConcordanceMatchedForm';
import { toCellText } from './concordanceTableDomain';

export interface ConcordanceRowDetailItem {
  row: Record<string, unknown>;
  nodeId: string;
  column: string;
  groupedHits?: Record<string, unknown>[];
}

/**
 * Where the window was opened from (issue 429). The table shows one match per
 * row in one colour; Dispersion shows a document's matches in the legend's
 * colours (merged under Ignore capitals, as the legend is), one match at a time.
 */
export type ConcordanceRowDetailView =
  | { kind: 'table' }
  | {
      kind: 'dispersion';
      /** The legend's colours by matched text; merged under Ignore capitals. */
      termColors: Record<string, string>;
      /** The match being read, in document order (see orderedConcordanceHits). */
      matchIndex?: number;
    };

/** Converts a displayed Concordance row into the shared detail payload. */
export function buildConcordanceRowDetailPayload(item: ConcordanceRowDetailItem): RowDetailPayload {
  const concordanceHits =
    item.groupedHits && item.groupedHits.length > 0 ? item.groupedHits : [item.row];
  const primaryRecord = concordanceHits[0] ?? item.row;
  const record = { ...primaryRecord };
  const rawFullText = record[item.column];
  return {
    record,
    textColumn: item.column,
    fullText:
      rawFullText === null || rawFullText === undefined ? undefined : toCellText(rawFullText),
    excludeMetadataColumns: [...CONCORDANCE_PRESENTATION_COLUMNS],
  };
}

const toOffset = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const contextLength = (value: unknown): number =>
  typeof value === 'string' ? Array.from(value).length : 0;

const matchedTextOf = (hit: Record<string, unknown>): string =>
  toCellText(hit[CONCORDANCE_COLUMN_KEYS.matchedText]);

/** Hits with positions; a hit the backend gave no offsets for is left unmarked. */
const detailHits = (
  hits: readonly Record<string, unknown>[],
  colorOf: (hit: Record<string, unknown>) => string,
  currentIndex: number,
): ConcordanceDetailHit[] =>
  hits.flatMap((hit, index) => {
    const start = toOffset(hit[CONCORDANCE_COLUMN_KEYS.startIdx]);
    const end = toOffset(hit[CONCORDANCE_COLUMN_KEYS.endIdx]);
    if (start === null || end === null || end <= start) return [];
    return [
      {
        start,
        end,
        leftLength: contextLength(hit[CONCORDANCE_COLUMN_KEYS.leftContext]),
        rightLength: contextLength(hit[CONCORDANCE_COLUMN_KEYS.rightContext]),
        color: colorOf(hit),
        current: index === currentIndex,
      },
    ];
  });

/** A row's matches in document order: the order Previous and Next match follow. */
export function orderedConcordanceHits(item: ConcordanceRowDetailItem): Record<string, unknown>[] {
  const hits = item.groupedHits && item.groupedHits.length > 0 ? item.groupedHits : [item.row];
  return [...hits].sort(
    (left, right) =>
      (toOffset(left[CONCORDANCE_COLUMN_KEYS.startIdx]) ?? 0) -
      (toOffset(right[CONCORDANCE_COLUMN_KEYS.startIdx]) ?? 0),
  );
}

/** L1 and R1 with their frequencies, for the match being read. */
type SummaryField = NonNullable<RowDetailCustomization['summaryFields']>[number];

const neighbourFields = (record: Record<string, unknown>): SummaryField[] => [
  { label: 'L1 Word', value: toCellText(record[CONCORDANCE_COLUMN_KEYS.leftToken]) },
  ...(record[CONCORDANCE_COLUMN_KEYS.leftTokenFreq] != null
    ? [{ label: 'L1 Freq', value: String(record[CONCORDANCE_COLUMN_KEYS.leftTokenFreq]) }]
    : []),
  { label: 'R1 Word', value: toCellText(record[CONCORDANCE_COLUMN_KEYS.rightToken]) },
  ...(record[CONCORDANCE_COLUMN_KEYS.rightTokenFreq] != null
    ? [{ label: 'R1 Freq', value: String(record[CONCORDANCE_COLUMN_KEYS.rightTokenFreq]) }]
    : []),
];

/** Builds Concordance summaries and document highlighting for one selected row. */
export function buildConcordanceRowDetailCustomization(
  item: ConcordanceRowDetailItem,
  searchWord: string,
  view: ConcordanceRowDetailView = { kind: 'table' },
): RowDetailCustomization {
  const concordanceHits =
    item.groupedHits && item.groupedHits.length > 0 ? item.groupedHits : [item.row];
  const record = concordanceHits[0] ?? item.row;

  if (view.kind === 'dispersion') {
    // Previous and Next step through the document's matches (issue 429).
    const ordered = orderedConcordanceHits(item);
    const index = Math.min(Math.max(view.matchIndex ?? 0, 0), ordered.length - 1);
    const current = ordered[index] ?? record;
    const colorOf = (hit: Record<string, unknown>) =>
      view.termColors[matchedTextOf(hit)] ?? CONCORDANCE_DETAIL_COLOR;
    const hits = detailHits(ordered, colorOf, index);
    return {
      title: 'Match Details',
      label: 'Dispersion',
      anchorKey: index,
      summaryFields: [
        { label: 'Search word', value: searchWord, highlight: true },
        {
          label: 'Match',
          value: (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              {`${String(index + 1)} of ${String(ordered.length)}`}
              <ConcordanceMatchedForm form={matchedTextOf(current)} color={colorOf(current)} />
            </span>
          ),
        },
        ...neighbourFields(current),
      ],
      renderDocumentText: (text: string) => renderConcordanceDetailText(text, hits),
    };
  }

  const hits = detailHits([record], () => CONCORDANCE_DETAIL_COLOR, 0);
  return {
    label: 'Concordance',
    summaryFields: [
      { label: 'Search word', value: searchWord, highlight: true },
      { label: 'Matches', value: String(concordanceHits.length) },
      ...neighbourFields(record),
    ],
    renderDocumentText: (text: string) => renderConcordanceDetailText(text, hits),
  };
}
