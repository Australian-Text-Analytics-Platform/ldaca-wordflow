/** The exact text the Arrow decoder writes for timestamps (Date#toISOString). */
const DECODED_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})(\.\d{3})Z$/;

/**
 * Shows a decoded timestamp as "2020-01-30 00:00" (issue 205): year first,
 * seconds only when they are not zero, no time zone (Wordflow stores UTC).
 * Any other text is returned unchanged. Used only where values are displayed;
 * the data itself keeps the ISO text that charts and filters parse.
 */
export function displayDateTime(text: string): string {
  const match = DECODED_TIMESTAMP.exec(text);
  if (!match) return text;
  const [, date = '', hoursMinutes = '', seconds = '', fraction = ''] = match;
  const shownSeconds = seconds === ':00' && fraction === '.000' ? '' : seconds;
  const shownFraction = fraction === '.000' ? '' : fraction;
  return `${date} ${hoursMinutes}${shownSeconds}${shownFraction}`;
}
