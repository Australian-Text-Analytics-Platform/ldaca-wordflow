import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type FilterFn,
  type SortingState,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from 'lucide-react';
import { startTransition, useMemo, useState } from 'react';
import HelpIcon from '@/components/help/HelpIcon';
import { renderColumnPart } from '@/lib/table/renderColumnPart';
import { useStableTableHeight } from '@/lib/table/useStableTableHeight';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TokenFrequencyStatisticsEntry } from '../../tokenFrequencyAdapters';
import { createTokenFilterMatcher } from '../../tokenFrequencyAdapters';
import { ServerPaginationFooter } from '@/features/views/common/components/ServerPaginationFooter';

export type EnhancedStatisticsRow = TokenFrequencyStatisticsEntry & {
  overuse: boolean;
  signed_ll: number;
  sort_token: string;
  sort_freq_reference: number;
  sort_percent_reference: number;
  sort_freq_study: number;
  sort_percent_study: number;
  sort_log_likelihood_llv: number;
  sort_percent_diff: number;
  sort_bayes_factor_bic: number;
  sort_effect_size_ell: number;
  sort_relative_risk: number;
  sort_log_ratio: number;
  sort_odds_ratio: number;
  sort_significance: number;
};

interface Props {
  statistics: TokenFrequencyStatisticsEntry[];
  onDownloadFrequencyCsv: (label: string, rows: unknown[]) => void;
  /**
   * Optional concordance handoff. When provided, each token in the table
   * becomes a button that opens a concordance search for that token across
   * both compared corpora (no per-node scoping).
   */
  onTokenClick?: (token: string) => void;
  /** Controlled wildcard filter shared by every result surface. */
  tokenFilter?: string;
  /**
   * Display name + colour for the reference and study Data Blocks.
   */
  referenceNodeName?: string | null;
  referenceColor?: string | null;
  studyNodeName?: string | null;
  studyColor?: string | null;
}

/** Used by: token-frequency statistics sorting helpers; parses backend statistic values, including string infinities. */
const parseStatisticsNumericValue = (value: unknown): number => {
  if (value === null || value === undefined) return NaN;
  if (value === '+Inf') return Number.POSITIVE_INFINITY;
  if (value === '-Inf') return Number.NEGATIVE_INFINITY;
  return Number(value);
};

/** Used by: TokenFrequencyStatisticsTable column cells to format compact statistic values. */
const formatNumber = (
  value: unknown,
  options: { decimals?: number; suffix?: string; fallback?: string } = {},
) => {
  const { decimals = 2, suffix = '', fallback = 'N/A' } = options;
  if (value === '+Inf') return `+∞${suffix}`;
  if (value === '-Inf') return `-∞${suffix}`;
  const parsed = parseStatisticsNumericValue(value);
  if (!Number.isFinite(parsed)) return fallback;
  return `${parsed.toFixed(decimals)}${suffix}`;
};

/** Used by: TokenFrequencyStatisticsTable signed-LL column cell to show direction markers. */
const formatSignedLL = (value: number): string => {
  if (!Number.isFinite(value)) return 'N/A';
  const abs = Math.abs(value).toFixed(2);
  return value >= 0 ? `+${abs}` : `-${abs}`;
};

/** Used by: enhanceRows to convert significance stars into an ordinal sort key. */
const significanceRank = (sig: string | undefined): number => (sig ?? '').length;

const tokenStatisticsTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

/** Used by: TokenFrequencyStatisticsTable column definitions as the parent-controlled wildcard token filter. */
const tokenWildcardFilter: FilterFn<typeof tokenStatisticsTableFeatures, EnhancedStatisticsRow> = (
  row,
  _columnId,
  filterValue,
) => {
  const pattern = String(filterValue ?? '').trim();
  return createTokenFilterMatcher(pattern)(row.original.sort_token);
};

const columnHelper = createColumnHelper<
  typeof tokenStatisticsTableFeatures,
  EnhancedStatisticsRow
>();

