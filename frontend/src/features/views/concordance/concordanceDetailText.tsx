import React from 'react';

/** The Topic Modelling viewer's default colour, used for the table view (issue 429). */
export const CONCORDANCE_DETAIL_COLOR = 'var(--vscode-charts-orange)';

/**
 * One match in the document, in the backend's code-point offsets. The left and
 * right contexts are the slices of the document just before and after it, so
 * their lengths place them exactly.
 */
export interface ConcordanceDetailHit {
  start: number;
  end: number;
  leftLength: number;
  rightLength: number;
  color: string;
  /** The match being read: bold, with its contexts; others get a light tint. */
  current: boolean;
}

type Part = 'match' | 'other' | 'context';
const PRIORITY: Record<Part, number> = { match: 3, other: 2, context: 1 };

interface Interval {
  start: number;
  end: number;
  part: Part;
  color: string;
}

const tint = (color: string, percent: number): React.CSSProperties => ({
  background: `color-mix(in srgb, ${color} ${String(percent)}%, transparent)`,
});

/**
 * Code-point offset -> JavaScript string index. The backend counts characters
 * as code points; the browser counts emoji and rare CJK characters as two.
 */
const codeUnitIndexer = (text: string): ((offset: number) => number) => {
  const indices = [0];
  let index = 0;
  for (const character of text) {
    index += character.length;
    indices.push(index);
  }
  const last = indices.length - 1;
  return (offset) => indices[Math.max(0, Math.min(offset, last))] ?? text.length;
};

/**
 * The document with the current match bold on a strong tint and its left and
 * right contexts on a pale tint of the same colour; other matches in the
 * document get a light tint of their own colour, as the Topic Modelling
 * segment viewer shows other segments. A match wins over a context it runs
 * into. The current match carries the anchor the Row Details box scrolls to.
 */
export function renderConcordanceDetailText(
  text: string,
  hits: readonly ConcordanceDetailHit[],
): React.ReactNode {
  if (text.length === 0 || hits.length === 0) return text;
  const toIndex = codeUnitIndexer(text);
  const intervals = hits.flatMap((hit): Interval[] => {
    const start = toIndex(hit.start);
    const end = toIndex(hit.end);
    if (end <= start) return [];
    if (!hit.current) return [{ start, end, part: 'other', color: hit.color }];
    const parts: Interval[] = [
      {
        start: toIndex(hit.start - hit.leftLength),
        end: start,
        part: 'context',
        color: hit.color,
      },
      { start, end, part: 'match', color: hit.color },
      {
        start: end,
        end: toIndex(hit.end + hit.rightLength),
        part: 'context',
        color: hit.color,
      },
    ];
    return parts.filter((interval) => interval.end > interval.start);
  });
  if (intervals.length === 0) return text;

  const boundaries = Array.from(
    new Set([0, text.length, ...intervals.flatMap((interval) => [interval.start, interval.end])]),
  ).sort((left, right) => left - right);
  const children: React.ReactNode[] = [];
  let anchorPlaced = false;
  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const start = boundaries[index] ?? 0;
    const end = boundaries[index + 1] ?? start;
    if (end <= start) continue;
    const shown = intervals
      .filter((interval) => interval.start <= start && interval.end >= end)
      .reduce<Interval | undefined>(
        (best, interval) =>
          best === undefined || PRIORITY[interval.part] > PRIORITY[best.part] ? interval : best,
        undefined,
      );
    const slice = text.slice(start, end);
    if (!shown) {
      children.push(<React.Fragment key={start}>{slice}</React.Fragment>);
      continue;
    }
    if (shown.part === 'context') {
      children.push(
        <span
          key={start}
          data-concordance-part="context"
          className="box-decoration-clone"
          style={tint(shown.color, 20)}
        >
          {slice}
        </span>,
      );
      continue;
    }
    const isCurrent = shown.part === 'match';
    const anchor = isCurrent && !anchorPlaced;
    if (anchor) anchorPlaced = true;
    children.push(
      <mark
        key={start}
        data-concordance-part={isCurrent ? 'match' : 'other-match'}
        {...(anchor ? { 'data-row-detail-anchor': '' } : {})}
        className={`rounded-sm text-foreground box-decoration-clone${isCurrent ? ' font-semibold' : ''}`}
        style={tint(shown.color, isCurrent ? 50 : 35)}
      >
        {slice}
      </mark>,
    );
  }
  return <>{children}</>;
}
