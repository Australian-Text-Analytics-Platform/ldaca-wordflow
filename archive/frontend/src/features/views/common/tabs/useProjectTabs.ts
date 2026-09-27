/** Manage durable Project Tabs plus frontend-owned tab presentation state. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTab as createServerTab,
  deleteTab as deleteServerTab,
  updateTab as updateServerTab,
} from '@/api';
import type {
  AnalysisKind,
  Tab,
  TabResource,
  TopicModelingProjectionSelection,
  UpdateTabData,
} from '@/api';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import {
  DEFAULT_TAB_INPUT_SET_ID,
  reorderTabs,
  tabFromResource,
  type AnalysisTab,
  type AnalysisTabInput,
  type AnalysisTabInputSets,
} from './tabStateOps';
import {
  analysisTabSettingsKey,
  analysisTabsPresentationKey,
  useAnalysisTabsPresentationStore,
} from './analysisTabsPresentationStore';
import { useProjectTabResources } from './projectTabsQuery';

export interface UseProjectTabsResult {
  tabs: AnalysisTab[];
  activeTabId: string | null;
  isLoading: boolean;
  createTab: (title?: string) => Promise<Tab | null>;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (orderedTabIds: string[]) => void;
  setTabInputSet: (tabId: string, selectorId: string, inputs: AnalysisTabInput[]) => void;
  setTabSetting: (tabId: string, key: string, value: string) => void;
  setAnnotationCorrectionColumn: (
    tabId: string,
    nodeId: string,
    column: string | null,
  ) => Promise<void>;
  clearAnnotationCorrectionColumns: (tabId: string) => Promise<void>;
  setPresentationSettings: (tabId: string, patch: TabPresentationPatch) => Promise<void>;
}

interface TabPresentationPatch {
  stopWords?: string[];
  wordsPerTopic?: number;
  projectionSelection?: TopicModelingProjectionSelection | null;
}

interface LocalTabState {
  input_sets?: AnalysisTabInputSets;
}

function inputSetsEqual(left: AnalysisTabInput[], right: AnalysisTabInput[]): boolean {
  return (
    left.length === right.length &&
    left.every((input, index) => {
      const other = right.at(index);
      return other?.node_id === input.node_id && other.column === input.column;
    })
  );
}

const asAnalysisKind = (value: string): AnalysisKind => {
  if (
    value === 'annotation' ||
    value === 'concordance' ||
    value === 'quotation' ||
    value === 'sequential' ||
    value === 'token_frequency' ||
    value === 'topic_modeling'
  ) {
    return value;
  }
  throw new Error(`Unsupported analysis tab kind: ${value}`);
};

function presentationUpdate(
  kind: AnalysisKind,
  patch: TabPresentationPatch,
): UpdateTabData['body'] {
  if (kind === 'token_frequency' && patch.stopWords !== undefined) {
    return { kind, stop_words: { words: patch.stopWords } };
  }
  if (kind === 'topic_modeling') {
    return {
      kind,
      ...(patch.stopWords === undefined ? {} : { stop_words: { words: patch.stopWords } }),
      ...(patch.wordsPerTopic === undefined ? {} : { words_per_topic: patch.wordsPerTopic }),
      ...(patch.projectionSelection === undefined
        ? {}
        : { projection_selection: patch.projectionSelection }),
    };
  }
  throw new Error(`Tab kind ${kind} has no presentation settings`);
}

function withPresentationPatch(tab: Tab, patch: TabPresentationPatch): Tab {
  if (tab.settings.kind === 'token_frequency' && patch.stopWords !== undefined) {
    return {
      ...tab,
      settings: { ...tab.settings, stop_words: { words: patch.stopWords } },
    };
  }
  if (tab.settings.kind === 'topic_modeling') {
    return {
      ...tab,
      settings: {
        ...tab.settings,
        ...(patch.stopWords === undefined ? {} : { stop_words: { words: patch.stopWords } }),
        ...(patch.wordsPerTopic === undefined ? {} : { words_per_topic: patch.wordsPerTopic }),
        ...(patch.projectionSelection === undefined
          ? {}
          : { projection_selection: patch.projectionSelection }),
      },
    };
  }
  return tab;
}

function mergeServerTabs(
  serverTabs: Tab[],
  local: Record<string, LocalTabState>,
  settingsFor: (tabId: string) => Record<string, string> | undefined,
): AnalysisTab[] {
  return serverTabs.map((tab) =>
    tabFromResource(tab, { ...local[tab.id], settings: settingsFor(tab.id) }),
  );
}

/**
 * Server tabs are authoritative for identity, names, analysis ownership, and
 * Annotation correction-column drafts.
 * Active selection is device-local and keyed by Project and analysis kind.
 * Ordering, input selections, and settings stay in memory so drafts do not
 * become a second persistence format.
 */
