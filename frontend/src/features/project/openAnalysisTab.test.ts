import { expect, it } from 'vite-plus/test';
import { useAnnotationState } from '@/features/tools/annotation/annotationState';
import { useConcordanceState } from '@/features/tools/concordance/concordanceState';
import { useQuotationState } from '@/features/tools/quotation/quotationState';
import { useFrequencyState } from '@/features/tools/token-frequency/frequencyState';
import { useTopicState } from '@/features/tools/topic-modeling/topicState';
import { plotScope, usePlotMode, usePlotState } from '@/features/tools/plots/plotState';
import type { Tab } from '@/features/tools/common/analysisApi';
import { openAnalysisTab } from './openAnalysisTab';

it('opens every task-associated tool through its existing tab state', () => {
  const base = 'task-navigation';
  const tab = (kind: Tab['kind']): Tab => ({
    id: `tab-${kind}`,
    kind,
    name: 'Renamed tab',
    position: 0,
    settings: {},
    analysis: null,
  });
  for (const [kind, tool, state] of [
    ['frequency', 'token-frequency', useFrequencyState],
    ['concordance', 'concordance', useConcordanceState],
    ['quotation', 'quotation', useQuotationState],
    ['annotation', 'annotation', useAnnotationState],
    ['topic-modeling', 'topic-modeling', useTopicState],
  ] as const) {
    expect(openAnalysisTab(base, tab(kind))).toBe(tool);
    expect(state.getState().active[base]).toBe(`tab-${kind}`);
  }
  for (const kind of ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const) {
    expect(openAnalysisTab(base, tab(kind))).toBe('plots');
    expect(usePlotMode.getState().modes[base]).toBe(kind);
    expect(usePlotState.getState().active[plotScope(base, kind)]).toBe(`tab-${kind}`);
  }
});
