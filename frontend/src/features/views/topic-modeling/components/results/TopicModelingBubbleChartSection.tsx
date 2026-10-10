import { ResultFrame } from '@/features/views/common/components/ResultFrame';
import React, { useRef, useState } from 'react';
import type { TopicModelingTopic } from '@/api';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { ChartImageDownloadDialog } from '@/components/ui/ChartImageDownloadDialog';
import {
  buildChartBlob,
  type ChartExportHeaderItem,
  type ChartImageFormat,
} from '@/lib/chartExport';
import { csvBlob, saveBlob } from '@/lib/download';
import { buildTopicsCSV } from './topicModelingCsv';
import { TopicModelingFlowChart } from './TopicModelingFlowChart';
import {
  buildTopicBubbleModels,
  DEFAULT_TOPIC_GRAPH_PLANE,
  topicGraphPlaneFor,
  topicCorpusColors,
  topicCorpusLegend,
  type TopicColorScheme,
} from './topicModelingGraph';
import { TopicSelectionPanel } from './TopicSelectionPanel';
import { toastError } from '@/lib/toastError';
import { downloadTopicBubbleHtml } from './topicBubbleHtmlExport';
import { useTopicNames } from './topicNamesContext';

interface Props {
  topics: TopicModelingTopic[];
  exportTopics?: TopicModelingTopic[];
  selectedTopicIds: Set<number>;
  onToggleTopicSelection: (id: number) => void;
  onClearSelection: () => void;
  topicSearchQuery: string;
  onTopicSearchQueryChange: (query: string) => void;
  corpusSizes: number[];
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
  projectionKey: string;
  onViewReady: (projectionKey: string) => void;
  nodeNames?: string[];
  clusterCount?: number;
  exportDisabled?: boolean;
  randomSeed?: number;
  topNTopics?: number;
  /** Result controls placed between the graph and the Topic lists. */
  controlRowSlot?: React.ReactNode;
  /** Single-corpus metadata colouring chosen under "Colour by". */
  colorScheme?: TopicColorScheme | null;
  /** The run whose example segments the list can show (issue 353). */
  workspaceId?: string;
  analysisId?: string;
}

