import type { ConcordanceRequest } from '@/features/tools/concordance/api';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
import { renameInput, type Rename } from '../common/renameReferences';
export { analysisDraftKey as concordanceKey } from '../common/analysisDraftStore';
export { emptyConcordance } from '../common/analysisRequest';
export const useConcordanceState = createAnalysisDraftStore<ConcordanceRequest>(renameRequest);

function renameRequest(request: ConcordanceRequest, rename: Rename): ConcordanceRequest {
  return {
    ...request,
    inputs: request.inputs.map((input) => renameInput(input, rename, ['column'])),
  };
}