// Plain explanations for the abbreviated headers (issue 205); each header
// tooltip ends with "Click to sort."
const STATISTICS_COLUMN_TOOLTIPS: Record<string, string> = {
  token: 'The word (token) being compared.',
  freq_reference: 'OR: how many times the token occurs in the Reference corpus.',
  percent_reference: "%R: the token's share of all tokens in the Reference corpus.",
  freq_study: 'OS: how many times the token occurs in the Study corpus.',
  percent_study: "%S: the token's share of all tokens in the Study corpus.",
  log_likelihood_llv:
    'LL (log-likelihood): how sure we can be that the difference is real. Above 3.84 is significant (p < 0.05); above 15.13, p < 0.0001.',
  overuse: 'Overuse: which corpus uses the token more, for its size: Study or Reference.',
  signed_ll:
    'Signed LL: LL with a sign, positive when the token is more frequent in Study and negative when it is more frequent in Reference.',
  percent_diff:
    '%DIFF: how much more (or less) frequent the token is in Study than in Reference, as a percentage. 0 means the same; N/A means the token never occurs in Reference.',
  bayes_factor_bic:
    'Bayes (Bayes factor, BIC): how strong the evidence for a difference is. Above 2 is positive, above 6 strong, above 10 very strong.',
  effect_size_ell:
    'ELL (effect size for log-likelihood): how big the difference is, allowing for the corpus sizes. Unlike LL, it does not grow just because the corpora are larger.',
  relative_risk:
    'RRisk (relative risk): Study relative frequency divided by Reference. 1 means the same; 2 means twice as frequent in Study.',
  log_ratio:
    'LogRatio: RRisk on a log2 scale. 0 means the same; 1 twice as frequent in Study; -1 half as frequent.',
  odds_ratio:
    'OddsRatio: the odds of the token in Study divided by its odds in Reference. 1 means the same.',
  significance:
    'Significance, from LL: **** p < 0.0001, *** p < 0.001, ** p < 0.01, * p < 0.05, n.s. not significant.',
};

/**
 * Called by: TokenFrequencyStatisticsTable because it needs TanStack Table column definitions for the keyness grid. Flow: build accessors, attach renderers and filters, then return the column list consumed by the table instance.
 * ``onTokenClick`` (when provided) makes the token cell a button that hands the
 * token to a fresh concordance tab across both compared corpora.
 */
