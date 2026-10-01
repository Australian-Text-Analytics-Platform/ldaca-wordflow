import type { AnnotationRequest, AnnotationSetup } from '@/features/tools/annotation/api';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
import { renameInput, type Rename } from '../common/renameReferences';
export interface AnnotationDraft {
  setup: AnnotationSetup;
  execution?: Omit<AnnotationRequest, 'setup'>;
}
export const useAnnotationState = createAnalysisDraftStore<AnnotationDraft>(renameAnnotationDraft);

function renameAnnotationDraft(request: AnnotationDraft, rename: Rename): AnnotationDraft {
  return {
    ...request,
    setup: {
      ...renameInput(request.setup, rename, ['document', 'annotation', 'correction']),
      codebook: request.setup.codebook
        ? renameInput(request.setup.codebook, rename, ['code', 'description'])
        : null,
    },
    ...(request.execution
      ? {
          execution: {
            ...request.execution,
            examples: request.execution.examples
              ? renameInput(request.execution.examples, rename, ['text', 'label'])
              : null,
          },
        }
      : {}),
  };
}