/** Maps each metadata colour to its value, shown under the graph. */
function TopicColorLegend({ scheme }: { scheme: TopicColorScheme }) {
  return (
    <div
      role="group"
      aria-label={`Bubble colours by ${scheme.column}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-secondary text-description"
    >
      <span className="font-medium text-foreground">{scheme.column}:</span>
      {scheme.groups.map((group, index) => (
        <span key={`${group.label}:${String(index)}`} className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ background: group.color }}
          />
          {group.label}
        </span>
      ))}
    </div>
  );
}

/** Names each Data Block's colour and the blend between them (issue 281). */
function TopicCorpusLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div
      role="group"
      aria-label="Bubble colours by Data Block"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-secondary text-description"
    >
      <span className="font-medium text-foreground">Bubble colour:</span>
      {items.map((item, index) => (
        <span key={`${item.label}:${String(index)}`} className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

const TM_CSV_OPTION = {
  id: 'includeCSV',
  label: 'Include representative words (CSV)',
  defaultChecked: true,
} as const;
const EMPTY_TOPIC_IDS = new Set<number>();

/** Composes the React Flow topic graph, export dialog, result controls, Topic list and examples. */
export function TopicModelingBubbleChartSection({
  topics,
  exportTopics = topics,
  selectedTopicIds,
  onToggleTopicSelection,
  onClearSelection,
  topicSearchQuery,
  onTopicSearchQueryChange,
  corpusSizes,
  panelNodeIds,
  nodeColors,
  defaultPalette,
  projectionKey,
  onViewReady,
  nodeNames,
  clusterCount,
  exportDisabled = false,
  randomSeed,
  topNTopics,
  controlRowSlot,
  colorScheme = null,
  workspaceId,
  analysisId,
}: Props) {
  const corpusCount = corpusSizes.length;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [lassoMode, setLassoMode] = useState(false);
  const [lassoFilter, setLassoFilter] = useState({
    projectionKey,
    topicIds: EMPTY_TOPIC_IDS,
  });
  const [listHover, setListHover] = useState({
    projectionKey,
    topicId: null as number | null,
  });
  const lassoTopicIds =
    lassoFilter.projectionKey === projectionKey ? lassoFilter.topicIds : EMPTY_TOPIC_IDS;
  const hoveredTopicId = listHover.projectionKey === projectionKey ? listHover.topicId : null;
  // The Topic whose examples are shown (issue 353). Topic ids change with the
  // Topics slider, so it belongs to one projection.
  const [shown, setShown] = useState({ projectionKey, topicId: null as number | null });
  const shownTopicId =
    shown.projectionKey === projectionKey && topics.some((topic) => topic.id === shown.topicId)
      ? shown.topicId
      : null;
  const toggleShownTopic = (topicId: number) => {
    setShown({ projectionKey, topicId: shownTopicId === topicId ? null : topicId });
  };
  // The map takes the canvas's shape, within limits (issue 308).
  const [canvasAspect, setCanvasAspect] = useState<number | null>(null);
  const plane =
    canvasAspect === null ? DEFAULT_TOPIC_GRAPH_PLANE : topicGraphPlaneFor(canvasAspect);
  const bubbles = buildTopicBubbleModels({
    topics,
    corpusSizes,
    panelNodeIds,
    nodeColors,
    defaultPalette,
    selectedTopicIds,
    lassoTopicIds,
    hoveredTopicId,
    shownTopicId,
    topicSearchQuery,
    colorScheme,
    plane,
  });
  const activeColorScheme = corpusCount === 1 ? colorScheme : null;

  const corpusPresentation = {
    corpusCount,
    panelNodeIds,
    nodeColors,
    defaultPalette,
    colorScheme: activeColorScheme,
    corpusSizes,
  };
  const examples =
    workspaceId && analysisId && clusterCount != null
      ? {
          workspaceId,
          analysisId,
          clusterCount,
          nodeNames: nodeNames ?? [],
          corpusColors: topicCorpusColors(corpusPresentation),
          colorScheme: activeColorScheme,
        }
      : undefined;
  const { names: topicNames } = useTopicNames();
  const corpusLegend = topicCorpusLegend(corpusPresentation, nodeNames ?? []);
  const exportLegend = activeColorScheme
    ? activeColorScheme.groups.map((group) => ({ label: group.label, color: group.color }))
    : (corpusLegend ?? []);

  /** Chart details shown above an image or HTML download. */
  const exportHeader = (): ChartExportHeaderItem[] => [
    { label: 'Data Block', value: nodeNames?.join(', ') ?? 'data' },
    // One name for the topic count (issue 205).
    { label: 'Number of topics', value: clusterCount != null ? String(clusterCount) : '—' },
    { label: 'Top topics per document', value: topNTopics != null ? String(topNTopics) : '—' },
    { label: 'Random seed', value: randomSeed != null ? String(randomSeed) : '—' },
    { label: 'Topics in the chart', value: String(topics.length) },
    ...(activeColorScheme ? [{ label: 'Colour by', value: activeColorScheme.column }] : []),
  ];

  /**
   * Interactive HTML download (issue 279): the bubble picture as shown, with
   * a Find topics filter, hover cards and pan and zoom, in one offline file.
   */
  const handleDownloadChartHtml = async () => {
    const svg = chartRef.current?.querySelector<SVGSVGElement>(
      'svg[data-topic-modeling-export="true"]',
    );
    if (!svg) {
      toast.error('Chart not available for export.');
      return;
    }
    const nodeName = (nodeNames ?? []).filter(Boolean).join('_') || 'data';
    try {
      await downloadTopicBubbleHtml(svg, {
        nodeName,
        title: `Topic Modelling: ${nodeNames?.join(', ') ?? 'data'}`,
        header: exportHeader(),
        legend: exportLegend,
        topics,
        presentation: corpusPresentation,
        nodeNames: nodeNames ?? [],
        query: topicSearchQuery,
        names: topicNames,
      });
    } catch (error) {
      toastError(error, 'Try again.', { title: "Couldn't export chart." });
    }
  };

  const handleDownloadChart = async (format: ChartImageFormat, extras: Record<string, boolean>) => {
    const svg = chartRef.current?.querySelector<SVGSVGElement>(
      'svg[data-topic-modeling-export="true"]',
    );
    if (!svg) {
      toast.error('Chart not available for export.');
      return;
    }
    const nodeName = (nodeNames ?? []).filter(Boolean).join('_') || 'data';
    const header = exportHeader();
    try {
      if (extras.includeCSV ?? false) {
        const { blob: imageBlob, filename: imageFilename } = await buildChartBlob(svg, {
          nodeName,
          toolSuffix: 'tm',
          format,
          header,
          legend: exportLegend,
        });
        const safeBaseName = nodeName.replace(/[<>:"\\|?*/\s]+/g, '_').slice(0, 60) || 'data';
        const zip = new JSZip();
        zip.file(imageFilename, imageBlob);
        zip.file(
          `${safeBaseName}_tm_topics.csv`,
          csvBlob(buildTopicsCSV(exportTopics, selectedTopicIds, nodeNames ?? [])),
        );
        await saveBlob(await zip.generateAsync({ type: 'blob' }), `${safeBaseName}_tm.zip`);
      } else {
        const { blob, filename } = await buildChartBlob(svg, {
          nodeName,
          toolSuffix: 'tm',
          format,
          header,
          legend: exportLegend,
        });
        await saveBlob(blob, filename);
      }
    } catch (error) {
      toastError(error, 'Try again.', { title: "Couldn't export chart." });
    }
  };

  return (
    <>
      <div ref={chartRef} className="relative w-full" style={{ containerType: 'inline-size' }}>
        <ResultFrame
          storageKey="topic-modeling.bubbles"
          defaultHeight="clamp(320px, 55cqw, 520px)"
          minHeight={240}
          className="rounded-lg border border-surface-border-foreground/30 bg-editor"
          testId="topic-bubble-chart-shell"
        >
          <TopicModelingFlowChart
            bubbles={bubbles}
            plane={plane}
            onCanvasAspectChange={setCanvasAspect}
            corpusPresentation={corpusPresentation}
            projectionKey={projectionKey}
            lassoMode={lassoMode}
            lassoFilterActive={lassoTopicIds.size > 0}
            exportDisabled={exportDisabled}
            onToggleLassoMode={() => {
              setLassoMode((current) => !current);
              setListHover({ projectionKey, topicId: null });
            }}
            onAddLassoTopics={(topicIds) => {
              setLassoFilter((current) => ({
                projectionKey,
                topicIds: new Set([
                  ...(current.projectionKey === projectionKey ? current.topicIds : EMPTY_TOPIC_IDS),
                  ...topicIds,
                ]),
              }));
            }}
            onClearLassoFilter={() => {
              setLassoFilter({ projectionKey, topicIds: EMPTY_TOPIC_IDS });
            }}
            onDownload={() => {
              setDownloadDialogOpen(true);
            }}
            onViewReady={onViewReady}
            onToggleTopicSelection={onToggleTopicSelection}
            onToggleShownTopic={examples ? toggleShownTopic : undefined}
          />
        </ResultFrame>
      </div>

      {activeColorScheme ? <TopicColorLegend scheme={activeColorScheme} /> : null}
      {!activeColorScheme && corpusLegend ? <TopicCorpusLegend items={corpusLegend} /> : null}

      {controlRowSlot ?? null}

      <TopicSelectionPanel
        topics={topics}
        selectedTopicIds={selectedTopicIds}
        onToggleTopicSelection={onToggleTopicSelection}
        onClearSelection={onClearSelection}
        topicSearchQuery={topicSearchQuery}
        lassoTopicIds={lassoTopicIds}
        corpusPresentation={corpusPresentation}
        hoveredTopicId={hoveredTopicId}
        onHoveredTopicChange={(topicId) => {
          setListHover({ projectionKey, topicId });
        }}
        shownTopicId={shownTopicId}
        shownTopicColor={bubbles.find((bubble) => bubble.id === shownTopicId)?.fill}
        onToggleShownTopic={toggleShownTopic}
        onClearFilters={() => {
          onTopicSearchQueryChange('');
          setLassoFilter({ projectionKey, topicIds: EMPTY_TOPIC_IDS });
        }}
        examples={examples}
      />

      <ChartImageDownloadDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        title="Download topic model chart"
        extraOptions={[TM_CSV_OPTION]}
        onConfirm={(format, extras) => {
          void handleDownloadChart(format, extras);
        }}
        onConfirmHtml={() => {
          void handleDownloadChartHtml();
        }}
      />
    </>
  );
}