const buildColumns = (
  onTokenClick?: (token: string) => void,
  referenceColor?: string | null,
  studyColor?: string | null,
) =>
  columnHelper.columns([
    columnHelper.accessor('sort_token', {
      id: 'token',
      header: 'Token',
      /** Used by: TanStack Table token column to render the original backend token label, optionally as a concordance-launching button,. */
      cell: (info) => {
        const token = info.row.original.token;
        if (!onTokenClick) {
          return <span className="font-medium">{token}</span>;
        }
        return (
          <button
            type="button"
            className="cursor-pointer font-medium text-left underline-offset-2 hover:underline focus-visible:underline"
            onClick={() => {
              onTokenClick(token);
            }}
            title="Click to inspect in concordance across both corpora."
          >
            {token}
          </button>
        );
      },
      filterFn: tokenWildcardFilter,
    }),
    columnHelper.accessor('sort_freq_reference', {
      id: 'freq_reference',
      header: 'OR',
      /** Used by: TanStack Table OR column to render observed reference frequency as an integer count. */
      cell: (info) => formatNumber(info.row.original.freq_reference, { decimals: 0 }),
    }),
    columnHelper.accessor('sort_percent_reference', {
      id: 'percent_reference',
      header: '%R',
      /** Used by: TanStack Table %R column to render reference percentage with a percent suffix. */
      cell: (info) =>
        formatNumber(info.row.original.percent_reference, { decimals: 2, suffix: '%' }),
    }),
    columnHelper.accessor('sort_freq_study', {
      id: 'freq_study',
      header: 'OS',
      /** Used by: TanStack Table OS column to render observed study frequency as an integer count. */
      cell: (info) => formatNumber(info.row.original.freq_study, { decimals: 0 }),
    }),
    columnHelper.accessor('sort_percent_study', {
      id: 'percent_study',
      header: '%S',
      /** Used by: TanStack Table %S column to render study percentage with a percent suffix. */
      cell: (info) => formatNumber(info.row.original.percent_study, { decimals: 2, suffix: '%' }),
    }),
    columnHelper.accessor('sort_log_likelihood_llv', {
      id: 'log_likelihood_llv',
      header: 'LL',
      /** Used by: TanStack Table LL column to render log-likelihood for the comparative token row. */
      cell: (info) => formatNumber(info.row.original.log_likelihood_llv, { decimals: 2 }),
    }),
    columnHelper.accessor('overuse', {
      header: 'Overuse',
      /** Used by: TanStack Table Overuse column to identify the Data Block with the higher observed frequency. */
      cell: (info) => {
        const isOveruse = info.getValue();
        const directionColor = isOveruse ? studyColor : referenceColor;
        const fallbackClass = isOveruse
          ? 'bg-[color-mix(in_srgb,var(--vscode-charts-green)_12%,transparent)] text-foreground'
          : 'bg-rose-100 text-rose-800';
        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-label-secondary font-semibold ${directionColor ? 'text-button-foreground' : fallbackClass}`}
            style={{ backgroundColor: directionColor ?? undefined }}
          >
            {isOveruse ? 'Study' : 'Reference'}
          </span>
        );
      },
    }),
    columnHelper.accessor('signed_ll', {
      header: 'Signed LL',
      /** Used by: TanStack Table Signed LL column after overuse direction has been applied. */
      cell: (info) => <span className="tabular-nums">{formatSignedLL(info.getValue())}</span>,
    }),
    columnHelper.accessor('sort_percent_diff', {
      id: 'percent_diff',
      header: '%DIFF',
      /** Used by: TanStack Table %DIFF column to render percent difference as a percentage value. */
      cell: (info) =>
        // polars-text returns a percentage already (issue 197).
        formatNumber(info.row.original.sort_percent_diff, { decimals: 2, suffix: '%' }),
    }),
    columnHelper.accessor('sort_bayes_factor_bic', {
      id: 'bayes_factor_bic',
      header: 'Bayes',
      /** Used by: TanStack Table Bayes column to render the Bayes factor statistic. */
      cell: (info) => formatNumber(info.row.original.bayes_factor_bic, { decimals: 2 }),
    }),
    columnHelper.accessor('sort_effect_size_ell', {
      id: 'effect_size_ell',
      header: 'ELL',
      /** Used by: TanStack Table ELL column to render the effect-size estimate with extra precision. */
      cell: (info) => formatNumber(info.row.original.effect_size_ell, { decimals: 4 }),
    }),
    columnHelper.accessor('sort_relative_risk', {
      id: 'relative_risk',
      header: 'RRisk',
      /** Used by: TanStack Table RRisk column to render relative risk for the token comparison. */
      cell: (info) => formatNumber(info.row.original.relative_risk, { decimals: 2 }),
    }),
    columnHelper.accessor('sort_log_ratio', {
      id: 'log_ratio',
      header: 'LogRatio',
      /** Used by: TanStack Table LogRatio column to render precision suitable for directional comparison. */
      cell: (info) => formatNumber(info.row.original.log_ratio, { decimals: 4 }),
    }),
    columnHelper.accessor('sort_odds_ratio', {
      id: 'odds_ratio',
      header: 'OddsRatio',
      /** Used by: TanStack Table OddsRatio column to render export-parity odds ratio values. */
      cell: (info) => formatNumber(info.row.original.odds_ratio, { decimals: 2 }),
    }),
    columnHelper.accessor('sort_significance', {
      id: 'significance',
      header: 'Significance',
      /** Used by: TanStack Table Significance column to render stars as an accessibility-friendly badge. */
      cell: (info) => {
        const significance = info.row.original.significance;
        const badgeClass =
          significance === '****'
            ? 'bg-error-background text-error'
            : significance === '***'
              ? 'bg-orange-100 text-orange-800'
              : significance === '**'
                ? 'bg-[var(--vscode-editor-findMatchHighlightBackground)] text-foreground'
                : significance === '*'
                  ? 'bg-[color-mix(in_srgb,var(--vscode-charts-green)_12%,transparent)] text-foreground'
                  : 'bg-panel text-description';
        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-label-secondary font-semibold ${badgeClass}`}
          >
            {significance ?? 'n.s.'}
          </span>
        );
      },
    }),
  ]);

/**
 * Used by: TokenFrequencyStatisticsTable to enrich backend statistics with sort keys and derived overuse direction.
 * Flow: coerce reference/study frequencies and statistics into sortable numbers, compute overuse and signed LL, then attach sort fields to each row.
 */
