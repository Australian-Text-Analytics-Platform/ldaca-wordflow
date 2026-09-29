import type { AnalysisKind, Tab } from '@/api';
import type { ViewType } from '@/features/views/viewIds';

export interface AnalysisNavigationDefinition {
  kind: AnalysisKind;
  view: ViewType;
  label: string;
  /** Short tool name for the narrow Tasks panel (issue 199). */
  shortLabel: string;
  /** Prefix of default tab names, as in F-1 or TM-2 (issue 211). */
  tabPrefix: string;
}

/** Canonical navigation and user-facing identity for each backend-owned analysis Tab kind. */
const ANALYSIS_NAVIGATION: readonly AnalysisNavigationDefinition[] = [
  {
    kind: 'token_frequency',
    view: 'token-frequency',
    label: 'Frequency',
    shortLabel: 'Freq',
    tabPrefix: 'F',
  },
  {
    kind: 'concordance',
    view: 'concordance',
    label: 'Concordance',
    shortLabel: 'Conc',
    tabPrefix: 'C',
  },
  { kind: 'sequential', view: 'analysis', label: 'Trends', shortLabel: 'Trends', tabPrefix: 'T' },
  {
    kind: 'topic_modeling',
    view: 'topic-modeling',
    label: 'Topic Modelling',
    shortLabel: 'Topic',
    tabPrefix: 'TM',
  },
  { kind: 'quotation', view: 'quotation', label: 'Quotation', shortLabel: 'Quote', tabPrefix: 'Q' },
  {
    kind: 'annotation',
    view: 'annotation',
    label: 'Annotation',
    shortLabel: 'Annot',
    tabPrefix: 'A',
  },
];

const NAVIGATION_BY_KIND = new Map(ANALYSIS_NAVIGATION.map((item) => [item.kind, item]));
const NAVIGATION_BY_VIEW = new Map(ANALYSIS_NAVIGATION.map((item) => [item.view, item]));

export const analysisNavigationForKind = (kind: AnalysisKind): AnalysisNavigationDefinition => {
  const definition = NAVIGATION_BY_KIND.get(kind);
  if (!definition) throw new Error(`Unsupported analysis kind: ${kind}`);
  return definition;
};

export const analysisNavigationForView = (view: ViewType): AnalysisNavigationDefinition | null =>
  NAVIGATION_BY_VIEW.get(view) ?? null;

export const analysisTabQuickAccessLabel = (tab: Pick<Tab, 'kind' | 'name'>): string => {
  return `${analysisNavigationForKind(tab.kind).label}: ${displayTabTitle(tab.name, tab.kind)}`;
};

// Default names saved by earlier versions: "Analysis N" (before issue 199)
// and a bare "N" (before issue 211).
const LEGACY_DEFAULT_TAB_TITLE = /^(?:Analysis )?(\d+)$/;

/** The number of a default tab name (F-3 gives 3), or null for a renamed tab. */
const defaultTabNumber = (name: string, kind: AnalysisKind): number | null => {
  const trimmed = name.trim();
  const legacy = LEGACY_DEFAULT_TAB_TITLE.exec(trimmed);
  if (legacy) return Number(legacy[1]);
  const prefix = analysisNavigationForKind(kind).tabPrefix;
  const match = /^([A-Z]+)-(\d+)$/.exec(trimmed);
  return match?.[1] === prefix ? Number(match[2]) : null;
};

/**
 * Tab names default to the tool's prefix and a number, such as F-1 or TM-2
 * (issue 211). Tabs saved with an older default name ("3" or "Analysis 3")
 * show with the prefix; renamed tabs keep their names.
 */
export const displayTabTitle = (name: string, kind: AnalysisKind): string => {
  const number = defaultTabNumber(name, kind);
  return number === null ? name : `${analysisNavigationForKind(kind).tabPrefix}-${String(number)}`;
};

/**
 * A task's name in the Tasks panel always starts with its tool's prefix
 * (issue 235): a default name stays "C-2"; any other name reads "C - yeah".
 */
export const taskTabName = (name: string, kind: AnalysisKind): string => {
  const shown = displayTabTitle(name, kind);
  return defaultTabNumber(name, kind) === null
    ? `${analysisNavigationForKind(kind).tabPrefix} - ${shown}`
    : shown;
};

/** Next free default tab name: one more than the largest numbered tab. */
export const nextTabTitle = (names: readonly string[], kind: AnalysisKind): string => {
  const numbers = names
    .map((name) => defaultTabNumber(name, kind))
    .filter((number): number is number => number !== null);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : names.length + 1;
  return `${analysisNavigationForKind(kind).tabPrefix}-${String(next)}`;
};

export const filterAnalysisTabs = <T extends Pick<Tab, 'kind' | 'name'>>(
  tabs: readonly T[],
  query: string,
): T[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...tabs];
  return tabs.filter((tab) =>
    analysisTabQuickAccessLabel(tab).toLocaleLowerCase().includes(normalizedQuery),
  );
};
