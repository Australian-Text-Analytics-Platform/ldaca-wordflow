import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { UserFileImport, UserFileImportPage, ProjectCatalogueItem } from '@/api';
import {
  cancelUserFileImport,
  clearTabAnalysis,
  deleteUserFileImport,
  getAnalysis,
  getUserFileImport,
  listUserFileImports,
} from '@/api';
import { projectAnalysesQueryOptions } from '@/features/project/common/hooks/projectAnalysesQuery';
import { invalidateNodeProjectQueries } from '@/features/project/common/hooks/projectMutationCache';
import { queryKeys } from '@/lib/queryKeys';
import { useFreshNodesStore } from '@/stores/freshNodesStore';
import { analysisToTask, importToTask, sortTasks, type TaskItem } from './taskProjection';
import {
  type BackendEvent,
  useProjectTaskStreamClient,
  type ProjectTaskStreamClientState,
} from './useProjectTaskStreamClient';

const IMPORT_PAGE_SIZE = 100;

const createsProjectDataBlocks = (kind: string): boolean =>
  kind === 'concordance_match_data_block_creation' ||
  kind === 'concordance_document_data_block_creation' ||
  kind === 'quotation_result_data_block_creation' ||
  kind === 'sequential_data_block_creation' ||
  kind === 'topic_modeling_data_block_creation';

const nextPage = (page: { page: number; total_pages: number }): number | undefined =>
  page.page < page.total_pages ? page.page + 1 : undefined;

/** Reads the complete Task Inbox projection directly from paginated backend resources. */
export const useTaskResources = (projectId: string | null) => {
  const analysesQuery = useInfiniteQuery(projectAnalysesQueryOptions(projectId));

  const importsQuery = useInfiniteQuery({
    queryKey: queryKeys.userFileImports,
    queryFn: async ({ pageParam }): Promise<UserFileImportPage> => {
      const { data } = await listUserFileImports({
        query: { page: pageParam, page_size: IMPORT_PAGE_SIZE },
        throwOnError: true,
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
  const {
    fetchNextPage: fetchNextAnalysisPage,
    hasNextPage: hasNextAnalysisPage,
    isFetchingNextPage: isFetchingNextAnalysisPage,
  } = analysesQuery;
  const {
    fetchNextPage: fetchNextImportPage,
    hasNextPage: hasNextImportPage,
    isFetchingNextPage: isFetchingNextImportPage,
  } = importsQuery;

  useEffect(() => {
    if (hasNextAnalysisPage && !isFetchingNextAnalysisPage) {
      void fetchNextAnalysisPage();
    }
  }, [fetchNextAnalysisPage, hasNextAnalysisPage, isFetchingNextAnalysisPage]);

  useEffect(() => {
    if (hasNextImportPage && !isFetchingNextImportPage) {
      void fetchNextImportPage();
    }
  }, [fetchNextImportPage, hasNextImportPage, isFetchingNextImportPage]);

  const analyses = projectId
    ? (analysesQuery.data?.pages.flatMap((page) => page.items) ?? []).map((analysis) =>
        analysisToTask(analysis, projectId),
      )
    : [];
  const imports = (importsQuery.data?.pages.flatMap((page) => page.items) ?? []).map(importToTask);
  const error = analysesQuery.error ?? importsQuery.error;

  return {
    tasks: sortTasks([...analyses, ...imports]),
    error: error?.message ?? null,
  } as const;
};

export interface ProjectTaskInboxState extends ProjectTaskStreamClientState {
  tasks: TaskItem[];
  stopUserFileImport: (importId: string) => void;
  clearUserFileImport: (importId: string) => void;
  clearUnavailableAnalysis: (projectId: string, tabId: string) => void;
  stoppingImportId: string | null;
  clearingImportId: string | null;
  clearingAnalysisTabId: string | null;
}

const replaceImportInPages = (
  previous: InfiniteData<UserFileImportPage> | undefined,
  resource: UserFileImport,
): InfiniteData<UserFileImportPage> | undefined =>
  previous
    ? {
        ...previous,
        pages: previous.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === resource.id ? resource : item)),
        })),
      }
    : previous;