export function useProjectTabs(
  projectId: string | null | undefined,
  analysisType: string,
): UseProjectTabsResult {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id ?? '__anonymous__');
  const kind = asAnalysisKind(analysisType);
  const queryKey = queryKeys.projectTabs(projectId ?? '__none__');
  const presentationKey = analysisTabsPresentationKey(userId, projectId, kind);
  const activeTabId = useAnalysisTabsPresentationStore(
    (state) => state.activeTabIds[presentationKey] ?? null,
  );
  const tabSettings = useAnalysisTabsPresentationStore((state) => state.tabSettings);
  const rememberActiveTab = useAnalysisTabsPresentationStore((state) => state.rememberActiveTab);
  const rememberTabSetting = useAnalysisTabsPresentationStore((state) => state.rememberTabSetting);
  const forgetTabSettings = useAnalysisTabsPresentationStore((state) => state.forgetTabSettings);
  const pruneTabs = useAnalysisTabsPresentationStore((state) => state.pruneTabs);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [localState, setLocalState] = useState<Record<string, LocalTabState>>({});
  const creatingRef = useRef(false);

  const tabsQuery = useProjectTabResources(projectId);

  const serverTabs = (tabsQuery.data ?? []).filter(
    (tab): tab is Tab => tab.availability === 'available' && tab.kind === kind,
  );
  const mergedTabs = mergeServerTabs(
    serverTabs,
    localState,
    (tabId) => tabSettings[analysisTabSettingsKey(userId, projectId, tabId)],
  );
  const orderedTabs = orderedIds.length > 0 ? reorderTabs(mergedTabs, orderedIds) : mergedTabs;
  const resolvedActiveId =
    activeTabId && orderedTabs.some((tab) => tab.tab_id === activeTabId)
      ? activeTabId
      : (orderedTabs[0]?.tab_id ?? null);

  useEffect(() => {
    if (!projectId || !tabsQuery.isSuccess) return;
    pruneTabs(
      userId,
      projectId,
      tabsQuery.data.map((tab) => tab.id),
    );
  }, [pruneTabs, tabsQuery.data, tabsQuery.isSuccess, userId, projectId]);

  /* eslint-disable react-hooks/set-state-in-effect -- Reset ephemeral tab drafts when the selected project changes. */
  useEffect(() => {
    if (!projectId) {
      setOrderedIds([]);
      setLocalState({});
      return;
    }
    setOrderedIds((current) =>
      current.length > 0
        ? current.filter((id) => orderedTabs.some((tab) => tab.tab_id === id))
        : [],
    );
    // The server tab count is the external change that invalidates local ordering;
    // names and analysis state are already represented by the merged query data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, serverTabs.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!projectId || tabsQuery.isLoading || activeTabId === resolvedActiveId) return;
    rememberActiveTab(userId, projectId, kind, resolvedActiveId);
  }, [
    activeTabId,
    kind,
    rememberActiveTab,
    resolvedActiveId,
    tabsQuery.isLoading,
    userId,
    projectId,
  ]);

  const setLocalTab = useCallback(
    (tabId: string, update: (previous: LocalTabState) => LocalTabState) => {
      setLocalState((current) => {
        const previous = current[tabId] ?? {};
        const next = update(previous);
        return next === previous ? current : { ...current, [tabId]: next };
      });
    },
    [],
  );

  const invalidate = useCallback(() => {
    if (projectId) void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey, projectId]);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!projectId) return null;
      const { data } = await createServerTab({
        path: { workspace_id: projectId },
        body: { kind, name },
        throwOnError: true,
      });
      return data;
    },
    onSuccess: (tab) => {
      creatingRef.current = false;
      if (tab) {
        const nextOrder = [
          ...orderedTabs.map((item) => item.tab_id).filter((id) => id !== tab.id),
          tab.id,
        ];
        queryClient.setQueryData<TabResource[]>(queryKey, (current) => [
          ...(current ?? []).filter((item) => item.id !== tab.id),
          tab,
        ]);
        setOrderedIds(nextOrder);
        rememberActiveTab(userId, projectId, kind, tab.id);
      }
      invalidate();
    },
    onError: () => {
      creatingRef.current = false;
    },
  });
  const { isPending: isCreating, mutateAsync: createServerTabAsync } = createMutation;

  const createTab = useCallback(
    async (title = `Analysis ${String(serverTabs.length + 1)}`): Promise<Tab | null> => {
      if (!projectId || isCreating || creatingRef.current) return null;
      creatingRef.current = true;
      return await createServerTabAsync(title);
    },
    [createServerTabAsync, isCreating, serverTabs.length, projectId],
  );

  const closeMutation = useMutation({
    mutationFn: async (tabId: string) => {
      if (!projectId) return;
      await deleteServerTab({
        path: { workspace_id: projectId, tab_id: tabId },
        throwOnError: true,
      });
    },
    onSuccess: (_value, tabId) => {
      setLocalState((current) => {
        const { [tabId]: _removed, ...remaining } = current;
        return remaining;
      });
      setOrderedIds((current) => current.filter((id) => id !== tabId));
      forgetTabSettings(userId, projectId, tabId);
      const currentActive =
        useAnalysisTabsPresentationStore.getState().activeTabIds[presentationKey] ?? null;
      if (currentActive === tabId) {
        const fallbackTabId = orderedTabs.find((tab) => tab.tab_id !== tabId)?.tab_id ?? null;
        rememberActiveTab(userId, projectId, kind, fallbackTabId);
      }
      invalidate();
    },
  });
  const { mutate: closeServerTab } = closeMutation;

  const closeTab = useCallback(
    (tabId: string) => {
      if (projectId) closeServerTab(tabId);
    },
    [closeServerTab, projectId],
  );

  const renameMutation = useMutation({
    mutationFn: async ({ tabId, title }: { tabId: string; title: string }) => {
      if (!projectId) return;
      await updateServerTab({
        path: { workspace_id: projectId, tab_id: tabId },
        body: { kind, name: title },
        throwOnError: true,
      });
    },
    onSuccess: invalidate,
  });
  const { mutate: renameServerTab } = renameMutation;

  const renameTab = useCallback(
    (tabId: string, title: string) => {
      if (projectId) renameServerTab({ tabId, title });
    },
    [renameServerTab, projectId],
  );

  const setActiveTab = useCallback(
    (tabId: string) => {
      if (resolvedActiveId && resolvedActiveId !== tabId) {
        setLocalState((current) => {
          const { [resolvedActiveId]: _discardedDraft, ...remaining } = current;
          return remaining;
        });
      }
      rememberActiveTab(userId, projectId, kind, tabId);
    },
    [kind, rememberActiveTab, resolvedActiveId, userId, projectId],
  );

  const reorder = useCallback((ids: string[]) => {
    setOrderedIds(ids);
  }, []);

  const setTabInputSet = useCallback(
    (tabId: string, selectorId: string, inputs: AnalysisTabInput[]) => {
      setLocalTab(tabId, (previous) => {
        const previousInputs = previous.input_sets?.[selectorId] ?? [];
        if (inputSetsEqual(previousInputs, inputs)) return previous;
        return {
          ...previous,
          input_sets: {
            ...(previous.input_sets ?? { [DEFAULT_TAB_INPUT_SET_ID]: [] }),
            [selectorId]: inputs,
          },
        };
      });
    },
    [setLocalTab],
  );

  const setTabSetting = useCallback(
    (tabId: string, key: string, value: string) => {
      rememberTabSetting(userId, projectId, tabId, key, value);
    },
    [rememberTabSetting, userId, projectId],
  );

  const correctionColumnMutation = useMutation({
    mutationFn: async ({ tabId, columns }: { tabId: string; columns: Record<string, string> }) => {
      if (!projectId) return;
      const { data } = await updateServerTab({
        path: { workspace_id: projectId, tab_id: tabId },
        body: { kind: 'annotation', correction_columns: columns },
        throwOnError: true,
      });
      return data;
    },
    onMutate: async ({ tabId, columns }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TabResource[]>(queryKey);
      queryClient.setQueryData<TabResource[]>(queryKey, (current) =>
        current?.map((tab) =>
          tab.id === tabId && tab.availability === 'available' && tab.settings.kind === 'annotation'
            ? { ...tab, settings: { ...tab.settings, correction_columns: columns } }
            : tab,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (tab) => {
      if (!tab) return;
      queryClient.setQueryData<TabResource[]>(queryKey, (current) =>
        current?.map((item) => (item.id === tab.id ? tab : item)),
      );
    },
  });
  const { mutateAsync: saveCorrectionColumn } = correctionColumnMutation;

  const setAnnotationCorrectionColumn = useCallback(
    async (tabId: string, nodeId: string, column: string | null) => {
      const tab = serverTabs.find((item) => item.id === tabId);
      if (!tab) return;
      if (tab.settings.kind !== 'annotation') return;
      const columns = { ...tab.settings.correction_columns };
      if (column) columns[nodeId] = column;
      else Reflect.deleteProperty(columns, nodeId);
      await saveCorrectionColumn({
        tabId,
        columns,
      });
    },
    [saveCorrectionColumn, serverTabs],
  );

  const clearAnnotationCorrectionColumns = useCallback(
    async (tabId: string) => {
      await saveCorrectionColumn({ tabId, columns: {} });
    },
    [saveCorrectionColumn],
  );

  const presentationMutation = useMutation({
    mutationFn: async ({ tabId, patch }: { tabId: string; patch: TabPresentationPatch }) => {
      if (!projectId) throw new Error('Project is required');
      const { data } = await updateServerTab({
        path: { workspace_id: projectId, tab_id: tabId },
        body: presentationUpdate(kind, patch),
        throwOnError: true,
      });
      return data;
    },
    onMutate: async ({ tabId, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TabResource[]>(queryKey);
      queryClient.setQueryData<TabResource[]>(queryKey, (current) =>
        current?.map((tab) =>
          tab.id === tabId && tab.availability === 'available'
            ? withPresentationPatch(tab, patch)
            : tab,
        ),
      );
      return { previous };
    },
    onError: (cause, variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error('Failed to save Tab settings.', {
        description: cause instanceof Error ? cause.message : String(cause),
        action: {
          label: 'Retry',
          onClick: () => {
            presentationMutation.mutate(variables);
          },
        },
      });
    },
    onSuccess: (tab) => {
      queryClient.setQueryData<TabResource[]>(queryKey, (current) =>
        current?.map((item) => (item.id === tab.id ? tab : item)),
      );
    },
  });
  const { mutateAsync: savePresentationSettings } = presentationMutation;

  const setPresentationSettings = useCallback(
    async (tabId: string, patch: TabPresentationPatch) => {
      await savePresentationSettings({ tabId, patch });
    },
    [savePresentationSettings],
  );

  return {
    tabs: orderedTabs,
    activeTabId: resolvedActiveId,
    isLoading: Boolean(projectId) && tabsQuery.isLoading,
    createTab,
    closeTab,
    renameTab,
    setActiveTab,
    reorderTabs: reorder,
    setTabInputSet,
    setTabSetting,
    setAnnotationCorrectionColumn,
    clearAnnotationCorrectionColumns,
    setPresentationSettings,
  };
}
