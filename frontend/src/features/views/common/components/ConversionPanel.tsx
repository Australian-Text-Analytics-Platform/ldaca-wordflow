import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  checkConversion,
  getDatetimeFormats,
  type CastNodeEditRequest,
  type ConversionCheckResource,
  type DatetimeFormatCandidate,
  type DatetimeFormatsResource,
} from '@/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import {
  DATE_TEXT_PARTS,
  DATE_TEXT_PRESETS,
  describeFormat,
  formatFromSegments,
  rolesFor,
  segmentsFromFormat,
  segmentsFromValue,
  type FormatSegment,
} from '../utils/dateFormatBuilder';

/** How a column's values are written, sent with the type change (issue 322). */
export type CastExtras = Partial<
  Pick<
    CastNodeEditRequest,
    | 'datetime_format'
    | 'epoch_unit'
    | 'excel_serial'
    | 'two_digit_year_start'
    | 'decimal_mark'
    | 'thousands_separator'
    | 'ignore_symbols'
  >
>;

export type ConversionMode = 'date' | 'number' | 'date-text';

interface ConversionPanelProps {
  open: boolean;
  workspaceId: string | undefined;
  nodeId: string | undefined;
  columnName: string;
  mode: ConversionMode;
  /** The type being converted to. */
  target: 'datetime' | 'date' | 'integer' | 'float' | 'string';
  /** The plain name of that type, for the title. */
  targetLabel: string;
  /** The source holds a date and time, so time presets apply (date to text). */
  sourceHasTime?: boolean;
  onClose: () => void;
  onConfirm: (extras: CastExtras) => void;
}

/**
 * The type conversion window (issue 322): says how the values are written,
 * shows what they become, and checks the whole column before converting.
 * Opened from a column's type menu for: text, category or numbers to a date or
 * date and time; text or category to a number; a date to text.
 */
export function ConversionPanel({ open, onClose, ...props }: ConversionPanelProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && <ConversionPanelContent {...props} onClose={onClose} />}
    </Dialog>
  );
}

function ConversionPanelContent({
  workspaceId,
  nodeId,
  columnName,
  mode,
  target,
  targetLabel,
  sourceHasTime = false,
  onClose,
  onConfirm,
}: Omit<ConversionPanelProps, 'open'>) {
  const [extras, setExtras] = useState<CastExtras>(() =>
    mode === 'number'
      ? { decimal_mark: '.', thousands_separator: ',', ignore_symbols: true }
      : mode === 'date-text'
        ? { datetime_format: sourceHasTime ? '%Y-%m-%d %H:%M' : '%Y-%m-%d' }
        : {},
  );
  const detection = useQuery({
    queryKey: [
      'workspaces',
      workspaceId ?? '',
      'nodes',
      nodeId ?? '',
      'datetime-formats',
      columnName,
    ],
    enabled: mode === 'date' && Boolean(workspaceId && nodeId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data } = await getDatetimeFormats({
        path: { workspace_id: workspaceId ?? '', node_id: nodeId ?? '' },
        query: { column: columnName },
        signal,
        throwOnError: true,
      });
      return data;
    },
  });

  // Start from the best fit; an Excel day number is never chosen for you.
  const detected = detection.data;
  const [seeded, setSeeded] = useState(false);
  if (mode === 'date' && detected && !seeded) {
    setSeeded(true);
    const best = detected.candidates.find((candidate) => candidate.kind !== 'excel');
    if (best) setExtras(extrasFor(best));
  }

  const ready = isComplete(mode, extras);
  // Re-check the whole column a moment after each change.
  const [checked, setChecked] = useState<CastExtras | null>(null);
  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => {
      setChecked(extras);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [extras, ready]);
  const check = useQuery({
    queryKey: [
      'workspaces',
      workspaceId ?? '',
      'nodes',
      nodeId ?? '',
      'conversion-check',
      columnName,
      target,
      checked,
    ],
    enabled: ready && checked !== null && Boolean(workspaceId && nodeId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data } = await checkConversion({
        path: { workspace_id: workspaceId ?? '', node_id: nodeId ?? '' },
        body: { column: columnName, target_type: target, ...(checked ?? {}) },
        signal,
        throwOnError: true,
      });
      return data;
    },
  });
  const checkIsCurrent = checked !== null && JSON.stringify(checked) === JSON.stringify(extras);

  return (
    <DialogContent className="w-full max-w-xl border-none bg-transparent p-0 shadow-none">
      <DialogHeader className="sr-only">
        <DialogTitle>{`Convert ${columnName} to ${targetLabel}`}</DialogTitle>
        <DialogDescription>
          Say how the values are written, then check the result.
        </DialogDescription>
      </DialogHeader>
      <Card>
        <CardHeader>
          <CardTitle>
            Convert <span className="text-description">&ldquo;{columnName}&rdquo;</span> to{' '}
            {targetLabel}
          </CardTitle>
          <CardDescription>
            {mode === 'date'
              ? 'How are the dates written? Wordflow has looked at the first values; check the result below before converting.'
              : mode === 'number'
                ? 'How are the numbers written? Check the result below before converting.'
                : 'How should the dates be written as text?'}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[65vh] space-y-4 overflow-y-auto">
          {mode === 'date' ? (
            detection.isError ? (
              <ErrorNotice error={detection.error} fallback="Couldn't read the column's values." />
            ) : detected ? (
              <DateSection detected={detected} extras={extras} onChange={setExtras} />
            ) : (
              <p className="text-body text-description">Reading the values…</p>
            )
          ) : mode === 'number' ? (
            <NumberSection extras={extras} onChange={setExtras} />
          ) : (
            <DateTextSection extras={extras} sourceHasTime={sourceHasTime} onChange={setExtras} />
          )}
          <CheckSection
            ready={ready}
            pending={!checkIsCurrent || check.isFetching}
            result={check.data}
            error={check.isError ? check.error : null}
            target={target}
          />
        </CardContent>
        <CardFooter className="border-t border-surface-border/70 pt-4">
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!ready || !checkIsCurrent || !check.data}
              onClick={() => {
                onConfirm(extras);
              }}
            >
              Convert
            </Button>
          </div>
        </CardFooter>
      </Card>
    </DialogContent>
  );
}