/** Connects backend events to the same Query resources projected by the Task Inbox. */
export const useProjectTaskInbox = (projectId: string | null): ProjectTaskInboxState => {
  const queryClient = useQueryClient();
  const { tasks, error: resourceError } = useTaskResources(projectId);

  const cancelImportMutation = useMutation({
    mutationFn: async (importId: string) => {
      const { data } = await cancelUserFileImport({
        path: { import_id: importId },
        throwOnError: true,
      });
      return data;
    },
    onSuccess: (resource) => {
      queryClient.setQueryData(queryKeys.userFileImport(resource.id), resource);
      queryClient.setQueryData<InfiniteData<UserFileImportPage>>(
        queryKeys.userFileImports,
        (previous) => replaceImportInPages(previous, resource),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.userFileImports });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not stop the file import.');
    },
  });

  const deleteImportMutation = useMutation({
    mutationFn: async (importId: string) => {
      await deleteUserFileImport({
        path: { import_id: importId },
        throwOnError: true,
      });
      return importId;
    },
    onSuccess: (importId) => {
      queryClient.removeQueries({ queryKey: queryKeys.userFileImport(importId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userFileImports });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not clear the file import.');
    },
  });

  const clearAnalysisMutation = useMutation({
    mutationFn: async ({ projectId, tabId }: { projectId: string; tabId: string }) => {
      await clearTabAnalysis({
        path: { workspace_id: projectId, tab_id: tabId },
        throwOnError: true,
      });
      return { projectId, tabId };
    },
    onSuccess: ({ projectId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAnalyses(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTabs(projectId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not clear the analysis.');
    },
  });

  const refreshResource = useCallback(
    async (event: Extract<BackendEvent, { type: 'resource_changed' | 'resource_progress' }>) => {
      if (event.resource_type === 'analysis') {
        if (!projectId || event.workspace_id !== projectId) return;
        try {
          const { data } = await getAnalysis({
            path: { workspace_id: projectId, analysis_id: event.resource_id },
            throwOnError: true,
          });
          queryClient.setQueryData(queryKeys.analysis(projectId, event.resource_id), data);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.projectAnalyses(projectId),
          });
          if (data.state === 'succeeded') {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.analysisResults(projectId, event.resource_id),
            });
            if (data.request.kind === 'annotation_run_all') {
              invalidateNodeProjectQueries(
                queryClient,
                projectId,
                data.request.source.node_id,
                {
                  includeData: true,
                },
              );
            }
            if (createsProjectDataBlocks(data.request.kind)) {
              useFreshNodesStore.getState().markCreated(projectId, data.output_node_ids);
            }
          }
        } catch (error) {
          console.warn('Could not refresh analysis activity', error);
        }
        return;
      }

      if (event.resource_type === 'user_file_import') {
        try {
          const { data } = await getUserFileImport({
            path: { import_id: event.resource_id },
            throwOnError: true,
          });
          queryClient.setQueryData(queryKeys.userFileImport(event.resource_id), data);
          void queryClient.invalidateQueries({ queryKey: queryKeys.userFileImports });
          if (data.availability !== 'unavailable' && data.state === 'succeeded') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.fileList, exact: true });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.sampleCollections,
              exact: true,
            });
          }
        } catch (error) {
          console.warn('Could not refresh user-file import activity', error);
        }
      }
    },
    [queryClient, projectId],
  );

  const removeResource = useCallback(
    (event: Extract<BackendEvent, { type: 'resource_removed' }>) => {
      if (event.resource_type === 'analysis') {
        if (!projectId || (event.workspace_id && event.workspace_id !== projectId)) return;
        queryClient.removeQueries({
          queryKey: queryKeys.analysisSession(projectId, event.resource_id),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.projectAnalyses(projectId) });
      } else if (event.resource_type === 'user_file_import') {
        queryClient.removeQueries({ queryKey: queryKeys.userFileImport(event.resource_id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.userFileImports });
      }
    },
    [queryClient, projectId],
  );

  const handleEvent = useCallback(
    (event: BackendEvent) => {
      switch (event.type) {
        case 'stream_ready':
        case 'resync_required':
          void queryClient.invalidateQueries({ queryKey: queryKeys.userFileImports });
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectList, exact: true });
          if (projectId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.projectAnalyses(projectId),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectTabs(projectId) });
          }
          break;
        case 'resource_changed':
        case 'resource_progress':
          void refreshResource(event);
          if (event.resource_type === 'tab' && projectId && event.workspace_id === projectId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectTabs(projectId) });
          }
          if (event.resource_type === 'project') {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.projectList,
              exact: true,
            });
            if (projectId && event.workspace_id === projectId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.projectGraph(projectId),
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.projectTabs(projectId),
              });
            }
          }
          break;
        case 'resource_removed':
          removeResource(event);
          if (event.resource_type === 'tab' && projectId && event.workspace_id === projectId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectTabs(projectId) });
          }
          if (event.resource_type === 'project') {
            queryClient.setQueryData<ProjectCatalogueItem[]>(
              queryKeys.projectList,
              (previous) => previous?.filter((project) => project.id !== event.workspace_id),
            );
          }
          break;
        case 'project_runtime_changed':
          queryClient.setQueryData<ProjectCatalogueItem[]>(queryKeys.projectList, (previous) =>
            previous?.map((project) =>
              project.availability === 'available' && project.id === event.workspace_id
                ? { ...project, runtime_state: event.runtime_state }
                : project,
            ),
          );
          if (event.workspace_id === projectId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectGraph(projectId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectTabs(projectId) });
          }
          break;
      }
    },
    [queryClient, refreshResource, removeResource, projectId],
  );

  const clientState = useProjectTaskStreamClient({ enabled: true, onEvent: handleEvent });
  const lifecycleState = {
    stopUserFileImport: (importId: string) => {
      cancelImportMutation.mutate(importId);
    },
    clearUserFileImport: (importId: string) => {
      deleteImportMutation.mutate(importId);
    },
    clearUnavailableAnalysis: (projectId: string, tabId: string) => {
      clearAnalysisMutation.mutate({ projectId, tabId });
    },
    stoppingImportId: cancelImportMutation.isPending ? cancelImportMutation.variables : null,
    clearingImportId: deleteImportMutation.isPending ? deleteImportMutation.variables : null,
    clearingAnalysisTabId: clearAnalysisMutation.isPending
      ? clearAnalysisMutation.variables.tabId
      : null,
  };
  return resourceError
    ? { ...clientState, ...lifecycleState, tasks, status: 'error', error: resourceError }
    : { ...clientState, ...lifecycleState, tasks };
};
