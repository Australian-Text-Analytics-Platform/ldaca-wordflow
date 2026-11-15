import type { ProgressDetail } from '@/api';
import React from 'react';
import type { TokenFrequencyResponse } from '@/api';
import HelpIcon from '@/components/help/HelpIcon';
import { AnalysisCardLayout } from '@/features/views/common/components/AnalysisCardLayout';
import { AnalysisRunningStateCard } from '@/features/views/common/components/AnalysisRunningStateCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { NodeResultView, NormalizedNodeResult } from '../../tokenFrequencyAdapters';

import { TokenFrequencySingleTokenSection } from '../results/TokenFrequencySingleTokenSection';
import { TokenFrequencyUnifiedTokenSection } from '../results/TokenFrequencyUnifiedTokenSection';
import { useTokenFrequencyListLimit } from '../../hooks/useTokenFrequencyListLimit';
import { StopWordsEnabledSwitch } from '@/features/views/common/components/StopWordsEnabledSwitch';
import { StopWordsLanguageSelect } from '@/features/views/common/components/StopWordsLanguageSelect';
import type { StopWordListSource } from '@/features/views/common/utils/stopWordListSources';
import { parseStopWordsText, stopWordsPreview } from '@/features/views/common/utils/stopWords';
import { TokenFrequencyTokenFilterCard } from './TokenFrequencyTokenFilterCard';
import type { WordCloudChartContext } from '../../hooks/useTokenFrequencyDownloads';

type ResultsView = 'cloud' | 'list';

interface RunningTask {
  task_id: string;
  state?: string;
  message?: string;
  progress?: number;
  progress_message?: string;
  progress_detail?: ProgressDetail | null;
}

interface TokenFrequencyResultsPanelProps {
  results: TokenFrequencyResponse | null;
  isRunning: boolean;
  runningTask?: RunningTask | null;

  stopWords: string;
  onStopWordsChange: React.Dispatch<React.SetStateAction<string>>;
  onStopWordsApply: () => void;
  /** Replaces the stop-word list from the shared language dropdown. */
  onStopWordsListChange: (words: string[]) => void;
  /** Workspace, node, and column sampled to recommend a stop-word language. */
  stopWordsLanguageSource: {
    workspaceId: string | null;
    nodeId: string | null;
    column: string | null;
  };
  /** Other tabs' saved stop-word lists offered for copying. */
  stopWordListSources?: StopWordListSource[];
  onSortStopWords: () => void;
  stopWordsEnabled: boolean;
  onStopWordsEnabledChange: (enabled: boolean) => void;

  tokenLimitInput: string;
  onTokenLimitInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTokenLimitBlur: () => void;
  /** Programmatic apply of cloud-side token limit (used when the list-side
   *  limit changes and needs to mirror to the cloud limit). */
  applyCloudTokenLimit: (value: number) => Promise<void> | void;
  tokenLimitError: string | null;

  appliedStopCount: number;

  normalizedNodeResults: NormalizedNodeResult[];
  nodeDisplayResults: NodeResultView[];
  lastCompareNodeIds: string[];
  appliedStopSet: Set<string>;
  effectiveTokenLimit: number;
  defaultTokenLimit: number;

  computeDisplayName: (nodeId: string, fallbackKey?: string) => string;
  getColorForNode: (nodeId: string, index?: number) => string;

  onDownloadWordCloud: (
    nodeKey: string,
    displayName: string,
    chartContext?: WordCloudChartContext,
  ) => void;
  onTokenClick: (token: string) => void;
  onTokenRightClick: (token: string) => void;

  registerWordCloudRef: (nodeKey: string, element: SVGSVGElement | null) => void;

  onDownloadFrequencyCsv: (label: string, rows: unknown[]) => void;
}

/**
 * Rendered by: TokenFrequencyFeature to show running status, controls, and token-frequency result sections.
 */
