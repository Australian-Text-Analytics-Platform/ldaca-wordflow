import type { QuotationRequest } from '@/features/tools/quotation/api';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
import { renameInput, type Rename } from '../common/renameReferences';
export const useQuotationState = createAnalysisDraftStore<QuotationRequest>(renameRequest);
export { emptyQuotation } from '../common/analysisRequest';

function renameRequest(request: QuotationRequest, rename: Rename): QuotationRequest {
  return { ...request, input: renameInput(request.input, rename, ['column']) };
}
