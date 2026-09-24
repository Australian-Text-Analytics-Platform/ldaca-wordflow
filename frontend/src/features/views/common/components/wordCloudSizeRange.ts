/**
 * Estimated padded word-box area as a multiple of the canvas area. It exceeds 1
 * because echarts-wordcloud packs glyphs at pixel level, so small words fit in
 * the gaps around large ones. Measured with the real layout in headless
 * Chromium (1000x600, Zipf-like values): 1.4 spans about 91-98% of the width
 * and 88-91% of the height for 30-100 words with every word placed, where the
 * previous fixed 20-120px range spanned only 47-62%.
 */
const TARGET_FILL = 1.4;
/** Smallest word size relative to the largest. */
const MIN_FONT_SHARE_OF_MAX = 1 / 6;
/** Caps the largest word so a short list cannot produce one giant word. */
const MAX_FONT_SHARE_OF_HEIGHT = 1 / 2;
/** Floors that keep small clouds (such as topic bubbles) legible. */
const MIN_MAX_FONT_PX = 24;
const MIN_FONT_PX = 10;
/** Must match the series `gridSize`: echarts-wordcloud pads each word by it. */
const GRID_PADDING_PX = 4;
const LINE_HEIGHT_EM = 1.1;
/** Approximate glyph widths in em: CJK ideographs and Hangul are full width. */
const WIDE_CHAR_RE = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/u;
const NARROW_CHAR_EM = 0.6;
const WIDE_CHAR_EM = 1;

interface SizedWord {
  text: string;
  value: number;
}

interface WordCloudSizeInput {
  width: number;
  height: number;
  words: readonly SizedWord[];
}

const textWidthEm = (text: string): number =>
  Array.from(text).reduce(
    (total, char) => total + (WIDE_CHAR_RE.test(char) ? WIDE_CHAR_EM : NARROW_CHAR_EM),
    0,
  );

/**
 * Scales the font range so the words themselves fill the canvas: fewer or
 * shorter words get larger fonts, and resizing the pane rescales them.
 * echarts-wordcloud maps each value linearly into `sizeRange`, so this
 * estimates the padded box area of every word at a candidate largest size and
 * binary-searches the size whose total covers `TARGET_FILL` of the canvas.
 * `shrinkToFit` still guards words that would not fit.
 * Used by: ResponsiveWordCloud on every layout pass.
 */
export const wordCloudSizeRange = ({
  width,
  height,
  words,
}: WordCloudSizeInput): [number, number] => {
  const ceiling = Math.max(MIN_MAX_FONT_PX, Math.round(height * MAX_FONT_SHARE_OF_HEIGHT));
  const withRange = (maxFont: number): [number, number] => [
    Math.max(MIN_FONT_PX, Math.round(maxFont * MIN_FONT_SHARE_OF_MAX)),
    maxFont,
  ];
  if (words.length === 0 || width <= 0 || height <= 0) return withRange(ceiling);

  const values = words.map((word) => word.value);
  const low = Math.min(...values);
  const span = Math.max(...values) - low;
  const measured = words.map((word) => ({
    widthEm: textWidthEm(word.text),
    // Position of the word's value within the range, as linearMap computes it.
    share: span > 0 ? (word.value - low) / span : 0.5,
  }));

  const coveredArea = (maxFont: number) => {
    const [minFont] = withRange(maxFont);
    return measured.reduce((total, word) => {
      const font = minFont + (maxFont - minFont) * word.share;
      return (
        total +
        (word.widthEm * font + 2 * GRID_PADDING_PX) * (LINE_HEIGHT_EM * font + 2 * GRID_PADDING_PX)
      );
    }, 0);
  };

  const target = TARGET_FILL * width * height;
  if (coveredArea(ceiling) <= target) return withRange(ceiling);
  let lower = MIN_MAX_FONT_PX;
  let upper = ceiling;
  for (let step = 0; step < 20 && upper - lower > 0.5; step += 1) {
    const middle = (lower + upper) / 2;
    if (coveredArea(middle) > target) upper = middle;
    else lower = middle;
  }
  return withRange(Math.max(MIN_MAX_FONT_PX, Math.round(lower)));
};
