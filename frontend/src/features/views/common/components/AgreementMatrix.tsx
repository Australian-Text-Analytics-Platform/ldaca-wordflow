import type { CSSProperties } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import {
  type ConfusionCount,
  type OrderedScale,
  scaleDistance,
} from '@/features/views/common/columnComparisonModel';

const displayLabel = (value: string): string => (value === '' ? '(blank)' : value);

/** Agreement on the diagonal, in light green, for every matrix (Chao, 16 Nov 2026). */
const AGREEMENT_SHADE = 'color-mix(in srgb, var(--color-chart-3) 28%, transparent)';

/**
 * A cell's shade: light green where the two codes agree; on a scale, a
 * disagreement in orange by how far apart its two codes are.
 */
const cellShading = (
  scale: OrderedScale | null,
  reference: string,
  comparison: string,
): CSSProperties | undefined => {
  if (reference === comparison) return { backgroundColor: AGREEMENT_SHADE };
  const distance = scale ? scaleDistance(scale, reference, comparison) : null;
  if (!distance) return undefined;
  return {
    backgroundColor: `color-mix(in srgb, var(--color-chart-4) ${String(Math.round(12 + 48 * distance))}%, transparent)`,
  };
};

const ShadeSwatch = ({ background }: { background: string }) => (
  <span
    aria-hidden="true"
    className="inline-block h-3 w-4 shrink-0 rounded-sm"
    style={{ background }}
  />
);

/** Whole counts as they are; the shares of a multi-coder coincidence matrix to one decimal. */
const formatCount = (count: number): string =>
  Number.isInteger(count) ? String(count) : count.toFixed(1);

interface AgreementMatrixProps {
  rows: ConfusionCount[];
  scale: OrderedScale | null;
  /** What the rows and columns are, shown on the axes. */
  rowAxis: string;
  columnAxis: string;
  tableLabel: string;
  /** The key's line for the green diagonal. */
  agreementKey: string;
}

/**
 * A matrix of code against code, for a pair of columns (a confusion matrix)
 * or for several (Krippendorff's coincidence matrix). Codes go in scale order
 * on a scale; the diagonal is green, and on a scale each disagreement is
 * shaded orange by how far apart its codes are, with a key below.
 */
export function AgreementMatrix({
  rows,
  scale,
  rowAxis,
  columnAxis,
  tableLabel,
  agreementKey,
}: AgreementMatrixProps) {
  const scalePosition = new Map(
    [...(scale?.levels ?? []), ...(scale?.outside ?? [])].map(
      (label, index) => [label, index] as const,
    ),
  );
  const labels = Array.from(
    new Set(rows.flatMap((row) => [row.reference, row.comparison])),
  ).toSorted(
    (a, b) =>
      (scalePosition.get(a) ?? Infinity) - (scalePosition.get(b) ?? Infinity) || a.localeCompare(b),
  );
  const countByPair = new Map(
    rows.map((row) => [JSON.stringify([row.reference, row.comparison]), row.count]),
  );
  return (
    <div className="grid grid-cols-[auto_auto] grid-rows-[auto_auto] gap-x-2 gap-y-1">
      <div
        aria-label={`${columnAxis} column axis`}
        className="col-start-2 row-start-1 flex items-center justify-center gap-1 border-b border-widget-foreground/25 pb-1 font-medium"
      >
        <span>{columnAxis}</span>
        <ArrowRight aria-hidden="true" className="size-3" />
      </div>
      <div
        aria-label={`${rowAxis} row axis`}
        className="col-start-1 row-start-2 flex flex-col items-center justify-center gap-1 border-r border-widget-foreground/25 pr-1.5 font-medium"
      >
        <span className="rotate-180 [writing-mode:vertical-rl]">{rowAxis}</span>
        <ArrowDown aria-hidden="true" className="size-3" />
      </div>
      <table
        aria-label={tableLabel}
        className="col-start-2 row-start-2 border-separate border-spacing-x-2 border-spacing-y-1 text-label-secondary tabular-nums"
      >
        <caption className="sr-only">
          Rows are {rowAxis}; columns are {columnAxis}.
        </caption>
        <thead>
          <tr>
            <th className="px-1 font-normal" scope="col">
              <span className="sr-only">Row label</span>
            </th>
            {labels.map((comparisonLabel) => (
              <th
                key={comparisonLabel}
                className="px-1 text-center text-widget-foreground/80"
                scope="col"
              >
                {displayLabel(comparisonLabel)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((referenceLabel) => (
            <tr key={referenceLabel}>
              <th className="pr-2 text-right text-widget-foreground/80" scope="row">
                {displayLabel(referenceLabel)}
              </th>
              {labels.map((comparisonLabel) => (
                <td
                  key={comparisonLabel}
                  className="min-w-8 rounded-sm px-1 text-center font-medium"
                  style={cellShading(scale, referenceLabel, comparisonLabel)}
                >
                  {formatCount(
                    countByPair.get(JSON.stringify([referenceLabel, comparisonLabel])) ?? 0,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="col-start-2 row-start-3 mt-1 max-w-sm space-y-0.5 whitespace-normal text-label-secondary text-widget-foreground/80"
        data-testid="reliability-shading-key"
      >
        <p className="flex items-center gap-1.5">
          <ShadeSwatch background={AGREEMENT_SHADE} />
          {agreementKey}
        </p>
        {scale ? (
          <p className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-8 shrink-0 rounded-sm"
              style={{
                background:
                  'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-chart-4) 60%, transparent))',
              }}
            />
            Orange: how far apart the two codes are on the scale. Darkest: the two ends, or a code
            outside the scale.
          </p>
        ) : null}
      </div>
    </div>
  );
}
