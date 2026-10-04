import { formatChartDate, type ChartDateUnit } from '@/lib/chartDates';

/**
 * Axis-label formatters that the interactive HTML chart download can rebuild
 * (issue 278). A chart option holds functions, which a downloaded file cannot
 * carry, so formatters on value axes are described by a spec instead, and the
 * app and the file both turn the spec into a function with
 * `formatterFromSpec`. Category axes need no spec: the download looks up each
 * category's label.
 */
export type PortableFormatterSpec =
  | { kind: 'percent'; round: boolean }
  | { kind: 'number' }
  | { kind: 'chartDate'; unit: ChartDateUnit; offsetMs: number };

const PORTABLE_FORMATTER_KEY = '__wordflowPortableFormatter';

/**
 * Turns a spec into a formatter. Self-contained on purpose: the HTML download
 * embeds this function's source, with `formatChartDate` passed in.
 */
export function formatterFromSpec(
  spec: PortableFormatterSpec,
  formatDate: (wallClockMs: number, unit: ChartDateUnit) => string,
): (value: unknown) => string {
  if (spec.kind === 'percent') {
    return (value) => {
      if (!spec.round) return `${String(value)}%`;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? `${String(Math.round(numeric))}%` : '';
    };
  }
  return (value) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return '';
    return spec.kind === 'chartDate'
      ? formatDate(numeric + spec.offsetMs, spec.unit)
      : String(numeric);
  };
}

/** An axis-label formatter for the app that the HTML download can rebuild. */
export function portableFormatter(spec: PortableFormatterSpec): (value: unknown) => string {
  const formatter = formatterFromSpec(spec, formatChartDate);
  Object.defineProperty(formatter, PORTABLE_FORMATTER_KEY, { value: spec });
  return formatter;
}

/** The spec behind a formatter made by `portableFormatter`, if any. */
export function portableFormatterSpec(value: unknown): PortableFormatterSpec | undefined {
  if (typeof value !== 'function') return undefined;
  const spec: unknown = Reflect.get(value, PORTABLE_FORMATTER_KEY);
  return spec && typeof spec === 'object' ? (spec as PortableFormatterSpec) : undefined;
}
