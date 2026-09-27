import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FrequencyComparisonProps {
  rows: Record<string, unknown>[];
  colors?: string[];
  label: string;
  sort: string;
  descending: boolean;
  onSort: (key: string) => void;
  onTokenContextMenu?: (token: string) => void;
  onTokenClick?: (token: string) => void;
}

interface ComparisonColumn {
  key: string;
  label: string;
  explanation: string;
  format?: 'count' | 'percent' | 'precise' | 'significance' | 'direction' | 'signed';
}

const columns: ComparisonColumn[] = [
  { key: 'token', label: 'Token', explanation: 'The token compared across both corpora.' },
  {
    key: 'freq_corpus_0',
    label: 'Reference count',
    explanation: 'Observed token count in the Reference corpus.',
    format: 'count',
  },
  {
    key: 'percent_corpus_0',
    label: 'Reference %',
    explanation: 'Token count as a percentage of all tokens in Reference.',
    format: 'percent',
  },
  {
    key: 'freq_corpus_1',
    label: 'Study count',
    explanation: 'Observed token count in the Study corpus.',
    format: 'count',
  },
  {
    key: 'percent_corpus_1',
    label: 'Study %',
    explanation: 'Token count as a percentage of all tokens in Study.',
    format: 'percent',
  },
  {
    key: 'overuse',
    label: 'Overuse',
    explanation:
      'The corpus with the higher relative token frequency. Equal means matching proportions, regardless of corpus size.',
    format: 'direction',
  },
  {
    key: 'signed_ll',
    label: 'Signed LL',
    explanation:
      'Log likelihood with direction: positive for higher relative frequency in Reference, negative for Study, and zero for equal proportions.',
    format: 'signed',
  },
  {
    key: 'percent_diff',
    label: 'Difference %',
    explanation:
      '100 × (Reference relative frequency − Study relative frequency) / Study relative frequency. When Study count is zero, the published method substitutes 1e-18, producing an extremely large value.',
    format: 'percent',
  },
  {
    key: 'relative_risk',
    label: 'Relative risk',
    explanation:
      'Reference relative frequency divided by Study relative frequency; 1 means equal frequency.',
  },
  {
    key: 'log_ratio',
    label: 'LogRatio',
    explanation:
      'Base-2 logarithm of the Reference-to-Study relative-frequency ratio, using 0.5 for a zero count. Positive means higher in Reference.',
    format: 'precise',
  },
  {
    key: 'odds_ratio',
    label: 'Odds ratio',
    explanation: 'Reference token odds divided by Study token odds; 1 means equal odds.',
  },
  {
    key: 'log_likelihood_llv',
    label: 'LL',
    explanation:
      'Log likelihood measures evidence of a frequency difference, without its direction.',
  },
  {
    key: 'bayes_factor_bic',
    label: 'BIC',
    explanation:
      'Log likelihood minus the natural logarithm of the combined token total; larger values indicate stronger evidence.',
  },
  {
    key: 'effect_size_ell',
    label: 'ELL',
    explanation:
      'Effect-size estimate adjusted for the combined corpus size and expected token frequency.',
    format: 'precise',
  },
  {
    key: 'significance',
    label: 'Significance',
    explanation:
      'Log-likelihood thresholds: * ≥ 3.84, ** ≥ 6.63, *** ≥ 10.83, **** ≥ 15.13. n.s. means no threshold reached.',
    format: 'significance',
  },
];

function displayValue(value: unknown, format?: ComparisonColumn['format']): string {
  if (format === 'direction') return typeof value === 'string' ? value : '—';
  if (format === 'significance') return typeof value === 'string' ? value || 'n.s.' : '—';
  if (format === 'count') {
    return typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : '—';
  }
  if (typeof value !== 'number') return '—';
  if (Number.isNaN(value)) return 'Undefined';
  if (!Number.isFinite(value)) return value > 0 ? '+∞' : '−∞';
  const number =
    Math.abs(value) >= 1e6 ? value.toExponential(2) : value.toFixed(format === 'precise' ? 4 : 2);
  return `${format === 'signed' && value > 0 ? '+' : ''}${number}${format === 'percent' ? '%' : ''}`;
}

/** Server ordering and projection remain authoritative; this table only presents rows. */
export function FrequencyComparison({
  rows,
  colors = [],
  label,
  sort,
  descending,
  onSort,
  onTokenContextMenu,
  onTokenClick,
}: FrequencyComparisonProps) {
  return (
    <TooltipProvider>
      <div className="min-w-0 space-y-2">
        <p className="text-label-secondary text-description">
          Ratios compare Reference to Study. Positive LogRatio means higher relative frequency in
          Reference; negative means higher in Study. Difference % uses a tiny denominator when Study
          count is zero; very large values use scientific notation.
        </p>
        <Table aria-label={label} className="w-max min-w-full" containerClassName="max-w-full">
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort === column.key ? (descending ? 'descending' : 'ascending') : 'none'
                  }
                  className="whitespace-nowrap"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        title={column.explanation}
                        aria-label={`Sort by ${column.label}`}
                        className="inline-flex items-center gap-1 rounded-sm py-1 outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={() => {
                          onSort(column.key);
                        }}
                      >
                        {column.label}
                        {sort !== column.key ? (
                          <ArrowUpDown aria-hidden="true" className="size-3" />
                        ) : descending ? (
                          <ArrowDown aria-hidden="true" className="size-3" />
                        ) : (
                          <ArrowUp aria-hidden="true" className="size-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-80">{column.explanation}</TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const token = typeof row.token === 'string' ? row.token : '';
              return (
                <TableRow
                  key={token}
                  tabIndex={onTokenContextMenu ? 0 : undefined}
                  className="outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring"
                  title={
                    onTokenContextMenu
                      ? `${token}: right-click or press Shift+F10 to add to stopwords`
                      : undefined
                  }
                  onClick={() => {
                    onTokenClick?.(token);
                  }}
                  onContextMenu={(event) => {
                    if (!onTokenContextMenu) return;
                    event.preventDefault();
                    onTokenContextMenu(token);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && typeof token === 'string') {
                      event.preventDefault();
                      onTokenClick?.(token);
                    }
                    if (
                      onTokenContextMenu &&
                      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                    ) {
                      event.preventDefault();
                      onTokenContextMenu(token);
                    }
                  }}
                >
                  <TableCell className="max-w-56 break-words font-medium">{token}</TableCell>
                  {columns.slice(1).map((column) => (
                    <TableCell
                      key={column.key}
                      className="whitespace-nowrap text-right tabular-nums"
                    >
                      {column.format === 'direction' ? (
                        <span
                          style={{
                            color:
                              row.overuse === 'Reference'
                                ? colors[0]
                                : row.overuse === 'Study'
                                  ? colors[1]
                                  : undefined,
                          }}
                        >
                          {displayValue(row[column.key], column.format)}
                        </span>
                      ) : column.key === 'percent_diff' && String(row.freq_corpus_1) === '0' ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              className="rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              {displayValue(row[column.key], column.format)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-80">
                            Study count is zero. The %DIFF method divides by 1e-18; the stored value
                            is {String(row.percent_diff)}%.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        displayValue(row[column.key], column.format)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-6 text-center text-description">
                  No matching tokens.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
