import { AnalysisSplitLayout } from '@/features/views/common/components/AnalysisSplitLayout';
import {
  readStopWordsEnabled,
  STOP_WORDS_ENABLED_SETTINGS,
} from '@/features/views/common/utils/stopWordsToggle';
import { useStopWordListSources } from '@/features/views/common/hooks/useStopWordListSources';
import { useQueries } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { TopicModelingResponse, TopicModelingResultQuery, TopicModelingTopic } from '@/api';
import { CONTEXTUAL_HINT_IDS } from '@/features/guidance/registry';
import { useProgressiveContextualHints } from '@/features/guidance/useProgressiveContextualHints';
import type { AnalysisTabFeatureProps } from '@/features/views/common/tabs/AnalysisTabsHost';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { isArrowStringField } from '@/lib/arrow/arrowTable';
import { hasClearRequiredAnalysis } from '../common/analysisActionLifecycle';
import { getAnalysisResultResource } from '../common/analysisApi';
import { ANALYSIS_TASK_TYPES } from '../common/analysisIds';
import { type AnalysisRequestOfKind, useAnalysisFeature } from '../common/hooks/useAnalysisFeature';
import { useNodeColorControls } from '../common/hooks/useNodeColorControls';
import { usePersistNodeDocumentColumn } from '../common/hooks/usePersistNodeDocumentColumn';
import { useTabNodeInputs } from '../common/nodeInputs';
import { hasParameterDiff } from '../common/parameterComparison';
import { getRerunActionState } from '../common/rerunActionState';
import { DEFAULT_TAB_INPUT_SET_ID } from '../common/tabs/tabStateOps';
import { TopicModelingParameterPanel } from './components/panels/TopicModelingParameterPanel';
import { TopicModelingResultsPanel } from './components/panels/TopicModelingResultsPanel';
import {
  TopicModelingAddToWorkspaceDialog,
  type TopicModelingAddToWorkspaceSelection,
  type TopicModelingDetachRowUnit,
  type TopicModelingAddToWorkspaceSource,
} from './components/TopicModelingAddToWorkspaceDialog';
import {
  DEFAULT_MAX_SEGMENT_TOKENS,
  DEFAULT_MIN_CLUSTER_SIZE,
  normalizeTopicSampleFractions,
  useTopicModelingParameters,
} from './hooks/useTopicModelingParameters';
import { useTopicModelingResultControls } from './hooks/useTopicModelingResultControls';
import { useTopicColorGroups } from './hooks/useTopicColorGroups';
import { useTopicModelingTaskFlow } from './hooks/useTopicModelingTaskFlow';
import {
  CHARACTERS_PER_TOKEN,
  segmentEstimateQuery,
  suggestedTopicSampleSize,
} from './topicSampling';
import {
  nextTopicProjectionAttempt,
  type TopicProjectionAttempt,
  useTopicProjectionLifecycle,
} from './hooks/useTopicProjectionLifecycle';
import {
  filterTopicRepresentativeWords,
  sliceTopicRepresentativeWords,
} from './topicModelingAdapters';
import { toastError } from '@/lib/toastError';
import { isUngrouped, ungroupedTopic } from './ungrouped';
import { TopicNamesContext } from './components/results/topicNamesContext';
import { topicGroupKey, withTopicName } from './topicNames';

/**
 * Renders the native topic-modelling workflow and Result exploration.
 * Rendered by: the viewComponents tabbed loader, which mounts one instance per analysis tab and feeds it tab props.
 * Flow: read workspace/tab state, derive inputs and analysis parameters, wire hydration/run/clear callbacks, then render controls and results.
 *
 * The required host supplies normalized task/input state and closure-bound
 * persistence commands for the active tab; this feature has no standalone or
 * optional-tab compatibility path.
 */
