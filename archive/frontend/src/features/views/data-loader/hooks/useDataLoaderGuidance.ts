import { CONTEXTUAL_HINT_IDS } from '@/features/guidance/registry';
import { useProgressiveContextualHints } from '@/features/guidance/useProgressiveContextualHints';

interface DataLoaderGuidanceState {
  currentProjectId: string | null;
  loadingFiles: boolean;
  nodeCount: number;
  totalFileCount: number;
  projectBusy: boolean;
  projectCount: number;
}

/**
 * Publishes the Data Loader milestones reached by the current workflow state.
 * Ordering, visit deferral, and acknowledgment remain owned by GuidanceProvider.
 */
export function useDataLoaderGuidance({
  currentProjectId,
  loadingFiles,
  nodeCount,
  totalFileCount,
  projectBusy,
  projectCount,
}: DataLoaderGuidanceState) {
  const ids = CONTEXTUAL_HINT_IDS.dataLoader;
  const eligibleHintIds: string[] = [];
  if (!projectBusy && !loadingFiles) {
    if (!currentProjectId) {
      eligibleHintIds.push(projectCount === 0 ? ids.project : ids.projectLoad);
    } else {
      eligibleHintIds.push(ids.activeProject, ids.fileSources);
      if (totalFileCount > 0) eligibleHintIds.push(ids.addDataBlock);
      if (nodeCount > 0) eligibleHintIds.push(ids.dataBlocks);
    }
  }
  useProgressiveContextualHints(eligibleHintIds);
}
