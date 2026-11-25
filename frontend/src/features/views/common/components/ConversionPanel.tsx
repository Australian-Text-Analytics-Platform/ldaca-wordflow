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
import { toastError } from '@/lib/toastError';
import { AdvancedSection } from '../toolMode/AdvancedSection';
import { AdvancedSwitch } from '../toolMode/AdvancedSwitch';
import { ToolModeContext, useToolModeContext, type ToolMode } from '../toolMode/ToolModeContext';
import { readToolModeDeviceDefault, writeToolModeDeviceDefault } from '../toolMode/toolMode';
import {
  DATE_TEXT_PARTS,
  DATE_TEXT_PRESETS,
  buildFormat,
  describeFormat,
  formatReach,
  IGNORE_PART,
  ignoreUnnamed,
  rolesFor,
  sameFormat,
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
    | 'date_in_text'
    | 'elapsed_unit'
    | 'two_part_times'
    | 'elapsed_text'
    | 'output_column'
  >
>;

/**
 * date: text, category or numbers to a date; number: text to a number;
 * date-text: a date to text. Elapsed time (issue 324): elapsed (text to it),
 * elapsed-number (numbers to it), elapsed-text (it to text), elapsed-out (it
 * to a number).
 */
export type ConversionMode =
  | 'date'
  | 'number'
  | 'date-text'
  | 'elapsed'
  | 'elapsed-number'
  | 'elapsed-text'
  | 'elapsed-out';

interface ConversionPanelProps {
  open: boolean;
  workspaceId: string | undefined;
  nodeId: string | undefined;
  columnName: string;
  mode: ConversionMode;
  /** The type being converted to. */
  target: 'datetime' | 'date' | 'integer' | 'float' | 'string' | 'duration';
  /** The plain name of that type, for the title. */
  targetLabel: string;
  /** The source holds a date and time, so time presets apply (date to text). */
  sourceHasTime?: boolean;
  /** The Data Block's columns, so a new column gets a name that is free. */
  existingColumns?: string[];
  /**
   * Puts the rows that hold these values of the column in a new Data Block,
   * and resolves with its name. Without it the window offers no such button.
   */
  onAddRowsAsDataBlock?: (values: string[]) => Promise<string>;
  onClose: () => void;
  onConfirm: (extras: CastExtras) => void;
}

/**
 * The type conversion window (issue 322): says how the values are written,
 * shows what they become, and checks the whole column before converting.
 * Opened from a column's type menu for: text, category or numbers to a date or
 * date and time; text or category to a number; a date to text.
 *
 * Reading text as a date has an Advanced switch (Chao, 25 Nov 2026): off, the
 * window lists the formats that fit and the check; on, it adds the menus that
 * name each part of a value, the format code and the search inside longer
 * text. The choice is kept on this device, as for the analysis tools.
 *
 * When values don't convert (Chao, 25 Nov 2026), the check lists every such
 * value once with its rows, can put those rows in a Data Block to look at,
 * and offers to keep the column as it is and convert into a new column.
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
  existingColumns = [],
  onAddRowsAsDataBlock,
  onClose,
  onConfirm,
}: Omit<ConversionPanelProps, 'open'>) {
  const [extras, setExtras] = useState<CastExtras>(() => initialExtras(mode, sourceHasTime));
  // Converting into a new column is offered only while values don't convert,
  // and is not part of what the check tries.
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [newColumn, setNewColumn] = useState(() =>
    freeColumnName(`${columnName}_${NEW_COLUMN_SUFFIX[target]}`, existingColumns),
  );
  const [advanced, setAdvanced] = useState(() => readToolModeDeviceDefault(DATE_CONVERSION_MODE));
  // No `viewId`: the window is too narrow for the Advanced hint beside the switch.
  const toolMode: ToolMode = {
    advanced,
    setAdvanced: (next) => {
      setAdvanced(next);
      writeToolModeDeviceDefault(DATE_CONVERSION_MODE, next);
    },
  };
  // Unix times and Excel day numbers have no parts to name and no format code.
  const hasAdvanced = mode === 'date' && !extras.epoch_unit && !extras.excel_serial;
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
  const intoNewColumn = keepOriginal && (check.data?.failed ?? 0) > 0;
  const newColumnProblem = !intoNewColumn
    ? null
    : !newColumn.trim()
      ? 'Give the new column a name.'
      : existingColumns.includes(newColumn.trim())
        ? `A column named "${newColumn.trim()}" already exists.`
        : null;

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
          {/* The right padding keeps the switch clear of the window's close button. */}
          <div className="flex items-start gap-3 pr-7">
            <CardTitle className="min-w-0 flex-1 leading-snug">
              Convert <span className="text-description">&ldquo;{columnName}&rdquo;</span> to{' '}
              {targetLabel}
            </CardTitle>
            {hasAdvanced ? (
              <div className="shrink-0">
                <ToolModeContext value={toolMode}>
                  <AdvancedSwitch />
                </ToolModeContext>
              </div>
            ) : null}
          </div>
          <CardDescription>{MODE_DESCRIPTIONS[mode]}</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[65vh] space-y-4 overflow-y-auto">
          {mode === 'date' ? (
            detection.isError ? (
              <ErrorNotice error={detection.error} fallback="Couldn't read the column's values." />
            ) : detected ? (
              <ToolModeContext value={toolMode}>
                <DateSection
                  detected={detected}
                  extras={extras}
                  target={target}
                  onChange={setExtras}
                />
              </ToolModeContext>
            ) : (
              <p className="text-body text-description">Reading the values…</p>
            )
          ) : mode === 'number' ? (
            <NumberSection extras={extras} onChange={setExtras} />
          ) : mode === 'date-text' ? (
            <DateTextSection extras={extras} sourceHasTime={sourceHasTime} onChange={setExtras} />
          ) : (
            <ElapsedSection mode={mode} extras={extras} onChange={setExtras} />
          )}
          <CheckSection
            ready={ready}
            pending={!checkIsCurrent || check.isFetching}
            result={check.data}
            checkedAt={check.dataUpdatedAt}
            error={check.isError ? check.error : null}
            target={target}
            columnName={columnName}
            keepOriginal={keepOriginal}
            onKeepOriginalChange={setKeepOriginal}
            newColumn={newColumn}
            onNewColumnChange={setNewColumn}
            newColumnProblem={newColumnProblem}
            onAddRowsAsDataBlock={onAddRowsAsDataBlock}
          />
        </CardContent>
        <CardFooter className="border-t border-surface-border/70 pt-4">
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!ready || !checkIsCurrent || !check.data || newColumnProblem !== null}
              onClick={() => {
                onConfirm(intoNewColumn ? { ...extras, output_column: newColumn.trim() } : extras);
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

/** What a new column of converted values is called after its source: `created_at_date`. */
const NEW_COLUMN_SUFFIX: Record<ConversionPanelProps['target'], string> = {
  date: 'date',
  datetime: 'datetime',
  integer: 'number',
  float: 'number',
  string: 'text',
  duration: 'elapsed',
};

/** The name, or the name with the first number that makes it free: `x_date_2`. */
function freeColumnName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  let number = 2;
  while (taken.includes(`${name}_${String(number)}`)) number += 1;
  return `${name}_${String(number)}`;
}

/** Names the date conversion window where the Advanced choice is kept on this device. */
const DATE_CONVERSION_MODE = 'conversion-date';

function extrasFor(candidate: DatetimeFormatCandidate): CastExtras {
  if (candidate.kind === 'excel') return { excel_serial: true };
  if (candidate.kind === 'unix') return { epoch_unit: candidate.epoch_unit ?? 's' };
  return {
    datetime_format: candidate.format ?? undefined,
    ...(candidate.in_text ? { date_in_text: true } : {}),
  };
}

const MODE_DESCRIPTIONS: Record<ConversionMode, string> = {
  date: 'How are the dates written? Wordflow has looked at the first values; check the result below before converting.',
  number: 'How are the numbers written? Check the result below before converting.',
  'date-text': 'How should the dates be written as text?',
  elapsed:
    'Elapsed time is time into a recording, such as 7:58.5 for 7 minutes 58.5 seconds. Check the result below before converting.',
  'elapsed-number': 'What do the numbers count? Check the result below before converting.',
  'elapsed-text': 'How should the elapsed times be written as text?',
  'elapsed-out': 'Which unit should the numbers count?',
};

function initialExtras(mode: ConversionMode, sourceHasTime: boolean): CastExtras {
  switch (mode) {
    case 'number':
      return { decimal_mark: '.', thousands_separator: ',', ignore_symbols: true };
    case 'date-text':
      return { datetime_format: sourceHasTime ? '%Y-%m-%d %H:%M' : '%Y-%m-%d' };
    case 'elapsed':
      return { two_part_times: 'minutes' };
    case 'elapsed-number':
    case 'elapsed-out':
      return { elapsed_unit: 's' };
    case 'elapsed-text':
      return { elapsed_text: 'auto' };
    default:
      return {};
  }
}

function isComplete(mode: ConversionMode, extras: CastExtras): boolean {
  if (mode === 'number' || mode.startsWith('elapsed')) return true;
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
  const described = describeFormat(candidate.format ?? '');
  return candidate.in_text ? `${described}, inside longer text` : described;
}

const UNITS = [
  { value: 's', label: 'seconds' },
  { value: 'ms', label: 'milliseconds' },
  { value: 'us', label: 'microseconds' },
  { value: 'ns', label: 'nanoseconds' },
] as const;

/** The draft's key: the parts start again when the format comes from elsewhere. */
const partsKey = (extras: CastExtras) =>
  `${extras.datetime_format ?? ''}|${String(Boolean(extras.date_in_text))}`;

function DateSection({
  detected,
  extras,
  target,
  onChange,
}: {
  detected: DatetimeFormatsResource;
  extras: CastExtras;
  target: string;
  onChange: (extras: CastExtras) => void;
}) {
  const advanced = useToolModeContext()?.advanced ?? false;
  const { candidates } = detected;
  const format = extras.datetime_format ?? '';
  const selected = candidates.find(
    (candidate) =>
      (candidate.kind === 'format' &&
        sameFormat(candidate.format ?? '', format) &&
        Boolean(candidate.in_text) === Boolean(extras.date_in_text) &&
        !extras.epoch_unit) ||
      (candidate.kind === 'unix' && extras.epoch_unit != null) ||
      (candidate.kind === 'excel' && extras.excel_serial),
  );
  const usesNumbers = Boolean(extras.epoch_unit) || Boolean(extras.excel_serial);
  const sample = detected.sample_value ?? '';
  const inText = Boolean(extras.date_in_text);
  // The parts as named so far. Choices are kept here until every part is
  // named, then become the format; a new format from elsewhere (a candidate,
  // the swap, the code field) starts the parts again.
  const formatKey = partsKey(extras);
  const seedParts = () =>
    (format ? segmentsFromFormat(format, sample, inText) : null) ??
    segmentsFromValue(detected.sample_parts);
  const [draft, setDraft] = useState(() => ({ key: formatKey, segments: seedParts() }));
  let segments = draft.segments;
  if (draft.key !== formatKey) {
    segments = seedParts();
    setDraft({ key: formatKey, segments });
  }
  const built = buildFormat(segments);
  // An ignored part means the date is searched for inside each value. With
  // no part ignored, the search is on only when ticked by hand.
  const tickedByHand = inText && !built.inText;
  const nameParts = (next: FormatSegment[]) => {
    const result = buildFormat(next);
    const { date_in_text: _inText, ...rest } = extras;
    const nextExtras: CastExtras = {
      ...rest,
      datetime_format: result.format ?? undefined,
      ...(result.inText || tickedByHand ? { date_in_text: true } : {}),
    };
    setDraft({ key: partsKey(nextExtras), segments: next });
    onChange(nextExtras);
  };
  const twoDigits = !usesNumbers && format.includes('%y');
  const unnamedParts = segments.some((segment) => segment.kind === 'field' && !segment.spec);
  const namedParts = segments.some(
    (segment) => segment.kind === 'field' && segment.spec !== '' && segment.spec !== IGNORE_PART,
  );
  // A format made by hand is in use, so the list has no fitting format to tick.
  const ownFormat = candidates.length > 0 && !selected && !usesNumbers && format !== '';
  // With no format that fits, naming the parts is the way to read the dates,
  // so the menus show without Advanced.
  const partsAreTheWay = candidates.length === 0;

  const partsBuilder =
    !usesNumbers && sample ? (
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-body font-medium text-foreground">
            What each part of &ldquo;{sample}&rdquo; is
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!unnamedParts || !namedParts}
            title={
              !unnamedParts
                ? 'Every part already has a name'
                : !namedParts
                  ? 'Name the parts of the date first'
                  : 'Mark every part without a name as not part of the date'
            }
            onClick={() => {
              nameParts(ignoreUnnamed(segments));
            }}
          >
            Ignore the rest
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-1">
          {segments.map((segment, index) =>
            segment.kind === 'literal' ? (
              <span key={index} className="pb-1 font-mono text-description">
                {segment.text === ' ' ? '␣' : segment.text}
              </span>
            ) : (
              <label key={index} className="flex flex-col items-center gap-0.5">
                <span
                  className={`font-mono text-body ${segment.spec === IGNORE_PART ? 'text-description line-through' : ''}`}
                >
                  {segment.text}
                </span>
                <select
                  aria-label={`What "${segment.text}" is`}
                  className="rounded-sm border border-input-border bg-editor px-1 py-0.5 text-label-secondary"
                  value={segment.spec}
                  onChange={(event) => {
                    nameParts(
                      segments.map((item, at) =>
                        at === index ? { ...item, spec: event.target.value } : item,
                      ),
                    );
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
        {built.ignoredInside ? (
          <p role="alert" className="mt-1 text-label-secondary text-error">
            Only text before or after the date can be ignored, not a part in the middle of it.
          </p>
        ) : built.inText && built.format ? (
          <p className="mt-1 text-label-secondary text-description">
            Wordflow finds the date inside each value and ignores the text around it.
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {candidates.length === 0 ? (
        <p className="text-body text-description">
          No common date format reads these values. Name the parts below
          {advanced
            ? ', or type the format code.'
            : ', or turn on Advanced to type the format code.'}
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
                        : readable(candidate.examples[0].result, target)}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          {ownFormat ? (
            <label className="flex items-start gap-2 rounded-md border border-focus bg-panel px-2.5 py-1.5 text-body">
              <input type="radio" name="conversion-format" className="mt-1" checked readOnly />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Your own format: {describeFormat(format)}</span>
                {inText ? (
                  <span className="text-description"> · found inside longer text</span>
                ) : null}
              </span>
            </label>
          ) : null}
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

      {partsAreTheWay ? partsBuilder : null}

      {!usesNumbers ? (
        <AdvancedSection>
          {partsAreTheWay ? null : partsBuilder}
          <div>
            <label className="block text-label-secondary text-description">
              Format code
              <input
                type="text"
                value={format}
                onChange={(event) => {
                  const typed = event.target.value;
                  // A code that reads only a date inside the sample value is
                  // searched for inside each value; one that reads all of it
                  // keeps a tick made by hand.
                  const reach = formatReach(typed, sample);
                  const searches =
                    reach === 'inside' || (reach === 'whole' ? tickedByHand : inText);
                  onChange({
                    datetime_format: typed,
                    ...(searches ? { date_in_text: true } : {}),
                  });
                }}
                className="mt-0.5 w-full rounded-sm border border-input-border bg-editor px-2 py-1 font-mono text-body text-foreground"
              />
            </label>
            <label className="mt-1.5 flex items-start gap-2 text-label-secondary text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={inText || built.inText}
                // Ignoring a part already means searching, so there is nothing to untick.
                disabled={built.inText}
                onChange={(event) => {
                  const { date_in_text: _inText, ...rest } = extras;
                  const nextExtras: CastExtras = event.target.checked
                    ? { ...rest, date_in_text: true }
                    : rest;
                  // The parts stay as named: the tick changes how each value
                  // is searched, not what its parts are.
                  setDraft({ key: partsKey(nextExtras), segments });
                  onChange(nextExtras);
                }}
              />
              <span>
                Find the date inside longer text (ignore the rest)
                <span className="block text-description">
                  {built.inText
                    ? 'On because a part above is ignored.'
                    : 'For values with other words around the date, such as “about 2020-10-17”. When off, a value must be the date and nothing else.'}
                </span>
              </span>
            </label>
          </div>
        </AdvancedSection>
      ) : null}

      {twoDigits ? (
        <CenturyChoice
          start={extras.two_digit_year_start ?? null}
          onChange={(start) => {
            onChange({ ...extras, two_digit_year_start: start });
          }}
        />
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

const ELAPSED_UNITS = [
  { value: 'ms', label: 'milliseconds' },
  { value: 's', label: 'seconds' },
  { value: 'min', label: 'minutes' },
  { value: 'h', label: 'hours' },
] as const;

const ELAPSED_TEXT_STYLES = [
  { value: 'auto', label: '7:58.542', note: 'as Wordflow shows it' },
  { value: 'h:mm:ss', label: '0:07:58' },
  { value: 'h:mm:ss.fff', label: '0:07:58.542' },
  { value: 'mm:ss', label: '07:58', note: 'minutes count past 59' },
  { value: 'mm:ss.fff', label: '07:58.542', note: 'minutes count past 59' },
] as const;

/** Converting to or from elapsed time (issue 324). */
function ElapsedSection({
  mode,
  extras,
  onChange,
}: {
  mode: ConversionMode;
  extras: CastExtras;
  onChange: (extras: CastExtras) => void;
}) {
  if (mode === 'elapsed') {
    return (
      <fieldset className="space-y-1 text-body">
        <legend className="mb-1 font-medium text-foreground">
          A time with two parts, such as 7:58, is
        </legend>
        {[
          { value: 'minutes', label: 'minutes and seconds (7:58 is 7 minutes 58 seconds)' },
          { value: 'hours', label: 'hours and minutes (7:58 is 7 hours 58 minutes)' },
        ].map((option) => (
          <label key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="conversion-two-part"
              checked={(extras.two_part_times ?? 'minutes') === option.value}
              onChange={() => {
                onChange({ ...extras, two_part_times: option.value as 'minutes' | 'hours' });
              }}
            />
            {option.label}
          </label>
        ))}
        <p className="text-label-secondary text-description">
          Three parts are hours, minutes and seconds (1:23:20). A comma before the fraction, as in
          subtitle files (00:07:58,542), works too.
        </p>
      </fieldset>
    );
  }
  if (mode === 'elapsed-text') {
    return (
      <fieldset className="space-y-1 text-body">
        <legend className="mb-1 font-medium text-foreground">Written like</legend>
        {ELAPSED_TEXT_STYLES.map((style) => (
          <label key={style.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="conversion-elapsed-text"
              checked={(extras.elapsed_text ?? 'auto') === style.value}
              onChange={() => {
                onChange({ ...extras, elapsed_text: style.value });
              }}
            />
            <span className="font-mono">{style.label}</span>
            {'note' in style ? <span className="text-description">({style.note})</span> : null}
          </label>
        ))}
      </fieldset>
    );
  }
  const units =
    mode === 'elapsed-number'
      ? [...ELAPSED_UNITS, { value: 'd', label: 'days (as Excel stores times)' } as const]
      : ELAPSED_UNITS;
  return (
    <div className="space-y-2 text-body">
      <label className="flex items-center gap-2">
        {mode === 'elapsed-number' ? 'The numbers count' : 'Count'}
        <select
          aria-label="Unit"
          className="rounded-sm border border-input-border bg-editor px-1.5 py-0.5"
          value={extras.elapsed_unit ?? 's'}
          onChange={(event) => {
            onChange({ ...extras, elapsed_unit: event.target.value as CastExtras['elapsed_unit'] });
          }}
        >
          {units.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-label-secondary text-description">
        {mode === 'elapsed-number'
          ? 'For example 478.5 seconds is 7:58.5, and 7.975 minutes is 7:58.5.'
          : 'For example 7:58.5 is 478.5 seconds or 7.975 minutes. Whole numbers round to the nearest.'}
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
  // A date has no time of day, so a fitting format's example shows what is kept.
  if (target === 'date') return date;
  if (!hour || (hour === '00' && minute === '00' && second === '00')) return date;
  return `${date} ${hour}:${minute}${second !== '00' ? `:${second}` : ''}`;
}

function CheckSection({
  ready,
  pending,
  result,
  checkedAt,
  error,
  target,
  columnName,
  keepOriginal,
  onKeepOriginalChange,
  newColumn,
  onNewColumnChange,
  newColumnProblem,
  onAddRowsAsDataBlock,
}: {
  ready: boolean;
  pending: boolean;
  result: ConversionCheckResource | undefined;
  /** When `result` arrived; a later check is a new result. */
  checkedAt: number;
  error: unknown;
  target: string;
  columnName: string;
  keepOriginal: boolean;
  onKeepOriginalChange: (keep: boolean) => void;
  newColumn: string;
  onNewColumnChange: (name: string) => void;
  newColumnProblem: string | null;
  onAddRowsAsDataBlock?: (values: string[]) => Promise<string>;
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
      {result.failed > 0 ? (
        <FailedValues
          // A new check starts the list, and its button, again.
          key={checkedAt}
          result={result}
          columnName={columnName}
          keepOriginal={keepOriginal}
          onKeepOriginalChange={onKeepOriginalChange}
          newColumn={newColumn}
          onNewColumnChange={onNewColumnChange}
          newColumnProblem={newColumnProblem}
          onAddRowsAsDataBlock={onAddRowsAsDataBlock}
        />
      ) : null}
    </section>
  );
}

/**
 * The values that don't convert (Chao, 25 Nov 2026): each one once, with the
 * rows that hold it, most frequent first, so a repeated "n/a" reads as one
 * thing to fix. Below it, the two ways on: look at those rows in a Data Block,
 * or keep the column and convert into a new one.
 */
function FailedValues({
  result,
  columnName,
  keepOriginal,
  onKeepOriginalChange,
  newColumn,
  onNewColumnChange,
  newColumnProblem,
  onAddRowsAsDataBlock,
}: {
  result: ConversionCheckResource;
  columnName: string;
  keepOriginal: boolean;
  onKeepOriginalChange: (keep: boolean) => void;
  newColumn: string;
  onNewColumnChange: (name: string) => void;
  newColumnProblem: string | null;
  onAddRowsAsDataBlock?: (values: string[]) => Promise<string>;
}) {
  const [adding, setAdding] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);
  const listed = result.failed_values;
  const allListed = listed.length === result.failed_distinct;
  // The rows are found by their exact values, so every value must be listed whole.
  const rowsCanBeAdded = allListed && !listed.some((item) => item.shortened);
  return (
    <div className="space-y-2 border-t border-surface-border pt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-body font-medium text-foreground">
          {result.failed_distinct === 1
            ? "1 value doesn't convert"
            : `${result.failed_distinct.toLocaleString()} different values don't convert`}
        </p>
        {addedName !== null ? (
          <p role="status" className="text-label-secondary text-description">
            Added as &ldquo;{addedName}&rdquo;
          </p>
        ) : onAddRowsAsDataBlock && rowsCanBeAdded ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={adding}
            title="Add a Data Block with only the rows that don't convert, to look at them. This column is not changed."
            onClick={() => {
              setAdding(true);
              onAddRowsAsDataBlock(listed.map((item) => item.value))
                .then(setAddedName)
                .catch((addError: unknown) => {
                  toastError(addError, 'Try again.', {
                    title: "Couldn't add the rows as a Data Block.",
                  });
                })
                .finally(() => {
                  setAdding(false);
                });
            }}
          >
            {adding ? 'Adding…' : 'Add these rows as a Data Block'}
          </Button>
        ) : null}
      </div>
      <div className="max-h-40 overflow-y-auto rounded-sm border border-surface-border">
        <table className="w-full text-body">
          <thead>
            <tr className="text-left text-label-secondary text-description">
              <th className="px-2 py-0.5 font-normal">Value</th>
              <th className="px-2 py-0.5 text-right font-normal">Rows</th>
              <th className="whitespace-nowrap px-2 py-0.5 text-right font-normal">First row</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((item) => (
              <tr key={`${String(item.first_row)}-${item.value}`}>
                <td className="px-2 [overflow-wrap:anywhere]">
                  {item.value}
                  {item.shortened ? '…' : ''}
                </td>
                <td className="px-2 text-right tabular-nums">{item.count.toLocaleString()}</td>
                <td className="px-2 text-right tabular-nums text-description">
                  {item.first_row.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allListed ? null : (
        <p className="text-label-secondary text-description">
          These are the {listed.length.toLocaleString()} most frequent of{' '}
          {result.failed_distinct.toLocaleString()} different values.
        </p>
      )}
      <p className="text-label-secondary text-description">
        To fix them, close this window and use Find &amp; replace or Map values on this column, then
        convert again. Or convert as it is:{' '}
        {keepOriginal
          ? 'they are empty in the new column, and this column keeps them.'
          : 'they become empty, and Undo restores them.'}
      </p>
      <label className="flex items-start gap-2 text-body">
        <input
          type="checkbox"
          className="mt-1"
          checked={keepOriginal}
          onChange={(event) => {
            onKeepOriginalChange(event.target.checked);
          }}
        />
        <span>
          Keep &ldquo;{columnName}&rdquo; as it is and put the converted values in a new column
        </span>
      </label>
      {keepOriginal ? (
        <div className="pl-6">
          <label className="flex flex-wrap items-center gap-2 text-body">
            New column
            <input
              type="text"
              value={newColumn}
              aria-invalid={newColumnProblem !== null}
              onChange={(event) => {
                onNewColumnChange(event.target.value);
              }}
              className="min-w-0 flex-1 rounded-sm border border-input-border bg-editor px-2 py-0.5 text-foreground"
            />
          </label>
          {newColumnProblem ? (
            <p role="alert" className="mt-0.5 text-label-secondary text-error">
              {newColumnProblem}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
