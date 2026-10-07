/**
 * Elapsed time (issue 324): time into a recording, such as a transcript's
 * 07:58.5. The backend stores it as a Duration in microseconds; it is shown as
 * "7:58.5" under an hour and "1:23:20.25" from an hour, the fraction only when
 * it is not zero (the backend's `elapsed_to_text` "auto" style).
 */

const MICROS_PER_SECOND = 1_000_000;

/** Writes a number of microseconds the way Wordflow shows elapsed time. */
export function formatElapsed(micros: number | bigint): string {
  const total = typeof micros === 'bigint' ? Number(micros) : micros;
  const sign = total < 0 ? '-' : '';
  const absolute = Math.abs(total);
  const millis = Math.floor(absolute / 1_000) % 1_000;
  const wholeSeconds = Math.floor(absolute / MICROS_PER_SECOND);
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const seconds = wholeSeconds % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  const fraction = millis > 0 ? `.${String(millis).padStart(3, '0').replace(/0+$/, '')}` : '';
  const clock =
    hours > 0
      ? `${String(hours)}:${two(minutes)}:${two(seconds)}`
      : `${String(minutes)}:${two(seconds)}`;
  return `${sign}${clock}${fraction}`;
}

/** Arrow's TimeUnit: SECOND, MILLISECOND, MICROSECOND, NANOSECOND. */
const UNIT_TO_MICROS = [1_000_000, 1_000, 1, 0.001];

/** Microseconds from an Arrow Duration value in the field's unit. */
export function arrowDurationMicros(value: number | bigint, unit: number): number {
  return Number(value) * (UNIT_TO_MICROS[unit] ?? 1);
}

/**
 * Reads "7:58", "07:58.5", "1:23:20" or "00:07:58,542" as microseconds, or
 * null. Two parts are minutes:seconds unless `twoPart` is "hours".
 */
export function parseElapsed(
  text: string,
  twoPart: 'minutes' | 'hours' = 'minutes',
): number | null {
  const value = text.trim().replace(/^(-?[\d:]+),(\d+)$/, '$1.$2');
  const three = /^(-?)(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(value);
  const two = /^(-?)(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(value);
  let micros: number;
  let sign: string;
  if (three) {
    const [, minus = '', hours = '0', minutes = '0', seconds = '0'] = three;
    sign = minus;
    micros = (Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)) * MICROS_PER_SECOND;
  } else if (two) {
    const [, minus = '', first = '0', second = '0'] = two;
    sign = minus;
    micros =
      twoPart === 'hours'
        ? (Number(first) * 3_600 + Number(second) * 60) * MICROS_PER_SECOND
        : (Number(first) * 60 + Number(second)) * MICROS_PER_SECOND;
  } else {
    return null;
  }
  return Math.round(sign === '-' ? -micros : micros);
}
