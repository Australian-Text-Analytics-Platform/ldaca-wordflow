/**
 * Chart date labels (issue 213): one readable, fixed format for every user,
 * independent of the browser's locale. Tables and exports keep year-first ISO
 * dates (`displayDateTime`); charts use day, short month name and year, so a
 * date is never ambiguous ("18 Oct 2020", "Oct 2020", "2020 Q4").
 */

export type ChartDateUnit = 'second' | 'minute' | 'day' | 'month' | 'quarter' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Formats a wall-clock time held in UTC fields (for example from
 * `parsePeriodLabel`, or a UTC instant shifted by the data's zone offset).
 */
export function formatChartDate(wallClockMs: number, unit: ChartDateUnit): string {
  const date = new Date(wallClockMs);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const monthYear = `${MONTHS[month] ?? ''} ${String(year)}`;
  const dayMonthYear = `${String(date.getUTCDate())} ${monthYear}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  switch (unit) {
    case 'year':
      return String(year);
    case 'quarter':
      return `${String(year)} Q${String(Math.floor(month / 3) + 1)}`;
    case 'month':
      return monthYear;
    case 'day':
      return dayMonthYear;
    case 'minute':
      return `${dayMonthYear} ${time}`;
    case 'second':
      return `${dayMonthYear} ${time}:${pad(date.getUTCSeconds())}`;
  }
}

/** Monday of week `week` in `year`, counted as strftime %W does (weeks start on Monday). */
const mondayOfWeek = (year: number, week: number): number => {
  const jan1 = Date.UTC(year, 0, 1);
  const weekday = (new Date(jan1).getUTCDay() + 6) % 7; // Monday = 0
  const firstMonday = jan1 + ((7 - weekday) % 7) * 86_400_000;
  return firstMonday + (week - 1) * 7 * 86_400_000;
};

/**
 * Reads a Trends period label written by the backend in the time column's own
 * zone ("2020-10-18", "2020-10-18 14:05:09", "2020-W42", "2020-Q4", "2020-10",
 * "2020") as a wall-clock time held in UTC fields. Returns null for anything else.
 */
export function parsePeriodLabel(label: string): number | null {
  const text = label.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh ?? 0),
      Number(mm ?? 0),
      Number(ss ?? 0),
    );
  }
  match = /^(\d{4})-W(\d{1,2})$/.exec(text);
  if (match) return mondayOfWeek(Number(match[1]), Number(match[2]));
  match = /^(\d{4})-Q([1-4])$/.exec(text);
  if (match) return Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1);
  match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
  match = /^(\d{4})$/.exec(text);
  if (match) return Date.UTC(Number(match[1]), 0, 1);
  return null;
}
