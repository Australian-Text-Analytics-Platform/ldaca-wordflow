import { ResultFrame } from '@/features/views/common/components/ResultFrame';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { TopicModelingTopic } from '@/api';
import JSZip from 'jszip';
import { PanelBottom, PanelRight } from 'lucide-react';
import { toast } from 'sonner';
import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { Button } from '@/components/ui/button';
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
import {
  CHART_MIN_WIDTH,
  CHART_SHARE_STEP,
  DEFAULT_TOPIC_CHART_LAYOUT,
  DIVIDER_WIDTH,
  SIDE_LAYOUT_MIN_WIDTH,
  SIDE_MIN_WIDTH,
  type TopicChartLayout,
  topicChartWidth,
} from './topicChartLayout';
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
  /**
   * Result controls beside the graph on a wide card, otherwise between it and
   * the Topic lists. A function receives the button that moves them (issue 433).
   */
  controlRowSlot?: React.ReactNode | ((placementToggle: React.ReactNode) => React.ReactNode);
  /** Single-corpus metadata colouring chosen under "Colour by". */
  colorScheme?: TopicColorScheme | null;
  /** The run whose example segments the list can show (issue 353). */
  workspaceId?: string;
  analysisId?: string;
  /** Where the settings and legend sit, and the chart's width (issue 433). */
  chartLayout?: TopicChartLayout;
  onChartLayoutChange?: (layout: TopicChartLayout) => void;
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
  chartLayout = DEFAULT_TOPIC_CHART_LAYOUT,
  onChartLayoutChange,
}: Props) {
  const corpusCount = corpusSizes.length;
  const chartRef = useRef<HTMLDivElement | null>(null);
  // On a wide card the settings and legend sit beside a 4:3 chart, so it
  // isn't a wide strip; the divider sets the chart's width, double-click
  // returns to 4:3, and a chart control moves the settings below (issue 433).
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [layoutBox, setLayoutBox] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [dragShare, setDragShare] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = layoutRef.current;
    if (!element) return undefined;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setLayoutBox((current) =>
        current?.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const sideAvailable = layoutBox !== null && layoutBox.width >= SIDE_LAYOUT_MIN_WIDTH;
  const beside = sideAvailable && chartLayout.placement === 'side';
  const chartShare = dragShare ?? chartLayout.chartShare;
  const chartWidth = beside ? topicChartWidth(layoutBox, chartShare) : null;
  const shareAt = (clientX: number) => {
    const bounds = layoutRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return chartShare;
    return topicChartWidth(bounds, (clientX - bounds.left) / bounds.width) / bounds.width;
  };
  const commitShare = (share: number | null) => {
    setDragShare(null);
    onChartLayoutChange?.({ ...chartLayout, chartShare: share });
  };
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
  const [shown, setShown] = useState({
    projectionKey,
    topicId: null as number | null,
  });
  const shownTopicId =
    shown.projectionKey === projectionKey && topics.some((topic) => topic.id === shown.topicId)
      ? shown.topicId
      : null;
  const toggleShownTopic = (topicId: number) => {
    setShown({
      projectionKey,
      topicId: shownTopicId === topicId ? null : topicId,
    });
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
    ? activeColorScheme.groups.map((group) => ({
        label: group.label,
        color: group.color,
      }))
    : (corpusLegend ?? []);

  /** Chart details shown above an image or HTML download. */
  const exportHeader = (): ChartExportHeaderItem[] => [
    { label: 'Data Block', value: nodeNames?.join(', ') ?? 'data' },
    // One name for the topic count (issue 205).
    {
      label: 'Number of topics',
      value: clusterCount != null ? String(clusterCount) : '—',
    },
    {
      label: 'Top topics per document',
      value: topNTopics != null ? String(topNTopics) : '—',
    },
    {
      label: 'Random seed',
      value: randomSeed != null ? String(randomSeed) : '—',
    },
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

  const placementToggle =
    sideAvailable && onChartLayoutChange ? (
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={
          beside ? 'Move the settings below the chart' : 'Move the settings beside the chart'
        }
        title={beside ? 'Move the settings below the chart' : 'Move the settings beside the chart'}
        onClick={() => {
          onChartLayoutChange({ ...chartLayout, placement: beside ? 'below' : 'side' });
        }}
      >
        {beside ? <PanelBottom className="size-4" /> : <PanelRight className="size-4" />}
      </Button>
    ) : null;
  const controls =
    typeof controlRowSlot === 'function' ? controlRowSlot(placementToggle) : controlRowSlot;
  const legend = activeColorScheme ? (
    <TopicColorLegend scheme={activeColorScheme} />
  ) : corpusLegend ? (
    <TopicCorpusLegend items={corpusLegend} />
  ) : null;

  return (
    <>
      <div
        ref={layoutRef}
        data-testid="topic-chart-layout"
        data-settings-placement={beside ? 'side' : 'below'}
        className={beside ? 'flex items-stretch' : undefined}
        style={{ containerType: 'inline-size' }}
      >
        <div
          ref={chartRef}
          data-testid="topic-chart-column"
          className={beside ? 'relative shrink-0' : 'relative w-full'}
          style={chartWidth !== null ? { width: chartWidth } : undefined}
        >
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
                    ...(current.projectionKey === projectionKey
                      ? current.topicIds
                      : EMPTY_TOPIC_IDS),
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
        {beside ? (
          <ResizeHandle
            orientation="vertical"
            variant="bar"
            isDragging={dragShare !== null}
            aria-label="Resize the chart and its settings"
            aria-valuenow={Math.round(((chartWidth ?? 0) / layoutBox.width) * 100)}
            aria-valuemin={Math.round((CHART_MIN_WIDTH / layoutBox.width) * 100)}
            aria-valuemax={Math.round(
              ((layoutBox.width - DIVIDER_WIDTH - SIDE_MIN_WIDTH) / layoutBox.width) * 100,
            )}
            tabIndex={0}
            title="Drag to resize. Double-click for a 4:3 chart."
            data-testid="topic-chart-divider"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragShare(shareAt(event.clientX));
            }}
            onPointerMove={(event) => {
              if (dragShare !== null) setDragShare(shareAt(event.clientX));
            }}
            onPointerUp={(event) => {
              if (dragShare === null) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              commitShare(shareAt(event.clientX));
            }}
            onPointerCancel={() => {
              setDragShare(null);
            }}
            onDoubleClick={() => {
              commitShare(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const current = (chartWidth ?? 0) / layoutBox.width;
              const next =
                current + (event.key === 'ArrowLeft' ? -CHART_SHARE_STEP : CHART_SHARE_STEP);
              commitShare(topicChartWidth(layoutBox, next) / layoutBox.width);
            }}
          />
        ) : null}
        {beside ? (
          // The side column scrolls within the chart's height, so the chart
          // sets the row's height and the results pane can share it out.
          <div className="relative min-w-0 flex-1" data-testid="topic-chart-side">
            <div className="absolute inset-0 space-y-3 overflow-y-auto pl-2">
              {legend}
              {controls ?? null}
            </div>
          </div>
        ) : null}
      </div>

      {beside ? null : legend}
      {beside ? null : (controls ?? null)}

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