const enhanceRows = (statistics: TokenFrequencyStatisticsEntry[]): EnhancedStatisticsRow[] =>
  statistics.map((stat) => {
    // Compare relative frequencies, not raw counts, so blocks of different
    // sizes get the right direction (issue 168).
    const overuse =
      parseStatisticsNumericValue(stat.percent_study) >
      parseStatisticsNumericValue(stat.percent_reference);
    const ll = parseStatisticsNumericValue(stat.log_likelihood_llv);
    const llAbs = Number.isFinite(ll) ? Math.abs(ll) : NaN;
    const signed_ll = Number.isFinite(llAbs) ? (overuse ? llAbs : -llAbs) : NaN;
    return {
      ...stat,
      overuse,
      signed_ll,
      sort_token: stat.token,
      sort_freq_reference: parseStatisticsNumericValue(stat.freq_reference),
      sort_percent_reference: parseStatisticsNumericValue(stat.percent_reference),
      sort_freq_study: parseStatisticsNumericValue(stat.freq_study),
      sort_percent_study: parseStatisticsNumericValue(stat.percent_study),
      sort_log_likelihood_llv: parseStatisticsNumericValue(stat.log_likelihood_llv),
      // No Reference hits leaves %DIFF undefined; polars-text divides by
      // 1e-18 instead, so show N/A (issue 197).
      sort_percent_diff:
        parseStatisticsNumericValue(stat.freq_reference) === 0
          ? NaN
          : parseStatisticsNumericValue(stat.percent_diff),
      sort_bayes_factor_bic: parseStatisticsNumericValue(stat.bayes_factor_bic),
      sort_effect_size_ell: parseStatisticsNumericValue(stat.effect_size_ell),
      sort_relative_risk: parseStatisticsNumericValue(stat.relative_risk),
      sort_log_ratio: parseStatisticsNumericValue(stat.log_ratio),
      sort_odds_ratio: parseStatisticsNumericValue(stat.odds_ratio),
      sort_significance: significanceRank(stat.significance),
    };
  });

/**
 * Rendered by: TokenFrequencyUnifiedTokenSection to show the paginated comparative statistics table for keyness results.
 */
