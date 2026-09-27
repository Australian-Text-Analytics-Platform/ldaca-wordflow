import { createAnalysisDraftStore } from '../common/analysisDraftStore';
import type { QuotationRequest } from '@/features/project/api';
export const useQuotationState = createAnalysisDraftStore<QuotationRequest>();
export { emptyQuotation } from '../common/analysisRequest';
