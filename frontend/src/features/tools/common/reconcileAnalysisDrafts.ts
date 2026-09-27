import { useAnnotationState } from '../annotation/annotationState';
import { useConcordanceState } from '../concordance/concordanceState';
import { useQuotationState } from '../quotation/quotationState';
import { useTopicState } from '../topic-modeling/topicState';
import { usePlotState } from '../plots/plotState';
import { useFrequencyState } from '../token-frequency/frequencyState';
import { renamedDrafts, type Rename } from './renameReferences';
export function reconcileAnalysisDrafts(base: string, renames: Rename[]) {
  for (const rename of renames) {
    for (const store of [
      useConcordanceState,
      useQuotationState,
      useTopicState,
      usePlotState,
      useAnnotationState,
    ])
      store.getState().reconcile(base, rename);
    useFrequencyState.setState((state) => ({ drafts: renamedDrafts(state.drafts, base, rename) }));
  }
}