export const TokenFrequencyStatisticsTable = ({
  statistics,
  onDownloadFrequencyCsv,
  onTokenClick,
  tokenFilter: tokenFilterProp,
  referenceNodeName,
  referenceColor,
  studyNodeName,
  studyColor,
}: Props) => {
  const data = useMemo(() => enhanceRows(statistics), [statistics]);
  const columns = useMemo(
    () => buildColumns(onTokenClick, referenceColor, studyColor),
    [onTokenClick, referenceColor, studyColor],
  );

  const [sorting, setSorting] = useState<SortingState>([{ id: 'log_likelihood_llv', desc: true }]);
  // Rows replaced by a sort or page change must not shrink the scrolling pane (issue 209).
  const stableTableRef = useStableTableHeight<HTMLDivElement>();
  const tokenFilter = tokenFilterProp ?? '';
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: 50,
    tokenFilter,
  });
  const pagination =
    paginationState.tokenFilter === tokenFilter
      ? paginationState
      : { pageIndex: 0, pageSize: paginationState.pageSize, tokenFilter };
  const columnFilters = useMemo(
    () => (tokenFilter.trim() ? [{ id: 'token', value: tokenFilter }] : []),
    [tokenFilter],
  );

  const table = useTable({
    features: tokenStatisticsTableFeatures,
    data,
    columns,
    state: { sorting, pagination, columnFilters },
    /** Used by: TanStack Table sorting state to keep large tables responsive during header clicks. */
    onSortingChange: (updater) => {
      startTransition(() => {
        setSorting(updater);
      });
    },
    onPaginationChange: (updater) => {
      setPaginationState((previous) => {
        const current =
          previous.tokenFilter === tokenFilter
            ? previous
            : { pageIndex: 0, pageSize: previous.pageSize, tokenFilter };
        const next = typeof updater === 'function' ? updater(current) : updater;
        return { ...next, tokenFilter };
      });
    },
    enableMultiSort: false,
  });

  /**
   * Called by: TokenFrequencyStatisticsTable download button to export filtered or sorted keyness rows.
   * Flow: choose sorted rows, filtered rows, or full data based on table state and token filter, then delegate CSV download with the keyness label.
   */
  const handleDownload = () => {
    const rows = table.getSortedRowModel().rows.map((row) => row.original);
    const effectiveRows = table.getFilteredRowModel().rows.map((row) => row.original);
    const downloadRows = tokenFilter.trim() ? effectiveRows : rows.length > 0 ? rows : data;
    onDownloadFrequencyCsv('token-keyness', downloadRows);
  };

  const pageIndex = table.state.pagination.pageIndex;
  const pageSize = table.state.pagination.pageSize;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty reference name must still let the study name show the legend, so falsy '' must fall through
  const hasCorpusLegend = Boolean(referenceNodeName || studyNodeName);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div
        role="region"
        aria-label="Keyword Analysis statistics"
        className="space-y-3 rounded-lg border p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Keyword Analysis</h4>
              <HelpIcon
                targetKey="analysis.token-frequency.statistical-measures"
                label="Keyword Analysis"
                tooltip="Comparative token-level keyness statistics for the two selected Data Blocks."
              />
            </div>
            {hasCorpusLegend ? (
              <div className="flex flex-wrap items-center gap-4 text-body">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      aria-label={`Reference: ${referenceNodeName ?? '—'}`}
                      className="inline-flex cursor-help items-center gap-1.5"
                    >
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 rounded-sm"
                        style={{ backgroundColor: referenceColor ?? undefined }}
                      />
                      <span>Reference</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{referenceNodeName ?? '—'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      aria-label={`Study: ${studyNodeName ?? '—'}`}
                      className="inline-flex cursor-help items-center gap-1.5"
                    >
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 rounded-sm"
                        style={{ backgroundColor: studyColor ?? undefined }}
                      />
                      <span>Study</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{studyNodeName ?? '—'}</TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label="Download frequencies"
            title="Download frequencies"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {tokenFilter ? (
          <p className="text-label-secondary text-description">
            {filteredCount} match{filteredCount !== 1 ? 'es' : ''} of {totalCount}
          </p>
        ) : null}

        {totalCount > 0 ? (
          <>
            <div className="overflow-x-auto">
              <div ref={stableTableRef}>
                <table className="w-full min-w-300 border-collapse text-body">
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b text-left">
                        {headerGroup.headers.map((header) => {
                          const sortDir = header.column.getIsSorted();
                          const tooltip =
                            `${STATISTICS_COLUMN_TOOLTIPS[header.id] ?? ''} Click to sort.`.trim();
                          return (
                            <th key={header.id} className="px-2 py-2 whitespace-nowrap">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto px-0"
                                    onClick={header.column.getToggleSortingHandler()}
                                  >
                                    {renderColumnPart(
                                      header.column.columnDef.header,
                                      header.getContext(),
                                    )}
                                    {sortDir === 'asc' ? (
                                      <ArrowUp className="ml-1 h-3.5 w-3.5" />
                                    ) : sortDir === 'desc' ? (
                                      <ArrowDown className="ml-1 h-3.5 w-3.5" />
                                    ) : (
                                      <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
                              </Tooltip>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-2 py-1 whitespace-nowrap tabular-nums">
                            {renderColumnPart(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* What the stars mean (issue 205). */}
            <p className="text-label-secondary text-description">
              Significance, from LL: **** p &lt; 0.0001 (LL above 15.13), *** p &lt; 0.001 (above
              10.83), ** p &lt; 0.01 (above 6.63), * p &lt; 0.05 (above 3.84), n.s. not significant.
            </p>

            {filteredCount === 0 ? (
              <p className="text-body text-description">No tokens match the current filter.</p>
            ) : (
              // The shared footer every table uses, labelled by unit (issue 205).
              <ServerPaginationFooter
                table={table}
                pageIndex={pageIndex}
                pageSize={pageSize}
                rowCount={filteredCount}
                pageSizeOptions={[20, 50, 100, 200]}
                pageSizeLabel="Words per page"
              />
            )}
          </>
        ) : (
          <p className="text-body text-description">No statistics available.</p>
        )}
      </div>
    </TooltipProvider>
  );
};