function TopicModelingFeature({ host }: AnalysisTabFeatureProps) {
  const {
    latestRunAll,
    activeAnalysis,
    analyses,
    refreshAnalyses,
    inputSets: tabInputSets,
    setInputSet: onTabInputSetChange,
  } = host;
  const tabTaskId = latestRunAll?.id ?? null;
  const { currentWorkspaceId } = useWorkspaceData();
  const stopWordListSources = useStopWordListSources(currentWorkspaceId, host.tabId);
  const { setNodeColor: persistNodeColor, createTopicModelingDataBlocks } = useWorkspaceActions();
  const nodeInputs = useTabNodeInputs({
    tabInputSets,
    onTabInputSetChange,
    constraints: {
      fieldPredicate: isArrowStringField,
      maxNodes: 2,
      docTypeOnly: true,
    },
  });
  const nodeColumnSelections = nodeInputs.nodeColumnSelections;
  const setNodeColumnSelection = nodeInputs.setColumn;
  const panelSelectedNodes = nodeInputs.selectedNodes;
  const panelNodeIds = panelSelectedNodes
    .slice(0, 2)
    .map((node) => node.id)
    .filter((id): id is string => Boolean(id));
  const persistDocumentColumn = usePersistNodeDocumentColumn({
    workspaceId: currentWorkspaceId,
  });

  const [error, setError] = useState<string | null>(null);
  const {
    corpusSamples,
    updateCorpusSample,
    minClusterSize,
    setMinClusterSize,
    maxClusterSize,
    setMaxClusterSize,
    randomSeed,
    randomSeedUserSet,
    setRandomSeedFromUser,
    segmentationMethod,
    setSegmentationMethod,
    maxSegmentTokens,
    setMaxSegmentTokens,
    clusterSample,
    setClusterSample,
    clusterSampleSize,
    setClusterSampleSize,
    nodeDocCounts,
    sampleFractionsForRequest,
    hasAnySampling,
    hydrateParameters,
  } = useTopicModelingParameters({
    panelNodeIds,
    nodeInfoById: nodeInputs.nodeInfoById,
  });
  const restoredProjectionSelection =
    host.topicModelingProjectionSelection?.analysis_id === tabTaskId
      ? host.topicModelingProjectionSelection
      : null;
  const [projectionRequest, setProjectionRequest] = useState<TopicProjectionAttempt | null>(null);
  const currentProjectionRequest =
    projectionRequest?.analysisId === tabTaskId ? projectionRequest : null;
  const committedClusterCount =
    currentProjectionRequest?.clusterCount ?? restoredProjectionSelection?.cluster_count ?? null;
  const committedTopNTopics =
    currentProjectionRequest?.topNTopics ?? restoredProjectionSelection?.top_n_topics ?? null;
  const resultRequestKey = currentProjectionRequest?.requestKey ?? 0;
  const resultQuery: TopicModelingResultQuery = {
    kind: 'topic_modeling',
    cluster_count: committedClusterCount,
    top_n_topics: committedTopNTopics,
  };
  const {
    selectedTopicIds,
    topicSearchQuery,
    setTopicSearchQuery,
    handleToggleTopicSelection,
    handleClearTopicSelection,
  } = useTopicModelingResultControls();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [readyGraphProjectionKey, setReadyGraphProjectionKey] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [addToWorkspaceDialogOpen, setAddToWorkspaceDialogOpen] = useState(false);
  const [isAddingToWorkspace, setIsAddingToWorkspace] = useState(false);

  const {
    request: serverRequest,
    isRunning,
    isStopping,
    runAnalysis,
    taskStatus,
    clearResults,
    stopTask,
    banner: topicWaitingBanner,
    analysisFailure,
    result,
    isResultFetching,
    isResultPlaceholderData,
    resultError,
  } = useAnalysisFeature<TopicModelingResponse, AnalysisRequestOfKind<'topic_modeling'>>({
    taskType: ANALYSIS_TASK_TYPES.topicModeling,
    workspaceId: currentWorkspaceId,
    tabId: host.tabId,
    // The forest's newest Run All Analysis wins hydration over transient
    // submission state.
    hydrationTaskId: tabTaskId,
    controlAnalysisId: activeAnalysis?.id ?? null,
    tabAnalysisIds: analyses.map((analysis) => analysis.id),
    // Called by useAnalysisFeature polling and hydration to load the owned task result.
    resultQuery,
    resultRequestKey,
    resultCacheMode: 'no-store',
    fetchResult: async (taskId, query, signal) => {
      if (!currentWorkspaceId) throw new Error('No Project selected');
      return getAnalysisResultResource<TopicModelingResponse>(
        currentWorkspaceId,
        taskId,
        query,
        signal,
      );
    },
    // Called by useAnalysisFeature hydration to restore parameters from the stored request envelope.
    onRequest: (request) => {
      onTabInputSetChange(
        DEFAULT_TAB_INPUT_SET_ID,
        request.node_ids.slice(0, 2).map((nodeId) => ({
          node_id: nodeId,
          column: request.node_columns[nodeId] ?? '',
        })),
      );
      hydrateParameters(request);
    },
    // Called by useAnalysisFeature after shared result deletion completes.
    onCleared: () => {
      setError(null);
      // Refresh the canonical forest; curated inputs remain in the Tab draft.
      refreshAnalyses();
    },
  });
  /**
   * Clears live topic results and result-view controls while preserving explicitly tuned parameters.
   * Used by: TopicModelingParameterPanel's Clear action.
   */
  const handleClear = async () => {
    setIsClearing(true);
    await clearResults();
    handleClearTopicSelection();
    setTopicSearchQuery('');
    setIsClearing(false);
  };

  const topicRunningTask = taskStatus.runningTask;

  // Per-source bubble-chart colours come from persisted node metadata, with
  // palette defaults written before a run when a selected node has no colour yet.
  const topicActiveNodeIds = panelNodeIds.slice(0, 2);
  const { defaultPalette, nodeColors, setNodeColor, ensureNodeColors } = useNodeColorControls({
    nodeIds: topicActiveNodeIds,
    nodes: panelSelectedNodes,
    persistNodeColor,
  });

  const panelHasMissingColumns = panelNodeIds.some((nodeId) => {
    const selection = nodeColumnSelections.find((sel) => sel.nodeId === nodeId);
    return !selection?.column;
  });

  // Topic sampling (issue 330) is off by default; the estimate feeds its
  // suggestion note and the grey Segments to sample suggestion.
  const segmentEstimates = useQueries({
    queries: panelNodeIds.map((nodeId) =>
      segmentEstimateQuery(
        currentWorkspaceId ?? '',
        nodeId,
        nodeColumnSelections.find((selection) => selection.nodeId === nodeId)?.column ?? '',
        segmentationMethod,
        maxSegmentTokens,
      ),
    ),
  });
  const segmentEstimateValues = segmentEstimates.map((estimate) => estimate.data);
  const estimatedSegmentCount = segmentEstimateValues.every(
    (value): value is { segments: number; characters: number } => value !== undefined,
  )
    ? Math.round(
        segmentEstimateValues.reduce(
          (sum, value, index) => sum + value.segments * (sampleFractionsForRequest[index] ?? 1),
          0,
        ),
      )
    : null;
  // Embedding time follows the number of tokens, so the first-run note uses it.
  const estimatedTokenCount =
    estimatedSegmentCount === null
      ? null
      : Math.round(
          segmentEstimateValues.reduce(
            (sum, value, index) =>
              sum + (value?.characters ?? 0) * (sampleFractionsForRequest[index] ?? 1),
            0,
          ) / CHARACTERS_PER_TOKEN,
        );
  const suggestedSampleSize = suggestedTopicSampleSize(estimatedSegmentCount);
  // An empty Segments to sample field runs with the grey suggestion.
  const clusterSampleSizeForRequest = clusterSample
    ? (clusterSampleSize ?? suggestedSampleSize)
    : null;

  const currentTopicParams = {
    node_ids: panelNodeIds,
    node_columns: Object.fromEntries(
      nodeColumnSelections
        .filter((selection) => panelNodeIds.includes(selection.nodeId) && selection.column)
        .map((selection) => [selection.nodeId, selection.column]),
    ),
    min_cluster_size: minClusterSize,
    max_cluster_size: maxClusterSize,
    random_seed: randomSeed,
    sample_fractions: sampleFractionsForRequest,
    segmentation_method: segmentationMethod,
    max_segment_tokens: maxSegmentTokens,
    cluster_sample_size: clusterSampleSizeForRequest,
  };
  const serverTopicParams = (request: AnalysisRequestOfKind<'topic_modeling'>) => ({
    node_ids: request.node_ids,
    node_columns: request.node_columns,
    min_cluster_size: request.min_cluster_size ?? DEFAULT_MIN_CLUSTER_SIZE,
    max_cluster_size: request.max_cluster_size ?? null,
    random_seed: request.random_seed ?? 0,
    sample_fractions: normalizeTopicSampleFractions(
      request.sample_fractions,
      request.node_ids.length,
    ),
    segmentation_method:
      request.segmentation_method === 'line' || request.segmentation_method === 'sentence'
        ? request.segmentation_method
        : 'automatic',
    max_segment_tokens: request.max_segment_tokens ?? DEFAULT_MAX_SEGMENT_TOKENS,
    cluster_sample_size: request.cluster_sample_size ?? null,
  });
  const hasTopicChanges = !serverRequest
    ? true
    : hasParameterDiff(currentTopicParams, serverTopicParams(serverRequest));

  // A fixed Max topic size must leave room above Min topic size.
  const maxTopicSizeInvalid = maxClusterSize !== null && maxClusterSize <= minClusterSize;
  const parametersLocked = isRunning || Boolean(activeAnalysis);
  const requiresClear = hasClearRequiredAnalysis(analyses);
  const actionState = getRerunActionState({
    hasWorkspace: Boolean(currentWorkspaceId),
    isRunnable: panelNodeIds.length > 0 && !panelHasMissingColumns && !maxTopicSizeInvalid,
    hasAttachedAnalysis: Boolean(tabTaskId),
    hasAnyAnalysis: analyses.length > 0,
    analysisState: taskStatus.tasks[0]?.state ?? null,
    hasChanges: hasTopicChanges,
    requiresClear,
    isBusy: parametersLocked,
  });

  /**
   * Updates a selected node's text column and persists it as that node's document-column preference.
   * Used by: TopicModelingParameterPanel's NodeInputsPanel column-change prop.
   */
  const handleColumnChange = (nodeId: string, column: string) => {
    setNodeColumnSelection(nodeId, column);
    void persistDocumentColumn(nodeId, column);
  };

  const resultKey = tabTaskId ?? (result ? '__hydrated__' : null);
  const stopWordsEnabled =
    resultKey !== null &&
    readStopWordsEnabled(host.settings, STOP_WORDS_ENABLED_SETTINGS.topicModeling);
  const resultSources = result?.sources ?? [];
  const resultNodeIds =
    resultSources.length > 0
      ? resultSources.map((source) => source.node_id)
      : (serverRequest?.node_ids ?? panelNodeIds);
  const resultNodeNames =
    resultSources.length > 0
      ? resultSources.map((source) => source.node_name)
      : panelSelectedNodes.map((node) => node.name);
  const resultRandomSeed = serverRequest?.random_seed ?? randomSeed;
  const firstResultNodeId = resultNodeIds[0] ?? null;
  const firstResultColumn = firstResultNodeId
    ? (serverRequest?.node_columns[firstResultNodeId] ??
      resultSources.find((source) => source.node_id === firstResultNodeId)?.text_column ??
      null)
    : null;
  const representativeWordsCount = host.topicModelingWordsPerTopic ?? 15;
  // Names given to Topics of this run, per group of
  // natural Topics, saved with the tab.
  const savedTopicNames = host.topicModelingTopicNames;
  const topicNames =
    tabTaskId && savedTopicNames?.analysis_id === tabTaskId ? (savedTopicNames.names ?? {}) : {};
  const topicNamesById = (shown: TopicModelingTopic[]) =>
    shown.flatMap((topic) => {
      const key = topicGroupKey(topic);
      const name = key === null ? undefined : topicNames[key];
      return name ? [{ topic_id: topic.id, name }] : [];
    });
  const topicNamesValue = {
    names: topicNames,
    rename: tabTaskId
      ? (key: string, name: string) =>
          host.setPresentationSettings({
            topicNames: { analysis_id: tabTaskId, names: withTopicName(topicNames, key, name) },
          })
      : null,
  };
  // Ungrouped joins the Topics as a grey bubble and a list entry (issue 362).
  const ungrouped = ungroupedTopic(result?.data);
  const rawTopics: TopicModelingTopic[] = [
    ...(result?.data.topics ?? []),
    ...(ungrouped ? [ungrouped] : []),
  ];
  const effectiveStopWords = stopWordsEnabled
    ? new Set(host.stopWords.map((word) => word.toLocaleLowerCase()))
    : new Set<string>();
  const exportTopics = filterTopicRepresentativeWords(rawTopics, effectiveStopWords);
  const topics = sliceTopicRepresentativeWords(exportTopics, representativeWordsCount);
  const addToWorkspaceSources: TopicModelingAddToWorkspaceSource[] = resultSources.map((node) => ({
    id: node.node_id,
    name: node.node_name,
    columns: node.original_columns,
    documentColumn: node.text_column,
  }));

  const openAddToWorkspaceDialog = () => {
    setAddToWorkspaceDialogOpen(true);
  };

  const handleAddToWorkspace = async (
    selections: TopicModelingAddToWorkspaceSelection[],
    rowUnit: TopicModelingDetachRowUnit,
  ) => {
    if (!tabTaskId || selections.length === 0) return;
    const nodeIds = selections.map((selection) => selection.sourceId);
    setIsAddingToWorkspace(true);
    try {
      await createTopicModelingDataBlocks(host.tabId, tabTaskId, {
        node_ids: nodeIds,
        selected_columns: Object.fromEntries(
          selections.map((selection) => [selection.sourceId, selection.selectedColumns]),
        ),
        new_node_names: Object.fromEntries(
          selections.map((selection) => [selection.sourceId, selection.newName]),
        ),
        topic_ids: selectedTopicIds.size > 0 ? [...selectedTopicIds] : null,
        cluster_count: result?.clustering.cluster_count ?? 0,
        top_n_topics: result?.topic_inclusion.top_n_topics ?? 0,
        row_unit: rowUnit,
        // Names given to the Topics shown, by their number at this count.
        topic_names_override: topicNamesById(exportTopics),
        topic_meanings_override: exportTopics
          .filter((topic) => !isUngrouped(topic.id))
          .map((topic) => ({
            topic_id: topic.id,
            words: topic.representative_words.map((term) => term.word),
          })),
      });
      setAddToWorkspaceDialogOpen(false);
      toast.success('Adding Topic Modelling results to the Project.');
    } catch (cause) {
      toastError(cause, 'Try again.', { title: "Couldn't add Topic Modelling results." });
    } finally {
      setIsAddingToWorkspace(false);
    }
  };

  const { handleRun } = useTopicModelingTaskFlow({
    state: {
      currentWorkspaceId,
      tabId: host.tabId,
      panelNodeIds,
      panelHasMissingColumns,
      effectiveNodeColumnSelections: nodeColumnSelections,
      minClusterSize,
      maxClusterSize,
      randomSeed,
      sampleFractions: hasAnySampling ? sampleFractionsForRequest : null,
      segmentationMethod,
      maxSegmentTokens,
      clusterSampleSize: clusterSampleSizeForRequest,
    },
    actions: {
      runAnalysis,
      setError,
      prepareBeforeRun: ensureNodeColors,
    },
  });

  const startProjection = (clusterCount: number, topNTopics: number) => {
    if (clusterCount !== result?.clustering.cluster_count) {
      setReadyGraphProjectionKey(null);
    }
    setProjectionRequest((current) =>
      nextTopicProjectionAttempt(
        current,
        tabTaskId,
        clusterCount,
        topNTopics,
        result?.clustering.cluster_count ?? null,
        result?.topic_inclusion.top_n_topics ?? null,
      ),
    );
  };
  const graphProjectionKey = `${tabTaskId ?? 'no-analysis'}:result:${String(result?.clustering.cluster_count ?? 'none')}`;
  const { projectionPending, projectionError, controlResetKey } = useTopicProjectionLifecycle({
    analysisId: tabTaskId,
    attempt: currentProjectionRequest,
    clustering: result?.clustering ?? null,
    topicInclusion: result?.topic_inclusion ?? null,
    isFetching: isResultFetching,
    isPlaceholderData: isResultPlaceholderData,
    resultError,
    isViewReady:
      currentProjectionRequest?.layoutChanged !== true ||
      readyGraphProjectionKey === graphProjectionKey,
    onProjectionApplied: (layoutChanged) => {
      if (!layoutChanged) return;
      handleClearTopicSelection();
      setAddToWorkspaceDialogOpen(false);
    },
    persistSelection: (selection) =>
      host.setPresentationSettings({ projectionSelection: selection }),
    onPersistenceError: (cause) => {
      toastError(cause, 'Try again.', {
        title: 'Topics updated, but these projection settings were not remembered.',
      });
    },
  });

  const colorNodeIds = result ? resultNodeIds : panelNodeIds;
  // "Colour by" is a view choice for one Analysis; a new run starts uncoloured.
  const [colorBySelection, setColorBySelection] = useState<{
    analysisId: string | null;
    column: string | null;
  }>({ analysisId: null, column: null });
  const colorBy = useTopicColorGroups({
    workspaceId: currentWorkspaceId,
    analysisId: tabTaskId,
    singleCorpus: resultSources.length === 1,
    clusterCount: result?.clustering.cluster_count ?? null,
    topNTopics: result?.topic_inclusion.top_n_topics ?? null,
    column: colorBySelection.analysisId === tabTaskId ? colorBySelection.column : null,
  });

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- this is a truthiness OR: a falsy banner/result/error must fall through to the next, so ?? would short-circuit incorrectly
  const shouldShowResultsPanel = Boolean(topicWaitingBanner || result || error);

  useProgressiveContextualHints([
    CONTEXTUAL_HINT_IDS.topicModeling.inputs,
    ...(!actionState.runDisabled ? [CONTEXTUAL_HINT_IDS.topicModeling.run] : []),
    ...(result
      ? [
          CONTEXTUAL_HINT_IDS.topicModeling.results,
          CONTEXTUAL_HINT_IDS.topicModeling.addToWorkspace,
        ]
      : []),
  ]);

  return (
    <AnalysisSplitLayout
      viewId="topic-modeling"
      parameters={
        <TopicModelingParameterPanel
          nodeInputs={nodeInputs}
          onColumnChange={handleColumnChange}
          actionState={actionState}
          parametersLocked={parametersLocked}
          corpusSamples={corpusSamples}
          nodeDocCounts={nodeDocCounts}
          onCorpusSampleChange={updateCorpusSample}
          minClusterSize={minClusterSize}
          onMinClusterSizeChange={setMinClusterSize}
          maxClusterSize={maxClusterSize}
          onMaxClusterSizeChange={setMaxClusterSize}
          lastRunClustering={
            result
              ? {
                  segmentCount: result.segment_count,
                  appliedMaxTopicSize: result.clustering.max_topic_size ?? null,
                  requestedMaxTopicSize: serverRequest?.max_cluster_size ?? null,
                  clusteredSegments: result.clustering.clustered_segments ?? null,
                  autoDecision: result.clustering.auto_decision ?? null,
                  autoDocumentShare: result.clustering.auto_document_share ?? null,
                  largestTopicSize: result.clustering.largest_topic_size ?? null,
                  randomSeed: resultRandomSeed,
                }
              : null
          }
          clusterSample={clusterSample}
          onClusterSampleChange={setClusterSample}
          clusterSampleSize={clusterSampleSize}
          onClusterSampleSizeChange={setClusterSampleSize}
          suggestedSampleSize={suggestedSampleSize}
          estimatedSegmentCount={estimatedSegmentCount}
          estimatedTokenCount={estimatedTokenCount}
          randomSeed={randomSeed}
          randomSeedUserSet={randomSeedUserSet}
          onRandomSeedChange={setRandomSeedFromUser}
          segmentationMethod={segmentationMethod}
          onSegmentationMethodChange={setSegmentationMethod}
          maxSegmentTokens={maxSegmentTokens}
          onMaxSegmentTokensChange={setMaxSegmentTokens}
          isRunning={isRunning}
          isStopping={isStopping}
          isClearing={isClearing}
          onRun={handleRun}
          onStop={
            activeAnalysis
              ? () => {
                  void stopTask();
                }
              : undefined
          }
          onClear={handleClear}
          hasMissingColumns={panelHasMissingColumns}
          nodeColors={nodeColors}
          onNodeColorChange={(nodeId, color) => {
            setNodeColor(nodeId, color);
          }}
          defaultPalette={defaultPalette}
        />
      }
    >
      {shouldShowResultsPanel && (
        <TopicNamesContext.Provider value={topicNamesValue}>
          <TopicModelingResultsPanel
            topicWaitingBanner={topicWaitingBanner}
            runningTask={topicRunningTask}
            error={error ?? analysisFailure}
            result={result}
            analysisId={tabTaskId}
            topics={topics}
            exportTopics={exportTopics}
            sampleFractions={serverRequest?.sample_fractions ?? null}
            containerRef={containerRef}
            selectedTopicIds={selectedTopicIds}
            onToggleTopicSelection={handleToggleTopicSelection}
            onClearSelection={handleClearTopicSelection}
            topicSearchQuery={topicSearchQuery}
            onTopicSearchQueryChange={setTopicSearchQuery}
            panelNodeIds={colorNodeIds}
            nodeColors={nodeColors}
            defaultPalette={defaultPalette}
            graphProjectionKey={graphProjectionKey}
            onGraphViewReady={setReadyGraphProjectionKey}
            nodeNames={resultNodeNames}
            randomSeed={resultRandomSeed}
            onAddToWorkspace={openAddToWorkspaceDialog}
            isAddingToWorkspace={isAddingToWorkspace}
            projectionPending={projectionPending}
            projectionError={projectionError}
            clustering={result?.clustering ?? null}
            topicInclusion={result?.topic_inclusion ?? null}
            onClusterCountCommit={(value) => {
              const appliedTopN = result?.topic_inclusion.top_n_topics ?? 0;
              startProjection(value, Math.min(value, appliedTopN));
            }}
            onTopNTopicsCommit={(value) => {
              const appliedClusterCount = result?.clustering.cluster_count ?? 0;
              startProjection(appliedClusterCount, value);
            }}
            onProjectionRetry={
              projectionError && currentProjectionRequest
                ? () => {
                    startProjection(
                      currentProjectionRequest.clusterCount,
                      currentProjectionRequest.topNTopics,
                    );
                  }
                : undefined
            }
            projectionControlResetKey={controlResetKey}
            wordsPerTopic={representativeWordsCount}
            onWordsPerTopicChange={(value) => {
              void host.setPresentationSettings({ wordsPerTopic: value });
            }}
            stopWordsEnabled={stopWordsEnabled}
            onStopWordsEnabledChange={(enabled) => {
              if (!resultKey) return;
              host.setSetting(STOP_WORDS_ENABLED_SETTINGS.topicModeling, String(enabled));
            }}
            stopWords={host.stopWords}
            stopWordsDetectionTarget={{
              workspaceId: currentWorkspaceId,
              nodeId: firstResultNodeId,
              column: firstResultColumn,
            }}
            stopWordListSources={stopWordListSources}
            onStopWordsChange={(words) => {
              return host.setPresentationSettings({ stopWords: words });
            }}
            colorBy={
              resultSources.length === 1
                ? {
                    columns: colorBy.columns,
                    loaded: colorBy.columnsLoaded,
                    valueCounts: colorBy.columnValueCounts,
                    column: colorBy.activeColumn,
                    scheme: colorBy.scheme,
                    pending: colorBy.pending,
                    error: colorBy.error,
                    onColumnChange: (column) => {
                      setColorBySelection({ analysisId: tabTaskId, column });
                    },
                  }
                : // Shown disabled with its reason, not hidden (issue 365).
                  {
                    ...NO_COLOR_BY,
                    unavailableReason:
                      'With two Data Blocks, bubble colours show which Data Block each Topic comes from.',
                  }
            }
          />
        </TopicNamesContext.Provider>
      )}
      {addToWorkspaceDialogOpen ? (
        <TopicModelingAddToWorkspaceDialog
          open
          onOpenChange={setAddToWorkspaceDialogOpen}
          sources={addToWorkspaceSources}
          selectedTopicIds={selectedTopicIds.size > 0 ? [...selectedTopicIds] : null}
          topicNames={Object.fromEntries(
            topicNamesById(exportTopics).map((item) => [item.topic_id, item.name]),
          )}
          isSubmitting={isAddingToWorkspace}
          onSubmit={(selections, rowUnit) => {
            void handleAddToWorkspace(selections, rowUnit);
          }}
        />
      ) : null}
    </AnalysisSplitLayout>
  );
}

/** Colour by for a result it cannot colour: no columns, nothing chosen. */
const NO_COLOR_BY = {
  columns: [],
  loaded: true,
  column: null,
  scheme: null,
  pending: false,
  error: null,
  // Nothing to choose: the control is disabled.
  onColumnChange: () => undefined,
} as const;

export default TopicModelingFeature;
