import { type QueryClient, useMutation } from '@tanstack/react-query';
import { submitTabAnalysis } from '@/api';
import type {
  ConcordanceRunAllAnalysisRequest,
  ConcordanceDocumentDataBlockCreationAnalysisRequest,
  ConcordanceMatchDataBlockCreationAnalysisRequest,
  QuotationResultDataBlockCreationAnalysisRequest,
  QuotationRunAllAnalysisRequest,
  SequentialDataBlockCreationAnalysisRequest,
  TopicModelingDataBlockCreationAnalysisRequest,
} from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateProjectGraphQuery } from './projectMutationCache';

interface ProjectAnalysisMutationsParams {
  currentProjectId: string | null;
  queryClient: QueryClient;
}

type DataBlockCreationRequest =
  | ({
      kind: 'concordance_match_data_block_creation';
    } & ConcordanceMatchDataBlockCreationAnalysisRequest)
  | ({
      kind: 'concordance_document_data_block_creation';
    } & ConcordanceDocumentDataBlockCreationAnalysisRequest)
  | ({
      kind: 'quotation_result_data_block_creation';
    } & QuotationResultDataBlockCreationAnalysisRequest)
  | ({
      kind: 'sequential_data_block_creation';
    } & SequentialDataBlockCreationAnalysisRequest);

/** Owns supporting and Run All Analysis commands exposed by Project actions. */
export const useProjectAnalysisMutations = ({
  currentProjectId,
  queryClient,
}: ProjectAnalysisMutationsParams) => {
  const ensureProjectSelected = () => {
    if (!currentProjectId) throw new Error('No project selected');
    return currentProjectId;
  };
  const runConcordanceAllMutation = useMutation({
    mutationKey: ['project', 'concordance-run-all'],
    mutationFn: ({
      projectId,
      tabId,
      request,
      supersedesAnalysisIds,
    }: {
      projectId: string;
      tabId: string;
      request: Omit<ConcordanceRunAllAnalysisRequest, 'kind'>;
      supersedesAnalysisIds: string[];
    }) =>
      submitTabAnalysis({
        body: {
          execution_scope: 'run_all',
          request: { kind: 'concordance_run_all', ...request },
          supersedes_analysis_ids: supersedesAnalysisIds,
        },
        path: { workspace_id: projectId, tab_id: tabId },
        throwOnError: true,
      }).then(({ data }) => data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAnalyses(variables.projectId),
      });
    },
  });
  const runQuotationAllMutation = useMutation({
    mutationKey: ['project', 'quotation-run-all'],
    mutationFn: ({
      projectId,
      tabId,
      request,
      supersedesAnalysisIds,
    }: {
      projectId: string;
      tabId: string;
      request: Omit<QuotationRunAllAnalysisRequest, 'kind'>;
      supersedesAnalysisIds: string[];
    }) =>
      submitTabAnalysis({
        body: {
          execution_scope: 'run_all',
          request: { kind: 'quotation_run_all', ...request },
          supersedes_analysis_ids: supersedesAnalysisIds,
        },
        path: { workspace_id: projectId, tab_id: tabId },
        throwOnError: true,
      }).then(({ data }) => data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAnalyses(variables.projectId),
      });
    },
  });
  const createTopicModelingDataBlocksMutation = useMutation({
    mutationKey: ['project', 'create-topic-modeling-data-blocks'],
    mutationFn: ({
      projectId,
      tabId,
      analysisId,
      request,
    }: {
      projectId: string;
      tabId: string;
      analysisId: string;
      request: Omit<TopicModelingDataBlockCreationAnalysisRequest, 'kind'>;
    }) =>
      submitTabAnalysis({
        body: {
          execution_scope: 'supporting',
          parent_analysis_id: analysisId,
          request: { kind: 'topic_modeling_data_block_creation', ...request },
        },
        path: { workspace_id: projectId, tab_id: tabId },
        throwOnError: true,
      }).then(({ data }) => data),
    onSuccess: (_data, variables) => {
      invalidateProjectGraphQuery(queryClient, variables.projectId);
    },
  });
  const createResultDataBlocksMutation = useMutation({
    mutationKey: ['project', 'create-result-data-blocks'],
    mutationFn: ({
      projectId,
      tabId,
      analysisId,
      request,
    }: {
      projectId: string;
      tabId: string;
      analysisId: string;
      request: DataBlockCreationRequest;
    }) =>
      submitTabAnalysis({
        body: {
          execution_scope: 'supporting',
          parent_analysis_id: analysisId,
          request,
        },
        path: { workspace_id: projectId, tab_id: tabId },
        throwOnError: true,
      }).then(({ data }) => data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projectAnalyses(variables.projectId),
      });
    },
  });

  return {
    actions: {
      runConcordanceAll: (
        tabId: string,
        request: Omit<ConcordanceRunAllAnalysisRequest, 'kind'>,
        supersedesAnalysisIds: string[] = [],
      ) =>
        runConcordanceAllMutation.mutateAsync({
          projectId: ensureProjectSelected(),
          tabId,
          request,
          supersedesAnalysisIds,
        }),
      runQuotationAll: (
        tabId: string,
        request: Omit<QuotationRunAllAnalysisRequest, 'kind'>,
        supersedesAnalysisIds: string[] = [],
      ) =>
        runQuotationAllMutation.mutateAsync({
          projectId: ensureProjectSelected(),
          tabId,
          request,
          supersedesAnalysisIds,
        }),
      createTopicModelingDataBlocks: (
        tabId: string,
        analysisId: string,
        request: Omit<TopicModelingDataBlockCreationAnalysisRequest, 'kind'>,
      ) =>
        createTopicModelingDataBlocksMutation.mutateAsync({
          projectId: ensureProjectSelected(),
          tabId,
          analysisId,
          request,
        }),
      createResultDataBlocks: (
        tabId: string,
        analysisId: string,
        request: DataBlockCreationRequest,
      ) =>
        createResultDataBlocksMutation.mutateAsync({
          projectId: ensureProjectSelected(),
          tabId,
          analysisId,
          request,
        }),
    },
  } as const;
};
