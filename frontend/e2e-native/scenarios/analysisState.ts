import type { Tab } from '../../src/features/project/api';
export const outputAnalysisId = (tab: Tab | undefined) =>
  tab?.analysis?.has_result ? tab.analysis.id : null;
