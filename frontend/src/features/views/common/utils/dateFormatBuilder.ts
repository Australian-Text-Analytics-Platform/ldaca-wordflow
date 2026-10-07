/**
 * The date format builder (issue 322): one value from the column is shown as
 * its parts, each with a menu saying what it is (Day, Month, Year, ...). The
 * format string (`%d/%m/%Y`) is built from those choices, so nobody has to
 * type format codes. Used by: ConversionPanel.
 */

export interface FormatSegment {
  /** A part of the value with a meaning, or text that is kept as written. */
  kind: 'field' | 'literal';
  /** The part of the sample value. */
  text: string;
  /** The format code for a field (`%d`); empty until chosen. */
  spec: string;
}

export interface PartRole {
  spec: string;
  label: string;
}

const DIGIT_ROLES: PartRole[] = [
  { spec: '%d', label: 'Day' },
  { spec: '%m', label: 'Month' },
  { spec: '%Y', label: 'Year' },
  { spec: '%y', label: 'Year (two digits)' },
  { spec: '%H', label: 'Hour' },
  { spec: '%I', label: 'Hour (12-hour clock)' },
  { spec: '%M', label: 'Minute' },
  { spec: '%S', label: 'Second' },
];
const LETTER_ROLES: PartRole[] = [
  { spec: '%B', label: 'Month name' },
  { spec: '%b', label: 'Month name, short' },
  { spec: '%A', label: 'Weekday' },
  { spec: '%a', label: 'Weekday, short' },
  { spec: '%p', label: 'AM/PM' },
];
const ZONE_ROLES: PartRole[] = [{ spec: '%z', label: 'Time zone' }];
const FRACTION_ROLES: PartRole[] = [{ spec: '%.f', label: 'Fraction of a second' }];

/** The menu for one part, by what the part looks like. */
export function rolesFor(text: string): PartRole[] {
  if (/^\.\d+$/.test(text)) return FRACTION_ROLES;
  if (/^[+-]\d{2}:?\d{2}$|^Z$/.test(text)) return ZONE_ROLES;
  if (/^\d+$/.test(text)) return DIGIT_ROLES;
  return LETTER_ROLES;
}

/** A readable name for a format code. */
function roleLabel(spec: string): string {
  if (spec === '%:z') return 'Time zone';
  return (
    [...DIGIT_ROLES, ...LETTER_ROLES, ...ZONE_ROLES, ...FRACTION_ROLES].find(
      (role) => role.spec === spec,
    )?.label ?? spec
  );
}

const SPEC_PATTERN = /%(?:\.f|:z|[a-zA-Z%])/g;

/** Splits a format into its codes and the text between them. */
function formatTokens(format: string): { spec: boolean; text: string }[] {
  const tokens: { spec: boolean; text: string }[] = [];
  let last = 0;
  for (const match of format.matchAll(SPEC_PATTERN)) {
    if (match.index > last) tokens.push({ spec: false, text: format.slice(last, match.index) });
    if (match[0] === '%%') tokens.push({ spec: false, text: '%' });
    else tokens.push({ spec: true, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < format.length) tokens.push({ spec: false, text: format.slice(last) });
  return tokens;
}

/** What each code reads from the value, as a regular expression. */
function specPattern(spec: string): RegExp {
  if (spec === '%.f') return /^\.\d+/;
  if (spec === '%z' || spec === '%:z') return /^(?:[+-]\d{2}:?\d{2}|Z)/;
  if (['%b', '%B', '%a', '%A', '%p', '%Z'].includes(spec)) return /^[A-Za-z]+/;
  return /^\d+/;
}

/**
 * Lines a format up against a value from the column. Returns null when the
 * format does not read the value, so the builder starts from the bare parts.
 */
export function segmentsFromFormat(format: string, value: string): FormatSegment[] | null {
  const segments: FormatSegment[] = [];
  let rest = value;
  for (const token of formatTokens(format)) {
    if (!token.spec) {
      if (!rest.startsWith(token.text)) return null;
      segments.push({ kind: 'literal', text: token.text, spec: '' });
      rest = rest.slice(token.text.length);
      continue;
    }
    const match = specPattern(token.text).exec(rest);
    if (!match) return null;
    segments.push({ kind: 'field', text: match[0], spec: token.text });
    rest = rest.slice(match[0].length);
  }
  return rest === '' ? segments : null;
}

/** The bare parts of a value: digit and letter runs become fields to name. */
export function segmentsFromValue(parts: string[]): FormatSegment[] {
  return parts.map((text) =>
    // A lone "T" separates an ISO date from its time; anything else made of
    // digits or letters is a part to name.
    text !== 'T' && /^[A-Za-z0-9]+$|^[+-]\d{2}:?\d{2}$/.test(text)
      ? { kind: 'field', text, spec: '' }
      : { kind: 'literal', text, spec: '' },
  );
}

/** The format string the segments describe, or null while a part is unnamed. */
export function formatFromSegments(segments: FormatSegment[]): string | null {
  if (segments.some((segment) => segment.kind === 'field' && !segment.spec)) return null;
  return segments
    .map((segment) =>
      segment.kind === 'field' ? segment.spec : segment.text.replaceAll('%', '%%'),
    )
    .join('');
}

const SHORT_NAMES: Record<string, string> = {
  '%y': 'Year (2 digits)',
  '%I': 'Hour',
  '%B': 'Month name',
  '%b': 'Month name',
  '%A': 'Weekday',
  '%a': 'Weekday',
  '%.f': 'Fraction',
};

/** A readable description of a format, such as "Day/Month/Year Hour:Minute". */
export function describeFormat(format: string): string {
  return formatTokens(format)
    .map((token) => (token.spec ? (SHORT_NAMES[token.text] ?? roleLabel(token.text)) : token.text))
    .join('');
}

/** Readable output formats for turning dates into text. */
export const DATE_TEXT_PRESETS: { format: string; label: string; withTime?: boolean }[] = [
  { format: '%Y-%m-%d', label: '2020-01-30' },
  { format: '%d/%m/%Y', label: '30/01/2020' },
  { format: '%d %b %Y', label: '30 Jan 2020' },
  { format: '%d %B %Y', label: '30 January 2020' },
  { format: '%A %d %B %Y', label: 'Thursday 30 January 2020' },
  { format: '%B %Y', label: 'January 2020' },
  { format: '%Y', label: '2020' },
  { format: '%Y-%m-%d %H:%M', label: '2020-01-30 14:05', withTime: true },
  { format: '%d/%m/%Y %I:%M %p', label: '30/01/2020 02:05 PM', withTime: true },
];

/** Parts that can be added to an output format. */
export const DATE_TEXT_PARTS: PartRole[] = [
  ...DIGIT_ROLES,
  ...LETTER_ROLES.filter((role) => role.spec !== '%p'),
  { spec: '%p', label: 'AM/PM' },
];
