import type { TopicModelingTopic } from '@/api';

export function topicRepresentativeText(topic: TopicModelingTopic): string {
  return topic.representative_words.map((term) => term.word).join(', ');
}

/**
 * Splits a search into its terms at spaces, commas and other punctuation
 * (issue 434): "chil, home house" is three terms. `*`, `?` and `\` stay in
 * a term (wildcards and escapes), and so do hyphens and apostrophes
 * ("covid-19", "don't"). Repeated terms count once, ignoring case.
 *
 * Self-contained on purpose: the bubble chart's HTML download embeds this
 * function's source, so it must not use anything outside its body.
 */
export function topicSearchTerms(query: string): string[] {
  const seen = new Set<string>();
  return query.split(/[\s,;:.!"“”()[\]{}<>|/，、；：。！「」『』（）《》]+/u).filter((term) => {
    const key = term.toLocaleLowerCase();
    if (!term || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Whether a topic matches the search (issues 280, 434): any one of its words
 * matches any one term, so "chil, home" finds topics with child or homeless.
 * `matchOption` is the shared checklist matcher: a term is found inside a
 * word, or with `*` or `?` it must match the whole word, so `gs*` and `gs?`
 * find "gst" wherever it sits. `splitTerms` is `topicSearchTerms`.
 *
 * Self-contained on purpose: the bubble chart's HTML download embeds this
 * function's source, so it must not use anything outside its body.
 */
export function matchTopicWords(
  words: readonly string[],
  query: string,
  matchOption: (label: string, query: string) => boolean,
  splitTerms: (query: string) => string[],
): boolean {
  const terms = splitTerms(query);
  if (terms.length === 0) return true;
  return words.some((word) => terms.some((term) => matchOption(word, term)));
}

/**
 * The words of a topic that match the search, each with the index of the
 * first term it matches, so the list and the bubble's word cloud can colour
 * each term's matches alike (issues 342, 434).
 */
export function matchedTopicWords(
  words: readonly string[],
  query: string,
  matchOption: (label: string, query: string) => boolean,
): Map<string, number> {
  const terms = topicSearchTerms(query);
  const matched = new Map<string, number>();
  if (terms.length === 0) return matched;
  for (const word of words) {
    const index = terms.findIndex((term) => matchOption(word, term));
    if (index >= 0) matched.set(word, index);
  }
  return matched;
}

export function filterTopicRepresentativeWords(
  topics: TopicModelingTopic[],
  stopWords: ReadonlySet<string>,
): TopicModelingTopic[] {
  if (stopWords.size === 0) return topics;
  return topics.map((topic) => ({
    ...topic,
    representative_words: topic.representative_words.filter(
      (term) => !stopWords.has(term.word.toLocaleLowerCase()),
    ),
  }));
}

export function sliceTopicRepresentativeWords(
  topics: TopicModelingTopic[],
  count: number,
): TopicModelingTopic[] {
  const limit = Math.min(100, Math.max(3, Math.round(count)));
  return topics.map((topic) => ({
    ...topic,
    representative_words: topic.representative_words.slice(0, limit),
  }));
}

/**
 * Interpolates between two hex colours for topic bubble intensity scales.
 * Used by: topicModelingGraph to blend two corpus colours for each bubble.
 * Flow: parse both hex colors into RGB triples, linearly interpolate each channel by t, then return an rgb() string.
 */
export function interpolateColor(colorA: string, colorB: string, t: number): string {
  // Called twice by interpolateColor to parse the two endpoint colours into RGB channels.
  const parse = (color: string): [number, number, number] => {
    const parts = color
      .replace('#', '')
      .match(/.{2}/g)
      ?.map((value) => parseInt(value, 16)) ?? [0, 0, 0];
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };

  const [r1, g1, b1] = parse(colorA);
  const [r2, g2, b2] = parse(colorB);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

/**
 * Chooses readable text colour for chips rendered on arbitrary node colours.
 * Used by: TopicModelingBubbleChartSection for corpus-size chips.
 * Flow: reject missing or non-six-digit colors to white, compute RGB luminance, then choose dark text for light fills or white text otherwise.
 */
export function getReadableTextColor(hexColor: string): string {
  if (!hexColor) return '#ffffff';
  const normalized = hexColor.replace('#', '');
  if (normalized.length !== 6) return '#ffffff';

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 160 ? '#1e293b' : '#ffffff';
}

/**
 * Search matches are bold wherever topic words are listed, in one colour per
 * search term: orange for the first, as before, then the theme's other chart
 * colours, repeating after six terms (issues 342, 434).
 */
const MATCH_COLORS: readonly (readonly [variable: string, fallback: string])[] = [
  ['--vscode-charts-orange', '#d18616'],
  ['--vscode-charts-blue', '#1a5cff'],
  ['--vscode-charts-green', '#388a34'],
  ['--vscode-charts-purple', '#652d90'],
  ['--vscode-charts-red', '#ad0707'],
  ['--vscode-charts-yellow', '#667309'],
];

const matchColorEntry = (termIndex: number) =>
  MATCH_COLORS[termIndex % MATCH_COLORS.length] ?? (['--vscode-charts-orange', '#d18616'] as const);

/** The colour of a search term's matches as a CSS value, for text styled in the page. */
export function topicMatchColorVariable(termIndex = 0): string {
  const [variable, fallback] = matchColorEntry(termIndex);
  return `var(${variable}, ${fallback})`;
}

/** The colour of a search term's matches as a concrete value, for chart text that cannot read CSS variables. */
export function topicMatchColor(termIndex = 0): string {
  const [variable, fallback] = matchColorEntry(termIndex);
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}