function extrasFor(candidate: DatetimeFormatCandidate): CastExtras {
  if (candidate.kind === 'excel') return { excel_serial: true };
  if (candidate.kind === 'unix') return { epoch_unit: candidate.epoch_unit ?? 's' };
  return { datetime_format: candidate.format ?? undefined };
}

function isComplete(mode: ConversionMode, extras: CastExtras): boolean {
  if (mode === 'number') return true;
  if (extras.excel_serial || extras.epoch_unit) return true;
  const format = extras.datetime_format ?? '';
  if (!format) return false;
  // Two-digit years wait for the century (issue 322).
  return mode !== 'date' || !format.includes('%y') || extras.two_digit_year_start != null;
}

function candidateLabel(candidate: DatetimeFormatCandidate): string {
  if (candidate.kind === 'excel') return 'Excel day number';
  if (candidate.kind === 'unix') {
    const unit = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' };
    return `Unix time (${unit[candidate.epoch_unit ?? 's']})`;
  }
  return describeFormat(candidate.format ?? '');
}

const UNITS = [
  { value: 's', label: 'seconds' },
  { value: 'ms', label: 'milliseconds' },
  { value: 'us', label: 'microseconds' },
  { value: 'ns', label: 'nanoseconds' },
] as const;

function DateSection({
  detected,
  extras,
  onChange,
}: {
  detected: DatetimeFormatsResource;
  extras: CastExtras;
  onChange: (extras: CastExtras) => void;
}) {
  const { candidates } = detected;
  const format = extras.datetime_format ?? '';
  const selected = candidates.find(
    (candidate) =>
      (candidate.kind === 'format' && candidate.format === format && !extras.epoch_unit) ||
      (candidate.kind === 'unix' && extras.epoch_unit != null) ||
      (candidate.kind === 'excel' && extras.excel_serial),
  );
  const usesNumbers = Boolean(extras.epoch_unit) || Boolean(extras.excel_serial);
  const sample = detected.sample_value ?? '';
  const segments =
    (format ? segmentsFromFormat(format, sample) : null) ??
    segmentsFromValue(detected.sample_parts);
  const twoDigits = !usesNumbers && format.includes('%y');

  return (
    <div className="space-y-4">
      {candidates.length === 0 ? (
        <p className="text-body text-description">
          No common date format reads these values. Name the parts below, or type the format.
        </p>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-body font-medium text-foreground">Formats that fit</legend>
          {candidates.map((candidate) => {
            const isSelected = candidate === selected;
            return (
              <label
                key={`${candidate.kind}-${candidate.format ?? candidate.epoch_unit ?? ''}`}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-body ${isSelected ? 'border-focus bg-panel' : 'border-surface-border'}`}
              >
                <input
                  type="radio"
                  name="conversion-format"
                  className="mt-1"
                  checked={isSelected}
                  onChange={() => {
                    onChange(extrasFor(candidate));
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{candidateLabel(candidate)}</span>
                  <span className="text-description">
                    {' '}
                    · reads {candidate.parsed.toLocaleString()} of{' '}
                    {candidate.sample_size.toLocaleString()} values
                  </span>
                  {candidate.examples[0] ? (
                    <span className="block text-label-secondary text-description">
                      {candidate.examples[0].value} →{' '}
                      {/* A two-digit year has no century until one is chosen (issue 322). */}
                      {candidate.two_digit_year
                        ? 'choose the century below'
                        : readable(candidate.examples[0].result, 'datetime')}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {selected?.swap_format && !usesNumbers ? (
        <p
          role="note"
          className="rounded-md border border-surface-border bg-panel px-2.5 py-2 text-body"
        >
          These dates could be day first or month first: every value reads both ways (for example
          03/01 is 3 January or 1 March). Wordflow reads them day first.{' '}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-1"
            onClick={() => {
              onChange({ ...extras, datetime_format: selected.swap_format ?? format });
            }}
          >
            Read month first
          </Button>
        </p>
      ) : null}

      {extras.epoch_unit ? (
        <label className="flex items-center gap-2 text-body">
          Unix time in
          <select
            className="rounded-sm border border-input-border bg-editor px-1.5 py-0.5"
            value={extras.epoch_unit}
            onChange={(event) => {
              onChange({ epoch_unit: event.target.value as CastExtras['epoch_unit'] });
            }}
          >
            {UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!usesNumbers && sample ? (
        <div>
          <p className="mb-1 text-body font-medium text-foreground">
            What each part of &ldquo;{sample}&rdquo; is
          </p>
          <div className="flex flex-wrap items-end gap-1">
            {segments.map((segment, index) =>
              segment.kind === 'literal' ? (
                <span key={index} className="pb-1 font-mono text-description">
                  {segment.text === ' ' ? '␣' : segment.text}
                </span>
              ) : (
                <label key={index} className="flex flex-col items-center gap-0.5">
                  <span className="font-mono text-body">{segment.text}</span>
                  <select
                    aria-label={`What "${segment.text}" is`}
                    className="rounded-sm border border-input-border bg-editor px-1 py-0.5 text-label-secondary"
                    value={segment.spec}
                    onChange={(event) => {
                      const next: FormatSegment[] = segments.map((item, at) =>
                        at === index ? { ...item, spec: event.target.value } : item,
                      );
                      const built = formatFromSegments(next);
                      if (built) onChange({ ...extras, datetime_format: built });
                    }}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {rolesFor(segment.text).map((role) => (
                      <option key={role.spec} value={role.spec}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </div>
        </div>
      ) : null}

      {twoDigits ? (
        <CenturyChoice
          start={extras.two_digit_year_start ?? null}
          onChange={(start) => {
            onChange({ ...extras, two_digit_year_start: start });
          }}
        />
      ) : null}

      {!usesNumbers ? (
        <label className="block text-label-secondary text-description">
          Format code (for advanced use)
          <input
            type="text"
            value={format}
            onChange={(event) => {
              onChange({ datetime_format: event.target.value });
            }}
            className="mt-0.5 w-full rounded-sm border border-input-border bg-editor px-2 py-1 font-mono text-body text-foreground"
          />
        </label>
      ) : null}
    </div>
  );
}

/** Two-digit years are never assumed: the user picks their century (issue 322). */
function CenturyChoice({
  start,
  onChange,
}: {
  start: number | null;
  onChange: (start: number | undefined) => void;
}) {
  const [split, setSplit] = useState('50');
  const mode = start === 1900 ? '1900' : start === 2000 ? '2000' : start == null ? '' : 'split';
  const splitStart = (value: string) => {
    const year = Number(value);
    return Number.isInteger(year) && year >= 1 && year <= 99 ? 1900 + year : undefined;
  };
  return (
    <fieldset className="space-y-1 rounded-md border border-surface-border px-2.5 py-2">
      <legend className="px-1 text-body font-medium text-foreground">
        The years have two digits. Which century are they in?
      </legend>
      {[
        { value: '1900', label: '1900s (20 means 1920)' },
        { value: '2000', label: '2000s (20 means 2020)' },
      ].map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-body">
          <input
            type="radio"
            name="conversion-century"
            checked={mode === option.value}
            onChange={() => {
              onChange(Number(option.value));
            }}
          />
          {option.label}
        </label>
      ))}
      <label className="flex flex-wrap items-center gap-2 text-body">
        <input
          type="radio"
          name="conversion-century"
          checked={mode === 'split'}
          onChange={() => {
            onChange(splitStart(split));
          }}
        />
        Split at
        <input
          type="number"
          min={1}
          max={99}
          aria-label="Split year"
          value={split}
          onChange={(event) => {
            setSplit(event.target.value);
            if (mode === 'split') onChange(splitStart(event.target.value));
          }}
          className="w-16 rounded-sm border border-input-border bg-editor px-1.5 py-0.5"
        />
        <span className="text-description">
          (00 to {String(Math.max(0, Number(split) - 1)).padStart(2, '0')} are 2000s,{' '}
          {String(Number(split)).padStart(2, '0')} to 99 are 1900s)
        </span>
      </label>
    </fieldset>
  );
}

function NumberSection({
  extras,
  onChange,
}: {
  extras: CastExtras;
  onChange: (extras: CastExtras) => void;
}) {
  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap items-center gap-3 text-body">
        <legend className="mb-1 w-full font-medium text-foreground">Decimal mark</legend>
        {[
          { value: '.', label: 'Point (1,234.5)' },
          { value: ',', label: 'Comma (1.234,5)' },
        ].map((option) => (
          <label key={option.value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="conversion-decimal"
              checked={extras.decimal_mark === option.value}
              onChange={() => {
                onChange({
                  ...extras,
                  decimal_mark: option.value as '.' | ',',
                  thousands_separator:
                    extras.thousands_separator === option.value ? '' : extras.thousands_separator,
                });
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-body">
        Thousands separator
        <select
          className="rounded-sm border border-input-border bg-editor px-1.5 py-0.5"
          value={extras.thousands_separator ?? ''}
          onChange={(event) => {
            onChange({
              ...extras,
              thousands_separator: event.target.value as CastExtras['thousands_separator'],
            });
          }}
        >
          <option value="">None</option>
          {[',', '.', ' ', "'"]
            .filter((separator) => separator !== extras.decimal_mark)
            .map((separator) => (
              <option key={separator} value={separator}>
                {separator === ','
                  ? 'Comma'
                  : separator === '.'
                    ? 'Point'
                    : separator === ' '
                      ? 'Space'
                      : 'Apostrophe'}
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={extras.ignore_symbols ?? false}
          onChange={(event) => {
            onChange({ ...extras, ignore_symbols: event.target.checked });
          }}
        />
        Ignore currency signs, % and other symbols ($12 reads 12, 45% reads 45)
      </label>
      <p className="text-label-secondary text-description">
        Whole numbers round to the nearest: 2.5 becomes 3, 2.4 becomes 2.
      </p>
    </div>
  );
}

function DateTextSection({
  extras,
  sourceHasTime,
  onChange,
}: {
  extras: CastExtras;
  sourceHasTime: boolean;
  onChange: (extras: CastExtras) => void;
}) {
  const format = extras.datetime_format ?? '';
  const presets = DATE_TEXT_PRESETS.filter((preset) => sourceHasTime || !preset.withTime);
  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="mb-1 text-body font-medium text-foreground">Written like</legend>
        {presets.map((preset) => (
          <Button
            key={preset.format}
            type="button"
            size="sm"
            variant={format === preset.format ? 'default' : 'outline'}
            onClick={() => {
              onChange({ datetime_format: preset.format });
            }}
          >
            {preset.label}
          </Button>
        ))}
      </fieldset>
      <div>
        <p className="mb-1 text-body font-medium text-foreground">Or build your own</p>
        <div className="flex flex-wrap gap-1">
          {DATE_TEXT_PARTS.filter(
            (part) => sourceHasTime || !['%H', '%I', '%M', '%S', '%p'].includes(part.spec),
          ).map((part) => (
            <Button
              key={part.spec}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onChange({ datetime_format: `${format}${part.spec}` });
              }}
            >
              + {part.label}
            </Button>
          ))}
        </div>
        <label className="mt-2 block text-label-secondary text-description">
          Format (type separators such as / or spaces between the parts)
          <input
            type="text"
            value={format}
            onChange={(event) => {
              onChange({ datetime_format: event.target.value });
            }}
            className="mt-0.5 w-full rounded-sm border border-input-border bg-editor px-2 py-1 font-mono text-body text-foreground"
          />
        </label>
        {format ? (
          <p className="mt-0.5 text-label-secondary text-description">{describeFormat(format)}</p>
        ) : null}
      </div>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2020-01-30 14:05:00" as "30 Jan 2020 14:05", the way charts write dates. */
function readable(result: string | null | undefined, target: string): string {
  if (result == null) return '';
  if (target !== 'datetime' && target !== 'date') return result;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(result);
  if (!match) return result;
  const [, year = '', month = '', day = '', hour, minute = '00', second = '00'] = match;
  const date = `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
  if (!hour || (hour === '00' && minute === '00' && second === '00')) return date;
  return `${date} ${hour}:${minute}${second !== '00' ? `:${second}` : ''}`;
}

function CheckSection({
  ready,
  pending,
  result,
  error,
  target,
}: {
  ready: boolean;
  pending: boolean;
  result: ConversionCheckResource | undefined;
  error: unknown;
  target: string;
}) {
  if (!ready) {
    return (
      <p className="text-body text-description">Complete the choices above to see the result.</p>
    );
  }
  if (error) return <ErrorNotice error={error} fallback="Couldn't check the conversion." />;
  if (!result) return <p className="text-body text-description">Checking the whole column…</p>;
  return (
    <section
      aria-label="Check"
      aria-busy={pending}
      className={`space-y-2 rounded-md border border-surface-border p-2.5 ${pending ? 'opacity-60' : ''}`}
    >
      <p role="status" className="text-body font-medium">
        {result.converted.toLocaleString()} of {result.non_empty.toLocaleString()} values convert
        {result.failed > 0 ? `; ${result.failed.toLocaleString()} would become empty` : ''}.
        {result.total_rows > result.non_empty
          ? ` ${(result.total_rows - result.non_empty).toLocaleString()} empty values stay empty.`
          : ''}
      </p>
      <table className="w-full text-body">
        <thead>
          <tr className="text-left text-label-secondary text-description">
            <th className="font-normal">Row</th>
            <th className="font-normal">Value</th>
            <th className="font-normal">Becomes</th>
          </tr>
        </thead>
        <tbody>
          {result.samples.map((sample) => (
            <tr key={sample.row}>
              <td className="pr-2 tabular-nums text-description">{sample.row}</td>
              <td className="pr-2 [overflow-wrap:anywhere]">{sample.value}</td>
              <td className={sample.result == null ? 'italic text-error' : ''}>
                {sample.result == null ? "doesn't convert" : readable(sample.result, target)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.failures.length > 0 ? (
        <p className="text-label-secondary text-description">
          First values that don&apos;t convert:{' '}
          {result.failures
            .map((failure) => `row ${String(failure.row)}: "${failure.value ?? ''}"`)
            .join(', ')}
          . Convert anyway, or fix them first (they would become empty; Undo restores them).
        </p>
      ) : null}
    </section>
  );
}
