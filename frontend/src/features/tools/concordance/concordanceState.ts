import type { ConcordanceRequest } from '@/features/project/api';
export { emptyConcordance } from '../common/analysisRequest';
export { analysisDraftKey as concordanceKey } from '../common/analysisDraftStore';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
export const useConcordanceState = createAnalysisDraftStore<ConcordanceRequest>();
