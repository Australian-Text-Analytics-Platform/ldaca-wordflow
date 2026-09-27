import type { AnnotationRequest, AnnotationSetup } from '@/features/project/api';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
export const useAnnotationState = createAnalysisDraftStore<{
  setup: AnnotationSetup;
  execution?: Omit<AnnotationRequest, 'setup'>;
}>();
