import type { AnalysisKind, Tab } from '@/api';
import type { ViewType } from '@/features/views/viewIds';

export interface AnalysisNavigationDefinition {
  kind: AnalysisKind;
  view: ViewType;
  label: string;
  /** Short tool name for the narrow Tasks panel (issue 199). */
  shortLabel: string;
}

/** Canonical navigation and user-facing identity for each backend-owned analysis Tab kind. */
const ANALYSIS_NAVIGATION: readonly AnalysisNavigationDefinition[] = [
  {
    kind: 'token_frequency',
    view: 'token-frequency',
    label: 'Token Frequency',
    shortLabel: 'Freq',
  },
  { kind: 'concordance', view: 'concordance', label: 'Concordance', shortLabel: 'Conc' },
  { kind: 'sequential', view: 'analysis', label: 'Trends', shortLabel: 'Trends' },
  { kind: 'topic_modeling', view: 'topic-modeling', label: 'Topic Modelling', shortLabel: 'Topic' },
  { kind: 'quotation', view: 'quotation', label: 'Quotation', shortLabel: 'Quote' },
  { kind: 'annotation', view: 'annotation', label: 'Annotation', shortLabel: 'Annot' },
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
  return `${analysisNavigationForKind(tab.kind).label}: ${displayTabTitle(tab.name)}`;
};

const LEGACY_DEFAULT_TAB_TITLE = /^Analysis (\d+)$/;

/**
 * Tab names are plain numbers by default; tabs saved as "Analysis N" by
 * earlier versions show as "N" (issue 199).
 */
export const displayTabTitle = (name: string): string =>
  LEGACY_DEFAULT_TAB_TITLE.exec(name.trim())?.[1] ?? name;

/** Next free default tab name: one more than the largest numbered tab. */
export const nextTabTitle = (names: readonly string[]): string => {
  const numbers = names
    .map((name) => displayTabTitle(name))
    .filter((name) => /^\d+$/.test(name))
    .map(Number);
  return String(numbers.length > 0 ? Math.max(...numbers) + 1 : names.length + 1);
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
