/**
 * Helpers for a Topic's example segments (issue 353): picking out the
 * Topic's words in a snippet, the "Top N%" typicality badge, and turning the
 * backend's code-point offsets into JavaScript string offsets.
 */

export interface TextPiece {
  text: string;
  /** True for one of the Topic's words. */
  word: boolean;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits `text` into pieces, marking whole-word occurrences of `words`
 * (case-insensitive). Words without letters or numbers on their edges match
 * anywhere, so Chinese or Japanese words are found inside unspaced text.
 */
export function splitTopicWords(text: string, words: readonly string[]): TextPiece[] {
  const terms = [...new Set(words.map((word) => word.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  if (!text || terms.length === 0) return [{ text, word: false }];
  const spaced = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}]/u;
  const pattern = terms
    .map((term) =>
      spaced.test(term)
        ? `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`
        : escapeRegExp(term),
    )
    .join('|');
  const matcher = new RegExp(pattern, 'giu');
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(matcher)) {
    const index = match.index;
    if (index > last) pieces.push({ text: text.slice(last, index), word: false });
    pieces.push({ text: match[0], word: true });
    last = index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), word: false });
  return pieces;
}

export type TypicalityBand = 'high' | 'middle' | 'low';

/** "Top 10%": the share of the Topic's segments at least this typical. */
export function typicalityLabel(typicality: number): string {
  return `Top ${String(Math.max(1, 100 - typicality))}%`;
}

/** Top quarter, middle half, bottom quarter of the Topic. */
export function typicalityBand(typicality: number): TypicalityBand {
  if (typicality >= 75) return 'high';
  if (typicality >= 25) return 'middle';
  return 'low';
}

interface TypicalityBadge {
  text: string;
  band: TypicalityBand;
  /** What the badge means, before the similarity figure. */
  explanation: string;
}

/**
 * The badge of one example. The rank is among the passages grouping put in
 * the topic, measured from their centre, so it is the same whether or not
 * Ungrouped passages joined. A passage that joined afterwards says so and is
 * placed on that scale; one less similar than every grouped passage is
 * outside it, which a merged topic or Always join the nearest topic can give.
 */
export function typicalityBadge({
  typicality,
  joined = false,
  outsideTopicRange = false,
}: {
  typicality: number;
  joined?: boolean;
  outsideTopicRange?: boolean;
}): TypicalityBadge {
  if (!joined) {
    return {
      text: typicalityLabel(typicality),
      band: typicalityBand(typicality),
      explanation: 'How typical of this topic: similarity to its centre',
    };
  }
  if (outsideTopicRange) {
    return {
      text: 'Joined · Outside',
      band: 'low',
      explanation:
        'Joined this topic by similarity, after grouping left it Ungrouped. Less similar to the topic’s centre than any passage grouping put here: similarity',
    };
  }
  return {
    text: `Joined · ${typicalityLabel(typicality)}`,
    band: typicalityBand(typicality),
    explanation:
      'Joined this topic by similarity, after grouping left it Ungrouped. Ranked among the passages grouping put here: similarity to their centre',
  };
}

/** JavaScript string offset of each code point offset in `text` (0..length). */
export function codePointOffsets(text: string): number[] {
  const offsets = [0];
  for (const character of text) {
    offsets.push((offsets[offsets.length - 1] ?? 0) + character.length);
  }
  return offsets;
}
