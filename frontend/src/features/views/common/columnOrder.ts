/**
 * Column order chosen by dragging result table headers (issue 373).
 *
 * The saved order lists column names; columns not in it (newly shown
 * metadata) keep their place relative to their default neighbours, and saved
 * names no longer shown are ignored, so showing or hiding a column never
 * scrambles the rest.
 */

/** The columns in their saved order, new ones placed after their default neighbour. */
export function orderColumns(columns: readonly string[], saved: readonly string[]): string[] {
  const present = new Set(columns);
  const result = saved.filter((name, index) => present.has(name) && saved.indexOf(name) === index);
  const placed = new Set(result);
  columns.forEach((name, index) => {
    if (placed.has(name)) return;
    // After the nearest earlier default column already placed; else first.
    let at = 0;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const position = result.indexOf(columns[previous] ?? '');
      if (position >= 0) {
        at = position + 1;
        break;
      }
    }
    result.splice(at, 0, name);
    placed.add(name);
  });
  return result;
}

/** The order after moving `active` to where `over` is. */
export function moveColumn(order: readonly string[], active: string, over: string): string[] {
  const from = order.indexOf(active);
  const to = order.indexOf(over);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, active);
  return next;
}

export interface ColumnLayout {
  /** Metadata columns shown, in the order they were chosen. */
  shown: string[];
  /** Every column's place, as last dragged; see orderColumns. */
  order: string[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** A tab setting's saved layout; anything unreadable gives the defaults. */
export function readColumnLayout(raw: string | undefined): ColumnLayout {
  if (!raw) return { shown: [], order: [] };
  try {
    const parsed = JSON.parse(raw) as { shown?: unknown; order?: unknown };
    return { shown: strings(parsed.shown), order: strings(parsed.order) };
  } catch {
    return { shown: [], order: [] };
  }
}

/**
 * A tab's shown metadata columns and column order, saved as one tab setting
 * so both survive switching tabs and reopening the Project (issue 373).
 */
export function tabColumnLayout(
  settings: Readonly<Record<string, string>>,
  setSetting: (key: string, value: string) => void,
  key: string,
) {
  const layout = readColumnLayout(settings[key]);
  const save = (next: ColumnLayout) => {
    const value = JSON.stringify(next);
    // Unchanged layouts are not written: every write re-renders the tab.
    if (value !== JSON.stringify(readColumnLayout(settings[key]))) setSetting(key, value);
  };
  return {
    shown: layout.shown,
    setShown: (next: string[] | ((previous: string[]) => string[])) => {
      const latest = readColumnLayout(settings[key]);
      save({ ...latest, shown: typeof next === 'function' ? next(latest.shown) : next });
    },
    order: layout.order,
    setOrder: (order: string[]) => {
      save({ ...readColumnLayout(settings[key]), order });
    },
  };
}
