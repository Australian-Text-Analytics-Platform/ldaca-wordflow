/** Only splits picker-friendly ISO portions; DuckDB validates the authoritative text. */
export function temporalParts(value: string) {
  const match = /^(\d{4,}-\d{2}-\d{2})([ T])?(.*)$/.exec(value);
  const clock = match?.[3] ?? '';
  const suffix = /(Z|[+-]\d{2}(?::?\d{2})?|\s+[A-Za-z_]+(?:\/[A-Za-z_]+)+)$/.exec(clock)?.[0] ?? '';
  return {
    date: match?.[1] ?? '',
    separator: match?.[2] ?? ' ',
    time: suffix ? clock.slice(0, -suffix.length) : clock,
    suffix,
  };
}

export function calendarDate(value: string): Date | undefined {
  const { date } = temporalParts(value);
  if (!date) return undefined;
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const result = new Date(0);
  result.setFullYear(year, month - 1, day);
  result.setHours(0, 0, 0, 0);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

export function replaceCalendarDate(value: string, day: Date, timestamp: boolean): string {
  const date = `${String(day.getFullYear()).padStart(4, '0')}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  if (!timestamp) return date;
  const parts = temporalParts(value);
  return `${date}${parts.separator}${parts.time || '00:00:00'}${parts.suffix}`;
}

export function replaceClockTime(value: string, time: string): string {
  const parts = temporalParts(value);
  return parts.date ? `${parts.date}${parts.separator}${time}${parts.suffix}` : time;
}
