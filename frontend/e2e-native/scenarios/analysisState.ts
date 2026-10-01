import type { Tab } from '@/features/tools/common/analysisApi';
export const outputAnalysisId = (tab: Tab | undefined) =>
  tab?.analysis?.has_result ? tab.analysis.id : null;