export const TokenFrequencyResultsPanel = ({
  results,
  isRunning,
  runningTask,
  stopWords,
  onStopWordsChange,
  onStopWordsApply,
  onStopWordsListChange,
  stopWordsLanguageSource,
  stopWordListSources = [],
  onSortStopWords,
  stopWordsEnabled,
  onStopWordsEnabledChange,
  tokenLimitInput,
  onTokenLimitInputChange,
  onTokenLimitBlur,
  applyCloudTokenLimit,
  tokenLimitError,
  appliedStopCount,
  normalizedNodeResults,
  nodeDisplayResults,
  lastCompareNodeIds,
  appliedStopSet,
  effectiveTokenLimit,
  defaultTokenLimit,
  computeDisplayName,
  getColorForNode,
  onDownloadWordCloud,
  onTokenClick,
  onTokenRightClick,
  registerWordCloudRef,
  onDownloadFrequencyCsv,
}: TokenFrequencyResultsPanelProps) => {
  const isRunningState = isRunning;
  const isSuccessfulState = Boolean(results) && !isRunningState;
  const [resultsView, setResultsView] = React.useState<ResultsView>('cloud');
  const [tokenFilter, setTokenFilter] = React.useState<string>('');
  // The stop-word list opens on request; the switch, list picker, Sort and the
  // count stay in the settings row, and right-click still adds words.
  const [stopWordsEditorOpen, setStopWordsEditorOpen] = React.useState(false);
  // Word-cloud layout is expensive, so keep the input immediate while all
  // result surfaces move together through one deferred projection.
  const deferredTokenFilter = React.useDeferredValue(tokenFilter);
  const {
    globalMaxVocab,
    listLimit,
    listLimitInput,
    listLimitError,
    handleListLimitInputChange,
    handleApplyListLimit,
    handleApplyCloudLimit,
  } = useTokenFrequencyListLimit({
    nodeDisplayResults,
    effectiveTokenLimit,
    tokenLimitInput,
    onTokenLimitBlur,
    applyCloudTokenLimit,
  });

  if (!isRunningState && !results) {
    return null;
  }

  const stopWordsList = parseStopWordsText(stopWords);
  const hiddenWordsPreview = stopWordsPreview(stopWordsList);

  const runningMessage =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty progress_message/message should fall back to the next source, not render blank
    runningTask?.progress_message || runningTask?.message || 'Running Frequency analysis…';
  const runningProgress = typeof runningTask?.progress === 'number' ? runningTask.progress : null;
  return (
    <AnalysisCardLayout
      title="Frequency Results"
      titleGuidanceTarget="token-frequency-results"
      help={{
        targetKey: 'analysis.token-frequency.results',
        label: 'Frequency results',
        tooltip: 'Shows running progress, failures, and final Frequency outputs.',
      }}
    >
      {isRunningState ? (
        <AnalysisRunningStateCard
          message={runningMessage}
          progress={runningProgress}
          detail={runningTask?.progress_detail}
          taskId={runningTask?.task_id}
        />
      ) : null}

      {isSuccessfulState ? (
        <div className="space-y-4">
          {/* Stop words sit in one wrapping row so the result starts near the
              top of the pane; the opened list, or the hidden-words line, comes
              under it and pushes the result down. They only change what is
              shown, never the counts, and wrap by the pane's width, not the
              window's. */}
          <div
            className="space-y-2 rounded-lg border border-surface-border/60 bg-panel/20 px-3 py-2"
            data-testid="token-frequency-display-settings"
          >
            <div
              role="group"
              aria-label="Stop words"
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              <Label htmlFor={stopWordsEditorOpen ? 'stop-words' : undefined}>
                Stop words filter ({appliedStopCount})
              </Label>
              <StopWordsEnabledSwitch
                checked={stopWordsEnabled}
                onCheckedChange={(enabled) => {
                  onStopWordsEnabledChange(enabled);
                  // Nothing to filter yet: open the list so the words can be typed.
                  if (enabled && !stopWords.trim()) setStopWordsEditorOpen(true);
                }}
              />
              <StopWordsLanguageSelect
                words={stopWordsList}
                onWordsChange={onStopWordsListChange}
                workspaceId={stopWordsLanguageSource.workspaceId}
                nodeId={stopWordsLanguageSource.nodeId}
                column={stopWordsLanguageSource.column}
                sources={stopWordListSources}
                onListAdded={() => {
                  if (!stopWordsEnabled) onStopWordsEnabledChange(true);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={stopWordsEditorOpen}
                aria-controls={stopWordsEditorOpen ? 'stop-words' : undefined}
                onClick={() => {
                  setStopWordsEditorOpen((open) => !open);
                }}
              >
                {stopWordsEditorOpen ? (
                  <ChevronUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {stopWordsEditorOpen ? 'Hide list' : 'Edit list'}
              </Button>
              {/* Sorting only matters while the whole list is in view (Chao). */}
              {stopWordsEditorOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSortStopWords}
                  disabled={!stopWordsEnabled || !stopWords.trim()}
                >
                  Sort
                </Button>
              ) : null}
              <HelpIcon
                targetKey="analysis.token-frequency.stop-words"
                label="Stop words"
                tooltip="Words hidden from the results. Pick a list, or right-click a word to add it."
              />
            </div>

            {!stopWordsEditorOpen && stopWordsEnabled && hiddenWordsPreview ? (
              <p
                className="truncate text-label-secondary text-description"
                data-testid="token-frequency-stop-words-preview"
              >
                Hidden words: {hiddenWordsPreview}
              </p>
            ) : null}
            {stopWordsEditorOpen ? (
              <textarea
                id="stop-words"
                rows={4}
                value={stopWords}
                onChange={(event) => {
                  onStopWordsChange(event.target.value);
                }}
                onBlur={onStopWordsApply}
                placeholder="the, and, of"
                disabled={!stopWordsEnabled}
                className="w-full resize-y overflow-y-auto rounded-md border border-input-border bg-editor px-3 py-2 text-body text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus"
              />
            ) : null}
          </div>

          {/* The limit for the view on screen sits beside the view selector; the
              two values stay linked as before (Chao, 15 Nov 2026). It applies on
              Enter or when the box loses focus, so there is no Apply button. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-80">
              <TokenFrequencyTokenFilterCard value={tokenFilter} onChange={setTokenFilter} />
            </div>
            {resultsView === 'cloud' ? (
              <div className="flex items-center gap-2" data-testid="token-frequency-display-limit">
                <Label htmlFor="token-limit">Cloud display limit (10–100)</Label>
                <Input
                  id="token-limit"
                  type="number"
                  min={10}
                  max={100}
                  className="h-8 w-20"
                  value={tokenLimitInput}
                  onChange={onTokenLimitInputChange}
                  onBlur={handleApplyCloudLimit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleApplyCloudLimit();
                    }
                  }}
                />
                <HelpIcon
                  targetKey="analysis.token-frequency.token-limit"
                  label="Cloud display limit"
                  tooltip="Most tokens in each word cloud (10–100). Also sets the list limit."
                />
              </div>
            ) : (
              <div className="flex items-center gap-2" data-testid="token-frequency-display-limit">
                <Label htmlFor="list-limit">List display limit (10 – {globalMaxVocab})</Label>
                <Input
                  id="list-limit"
                  type="number"
                  min={10}
                  max={globalMaxVocab}
                  className="h-8 w-20"
                  value={listLimitInput}
                  onChange={handleListLimitInputChange}
                  onBlur={handleApplyListLimit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleApplyListLimit();
                    }
                  }}
                />
                <HelpIcon
                  targetKey="analysis.token-frequency.list-limit"
                  label="List display limit"
                  tooltip="Most tokens in each list. Up to 100, it matches the cloud limit."
                />
              </div>
            )}
            <Tabs
              value={resultsView}
              onValueChange={(value) => {
                setResultsView(value as ResultsView);
              }}
              data-testid="token-frequency-results-view-tabs"
            >
              <TabsList>
                <TabsTrigger value="cloud">Cloud view</TabsTrigger>
                <TabsTrigger value="list">List view</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {resultsView === 'cloud' && tokenLimitError ? (
            <p className="text-label-secondary text-error">{tokenLimitError}</p>
          ) : null}
          {resultsView === 'list' && listLimitError ? (
            <p className="text-label-secondary text-error">{listLimitError}</p>
          ) : null}

          <TokenFrequencySingleTokenSection
            nodeDisplayResults={nodeDisplayResults}
            getColorForNode={getColorForNode}
            onTokenClick={onTokenClick}
            onTokenRightClick={onTokenRightClick}
            onDownloadFrequencyCsv={onDownloadFrequencyCsv}
            onDownloadWordCloud={onDownloadWordCloud}
            registerWordCloudRef={registerWordCloudRef}
            view={resultsView}
            tokenFilter={deferredTokenFilter}
            listLimit={listLimit}
          />

          <TokenFrequencyUnifiedTokenSection
            normalizedNodeResults={normalizedNodeResults}
            nodeDisplayResults={nodeDisplayResults}
            lastCompareNodeIds={lastCompareNodeIds}
            statistics={results?.statistics}
            appliedStopSet={appliedStopSet}
            effectiveTokenLimit={effectiveTokenLimit}
            defaultTokenLimit={defaultTokenLimit}
            computeDisplayName={computeDisplayName}
            getColorForNode={getColorForNode}
            onDownloadWordCloud={onDownloadWordCloud}
            onTokenClick={onTokenClick}
            onTokenRightClick={onTokenRightClick}
            registerWordCloudRef={registerWordCloudRef}
            onDownloadFrequencyCsv={onDownloadFrequencyCsv}
            view={resultsView}
            tokenFilter={deferredTokenFilter}
          />
        </div>
      ) : null}
    </AnalysisCardLayout>
  );
};
