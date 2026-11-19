import type { CSSProperties } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import {
  AGREEMENT_SHADE,
  cellShade,
  displayLabel,
  FAR_APART_SHADE,
  formatCount,
  matrixCodes,
  matrixCount,
  SCALE_KEY_TEXT,
} from '@/features/views/common/agreementMatrixImage';
import type { ConfusionCount, OrderedScale } from '@/features/views/common/columnComparisonModel';

/** A cell's background: green where the codes agree, orange by distance on a scale. */
const cellStyle = (
  scale: OrderedScale | null,
  reference: string,
  comparison: string,
): CSSProperties | undefined => {
  const shade = cellShade(scale, reference, comparison);
  return shade ? { backgroundColor: shade } : undefined;
};

const ShadeSwatch = ({ background }: { background: string }) => (
  <span
    aria-hidden="true"
    className="inline-block h-3 w-4 shrink-0 rounded-sm"
    style={{ background }}
  />
);

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
  const labels = matrixCodes(rows, scale);
  const count = matrixCount(rows);
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
                  style={cellStyle(scale, referenceLabel, comparisonLabel)}
                >
                  {formatCount(count(referenceLabel, comparisonLabel))}
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
                background: `linear-gradient(to right, transparent, ${FAR_APART_SHADE})`,
              }}
            />
            {SCALE_KEY_TEXT}
          </p>
        ) : null}
      </div>
    </div>
  );
}
