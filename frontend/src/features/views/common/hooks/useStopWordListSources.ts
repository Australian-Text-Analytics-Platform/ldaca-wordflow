import { useWorkspaceTabResources } from '@/features/views/common/tabs/workspaceTabsQuery';
import {
  buildStopWordListSources,
  type StopWordListSource,
} from '@/features/views/common/utils/stopWordListSources';

/**
 * Reads the workspace's other tabs' saved stop-word lists from the shared tabs
 * query, which already holds every tab in the workspace.
 * Used by: TokenFrequencyFeature and TopicModelingFeature to feed the shared
 * stop-words dropdown's "From other tabs" group.
 */
export function useStopWordListSources(
  workspaceId: string | null,
  currentTabId: string,
): StopWordListSource[] {
  const tabsQuery = useWorkspaceTabResources(workspaceId);
  return buildStopWordListSources(tabsQuery.data ?? [], currentTabId);
}
