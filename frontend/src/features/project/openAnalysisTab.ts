import { useAnnotationState } from '@/features/tools/annotation/annotationState';
import type { Tab } from '@/features/tools/common/analysisApi';
import { useConcordanceState } from '@/features/tools/concordance/concordanceState';
import { plotScope, usePlotMode, usePlotState } from '@/features/tools/plots/plotState';
import { useQuotationState } from '@/features/tools/quotation/quotationState';
import { useFrequencyState } from '@/features/tools/token-frequency/frequencyState';
import { useTopicState } from '@/features/tools/topic-modeling/topicState';
import type { ToolId } from '@/features/tools/toolIds';

/** Task navigation selects the feature's existing draft and tab interaction owner. */
export function openAnalysisTab(base: string, tab: Tab): ToolId {
  switch (tab.kind) {
    case 'frequency':
      useFrequencyState.getState().activate(base, tab.id);
      return 'token-frequency';
    case 'concordance':
      useConcordanceState.getState().activate(base, tab.id);
      return 'concordance';
    case 'quotation':
      useQuotationState.getState().activate(base, tab.id);
      return 'quotation';
    case 'annotation':
      useAnnotationState.getState().activate(base, tab.id);
      return 'annotation';
    case 'topic-modeling':
      useTopicState.getState().activate(base, tab.id);
      return 'topic-modeling';
    default:
      usePlotMode.getState().setMode(base, tab.kind);
      usePlotState.getState().activate(plotScope(base, tab.kind), tab.id);
      return 'plots';
  }
}
