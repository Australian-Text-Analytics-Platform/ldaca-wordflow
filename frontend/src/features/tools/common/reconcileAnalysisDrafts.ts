import { useAnnotationState } from '../annotation/annotationState';
import { useConcordanceState } from '../concordance/concordanceState';
import { usePlotState } from '../plots/plotState';
import { useQuotationState } from '../quotation/quotationState';
import { useFrequencyState } from '../token-frequency/frequencyState';
import { useTopicState } from '../topic-modeling/topicState';
import { type Rename } from './renameReferences';
export function reconcileAnalysisDrafts(base: string, renames: Rename[]) {
  for (const rename of renames) {
    for (const store of [
      useConcordanceState,
      useQuotationState,
      useTopicState,
      usePlotState,
      useAnnotationState,
      useFrequencyState,
    ])
      store.getState().reconcile(base, rename);
  }
}
