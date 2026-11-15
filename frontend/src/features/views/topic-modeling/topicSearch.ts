import { topicSearchTerms } from './topicModelingAdapters';

/**
 * Search terms in Topic Modelling's search box: highlighting follows the box
 * at once, filtering follows the terms last applied (Chao, 15 Nov 2026).
 * Used by: useTopicModelingResultControls, TopicModelingFeature and the
 * results panel.
 */

/** A term's key: terms that differ only in case are one term. */
const searchTermKey = (term: string): string => term.toLocaleLowerCase();

/**
 * Gives each term a colour slot that it keeps until it is removed, so adding
 * a term at the front does not recolour the others.
 * Flow: a term already present keeps its slot; a term typed in place of a
 * removed one (same position) takes over its slot, so editing a word does
 * not change its colour; any other new term takes the lowest free slot.
 * Slots beyond the palette wrap round where the colour is chosen.
 */
export function assignSearchTermSlots(
  previousTerms: readonly string[],
  previousSlots: ReadonlyMap<string, number>,
  nextTerms: readonly string[],
): Map<string, number> {
  const nextKeys = new Set(nextTerms.map(searchTermKey));
  const slots = new Map<string, number>();
  for (const term of nextTerms) {
    const key = searchTermKey(term);
    const slot = previousSlots.get(key);
    if (slot !== undefined) slots.set(key, slot);
  }
  const used = new Set(slots.values());
  nextTerms.forEach((term, index) => {
    const key = searchTermKey(term);
    if (slots.has(key)) return;
    const previous = previousTerms[index];
    const inherited =
      previous !== undefined && !nextKeys.has(searchTermKey(previous))
        ? previousSlots.get(searchTermKey(previous))
        : undefined;
    let slot = 0;
    if (inherited !== undefined && !used.has(inherited)) slot = inherited;
    else while (used.has(slot)) slot += 1;
    slots.set(key, slot);
    used.add(slot);
  });
  return slots;
}

/** A clicked word as a term: `*`, `?` and `\` in it are literal, not wildcards. */
const literalTerm = (word: string): string => word.replace(/[\\*?]/g, '\\$&');

/**
 * Adds a clicked word to the front of the search, or removes it when it is
 * already a term. Only the exact term is removed: a wildcard term that
 * matches the word stays. The terms are written back separated by commas.
 */
export function toggleSearchWord(query: string, word: string): string {
  const term = literalTerm(word.trim());
  if (!term) return query;
  const terms = topicSearchTerms(query);
  const key = searchTermKey(term);
  const kept = terms.filter((existing) => searchTermKey(existing) !== key);
  const next = kept.length === terms.length ? [term, ...terms] : kept;
  return next.join(', ');
}

/** Whether two searches have the same terms, ignoring separators and case. */
export function sameSearchTerms(left: string, right: string): boolean {
  const leftKeys = topicSearchTerms(left).map(searchTermKey);
  const rightKeys = topicSearchTerms(right).map(searchTermKey);
  return (
    leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index])
  );
}
