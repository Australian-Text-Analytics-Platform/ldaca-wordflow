/**
 * Order modes for the category conversion window (issue 318).
 * Used by: CategoryOrderPanel. The backend lists values in their default order
 * (an ordered category's own order; text A to Z with numbers inside labels
 * compared as numbers; numbers, dates and true/false by value); these helpers
 * derive the other orders from it.
 */

export type CategoryOrderKind = 'text' | 'value';
export type CategoryOrderMode = 'current' | 'ascending' | 'descending' | 'custom';

type NaturalPart = [number, number, string];

const naturalParts = (label: string): NaturalPart[] =>
  label
    .split(/(\d+)/)
    .filter(Boolean)
    .map(
      (part): NaturalPart =>
        /^\d+$/.test(part) ? [0, Number(part), ''] : [1, 0, part.toLowerCase()],
    );

/** A to Z ignoring case, with numbers inside labels compared as numbers ("Q9" before "Q10"). */
export const naturalCompare = (left: string, right: string): number => {
  const a = naturalParts(left);
  const b = naturalParts(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const [kindA, numberA, textA] = a[index] ?? [0, 0, ''];
    const [kindB, numberB, textB] = b[index] ?? [0, 0, ''];
    if (kindA !== kindB) return kindA - kindB;
    if (numberA !== numberB) return numberA - numberB;
    if (textA !== textB) return textA < textB ? -1 : 1;
  }
  if (a.length !== b.length) return a.length - b.length;
  return left < right ? -1 : left > right ? 1 : 0;
};

/**
 * The labels in one order mode. ``defaults`` is the backend's default order;
 * ``isOrdered`` says it is the column's own order rather than A to Z or by value.
 */
export const orderedLabels = (
  defaults: readonly string[],
  mode: Exclude<CategoryOrderMode, 'custom'>,
  kind: CategoryOrderKind,
  isOrdered: boolean,
): string[] => {
  if (mode === 'current') return [...defaults];
  // An ordered category's own order is not A to Z; text sorts naturally again.
  const ascending =
    isOrdered && kind === 'text' ? [...defaults].sort(naturalCompare) : [...defaults];
  return mode === 'ascending' ? ascending : ascending.reverse();
};

/** Move one label to another's position, as a drag does. */
export const moveLabel = (labels: readonly string[], from: string, to: string): string[] => {
  const next = [...labels];
  const fromIndex = next.indexOf(from);
  const toIndex = next.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return next;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
};

/**
 * Combine category orders for Stack, as the backend does (issue 318): keep every
 * order when they never disagree about which of two values comes first, otherwise
 * fall back to A to Z. Values only in unordered categories follow, A to Z.
 */
export const stackedCategoryOrder = (
  orders: readonly (readonly string[])[],
  unordered: readonly string[],
): { order: string[]; kept: boolean } => {
  const values: string[] = [];
  orders.forEach((order) => {
    order.forEach((value) => {
      if (!values.includes(value)) values.push(value);
    });
  });
  const after = new Map(values.map((value) => [value, new Set<string>()]));
  orders.forEach((order) => {
    order.forEach((value, index) => {
      order.slice(index + 1).forEach((later) => after.get(value)?.add(later));
    });
  });
  const remaining = [...values];
  let merged: string[] = [];
  let kept = true;
  while (remaining.length > 0) {
    const ready = remaining.find(
      (value) => !remaining.some((other) => other !== value && after.get(other)?.has(value)),
    );
    if (ready === undefined) {
      merged = [...values].sort(naturalCompare);
      kept = false;
      break;
    }
    merged.push(ready);
    remaining.splice(remaining.indexOf(ready), 1);
  }
  const extra = [...new Set(unordered)]
    .filter((value) => !merged.includes(value))
    .sort(naturalCompare);
  return { order: [...merged, ...extra], kept };
};
