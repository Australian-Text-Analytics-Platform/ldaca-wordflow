import type { TopicModelingTopic } from './topicPresentation';

/**
 * Escapes literal text before it is embedded in a checklist-search RegExp.
 * Called by: globToRegExp for every non-wildcard query character.
 */
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Detects active glob wildcards while treating escaped `*` and `?` literally.
 * Called by: matchChecklistOption to choose glob or literal matching.
 * Flow: scan left to right, consume escaped characters, and stop at the first
 * unescaped wildcard.
 */
const hasUnescapedWildcard = (query: string): boolean => {
  let escaped = false;
  for (const char of query) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '*' || char === '?') {
      return true;
    }
  }
  return false;
};

/**
 * Converts a small glob query into a case-insensitive whole-label RegExp.
 * Called by: matchChecklistOption after it detects an active wildcard.
 * Flow: anchor the pattern, preserve escaped literals, translate `*`/`?`, and
 * retain a trailing backslash as a literal before compiling.
 */
const globToRegExp = (query: string): RegExp => {
  let pattern = '^';
  let escaped = false;

  for (const char of query) {
    if (escaped) {
      pattern += escapeRegex(char);
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '*') {
      pattern += '.*';
      continue;
    }

    if (char === '?') {
      pattern += '.';
      continue;
    }

    pattern += escapeRegex(char);
  }

  if (escaped) {
    pattern += '\\\\';
  }

  pattern += '$';
  return new RegExp(pattern, 'i');
};

/**
 * Decodes escaped wildcard characters before literal substring matching.
 * Called by: matchChecklistOption when no active wildcard is present.
 * Flow: unescape wildcard/backslash literals, preserve unknown escape pairs,
 * and retain a trailing backslash for the final substring comparison.
 */
const decodeEscapedWildcards = (query: string): string => {
  let result = '';
  let escaped = false;

  for (const char of query) {
    if (escaped) {
      if (char === '*' || char === '?' || char === '\\') {
        result += char;
      } else {
        result += `\\${char}`;
      }
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    result += char;
  }

  if (escaped) {
    result += '\\';
  }

  return result;
};

/**
 * Matches a label with the archived literal/glob language for Topic Modelling search.
 * Used by: FilterValueChecklist and Topic Modelling graph/list search so
 * cross-feature search semantics stay aligned.
 */
const matchChecklistOption = (optionLabel: string, query: string): boolean => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return true;
  }

  if (hasUnescapedWildcard(normalizedQuery)) {
    return globToRegExp(normalizedQuery).test(optionLabel);
  }

  return optionLabel.toLowerCase().includes(decodeEscapedWildcards(normalizedQuery).toLowerCase());
};

/** Keep escaped glob semantics for joined labels and each individual word. */
export const matchTopicWords = (words: string[], query: string) =>
  matchChecklistOption(words.join(', '), query) ||
  words.some((word) => matchChecklistOption(word, query));

export interface TopicEligibility {
  eligible: Set<number>;
  highlights: Map<number, Set<string>>;
}

/** One search/lasso projection supplies graph, lists and word highlights. */
export function topicEligibility(
  topics: TopicModelingTopic[],
  query: string,
  lasso: Set<number>,
): TopicEligibility {
  const eligible = new Set<number>();
  const highlights = new Map<number, Set<string>>();
  for (const topic of topics) {
    const words = topic.representative_words.map((word) => word.word);
    const matches = matchTopicWords(words, query);
    if (matches && (!lasso.size || lasso.has(topic.id))) eligible.add(topic.id);
    const highlighted = new Set<string>();
    if (query.trim() && matches) {
      for (const word of words) if (matchChecklistOption(word, query)) highlighted.add(word);
      if (!highlighted.size) {
        const joined = words.join(', ').toLowerCase();
        const literal = decodeEscapedWildcards(query.trim()).toLowerCase();
        const start = hasUnescapedWildcard(query) ? 0 : joined.indexOf(literal);
        const end = hasUnescapedWildcard(query) ? joined.length : start + literal.length;
        let offset = 0;
        for (const word of words) {
          const length = word.toLowerCase().length;
          if (offset < end && offset + length > start) highlighted.add(word);
          offset += length + 2;
        }
      }
    }
    highlights.set(topic.id, highlighted);
  }
  return { eligible, highlights };
}
