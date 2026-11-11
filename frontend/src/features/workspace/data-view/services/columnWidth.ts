/**
 * Which Data Editor columns are limited in width.
 *
 * A column whose values would not fit the limited width is drawn at that
 * width, with its text cut short, and gets an Expand button. The rule used to
 * be "a value longer than 120 characters", which left values of about 45 to
 * 120 characters, such as a file URL, at their full width: one metadata
 * column could take most of the table (Chao, 2026-11).
 */

/** Width in pixels of a limited column, and of one that is expanded. */
export const COLLAPSED_COLUMN_MAX_WIDTH = 320;
export const EXPANDED_COLUMN_MAX_WIDTH = 960;
/** Rows of the page read to decide. */
export const WIDE_COLUMN_SAMPLE_LIMIT = 25;
/**
 * About how many characters of cell text fit the limited width: 320 px less
 * the cell's padding, at close to 7 px a character in the table's font.
 */
export const WIDE_COLUMN_THRESHOLD = 44;

/** Chinese, Japanese and Korean characters, and full-width forms, are about twice as wide. */
const DOUBLE_WIDTH = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/g;

/** A text's width in Latin characters. */
export function textWidthUnits(text: string): number {
  return text.length + (text.match(DOUBLE_WIDTH)?.length ?? 0);
}

/** Whether a cell's text is too long for the limited width. */
export function isWideText(text: string): boolean {
  return textWidthUnits(text) > WIDE_COLUMN_THRESHOLD;
}
