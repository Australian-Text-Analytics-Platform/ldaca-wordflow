import '@xyflow/react/dist/style.css';

import {
  ControlButton,
  Controls,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useKeyPress,
  useReactFlow,
  useStoreApi,
  type Viewport,
} from '@xyflow/react';
import { Download, Eye, FilterX, LassoSelect, Minus, Plus, Scan } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { NodeTooltip, NodeTooltipContent, NodeTooltipTrigger } from '@/components/node-tooltip';
import { ResponsiveWordCloud } from '@/features/views/common/components/ResponsiveWordCloud';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CHART_ZOOM_KEY } from '@/lib/chartZoom';
import { cn } from '@/lib/utils';
import { topicMatchColor } from '../../topicModelingAdapters';
import { type TopicCorpusPresentation, TopicSizeComposition } from './TopicSizeComposition';
import {
  findTopicIdsInsideLasso,
  TOPIC_OPACITY_HOVER,
  type TopicBubbleModel,
  type TopicGraphPlane,
  type TopicGraphPoint,
} from './topicModelingGraph';
import { topicLabel, topicShortLabel } from '../../ungrouped';
import { topicNameDisplay } from '../../topicNames';
import { useTopicNames } from './topicNamesContext';

interface TopicBubbleNodeData extends Record<string, unknown> {
  bubble: TopicBubbleModel;
  corpusPresentation: TopicCorpusPresentation;
  plane: TopicGraphPlane;
  /** Right-click shows this Topic's examples (issue 353). */
  examplesShortcut: boolean;
}

export type TopicFlowNode = Node<TopicBubbleNodeData, 'topic'>;

interface Props {
  bubbles: TopicBubbleModel[];
  /** The plane the bubbles were laid out in (issue 308). */
  plane: TopicGraphPlane;
  /**
   * The drawable canvas shape (width ÷ height, inside the fit padding), first
   * as soon as it is measured, then once resizing has settled (issue 308).
   */
  onCanvasAspectChange?: (aspect: number) => void;
  corpusPresentation: TopicCorpusPresentation;
  projectionKey: string;
  lassoMode: boolean;
  lassoFilterActive: boolean;
  exportDisabled: boolean;
  onToggleLassoMode: () => void;
  onClearLassoFilter: () => void;
  onAddLassoTopics: (topicIds: Set<number>) => void;
  onDownload: () => void;
  onViewReady: (projectionKey: string) => void;
  onToggleTopicSelection: (topicId: number) => void;
  /** Right-click shows or stops showing a Topic's examples (issue 353). */
  onToggleShownTopic?: (topicId: number) => void;
}

const NODE_ORIGIN: [number, number] = [0.5, 0.5];
const EMPTY_EDGES: [] = [];
/**
 * Room around the fitted map. The left side clears the control strip, which
 * overlays the chart's top-left corner (issue 308); the hover card flips to
 * whichever side has room, so the right needs no extra space.
 */
const FIT_PADDING = { top: 24, right: 24, bottom: 24, left: 64 };
/** Wait this long after the last resize before laying the bubbles out again. */
const RELAYOUT_DELAY_MS = 200;
const FIT_VIEW_OPTIONS = {
  // Keep in step with FIT_PADDING.
  padding: { top: '24px', right: '24px', bottom: '24px', left: '64px' },
  minZoom: 0.05,
  maxZoom: 1.5,
  duration: 0,
} as const;

interface TopicGraphControlButtonProps {
  accessibleLabel: string;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  active?: boolean;
  onClick: () => void;
}

function TopicGraphControlButton({
  accessibleLabel,
  label,
  children,
  disabled,
  pressed,
  active,
  onClick,
}: TopicGraphControlButtonProps) {
  // The rail stays narrow; names show in a tooltip after a deliberate hover,
  // like the Project Graph controls (issue 195).
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">
          <ControlButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={accessibleLabel}
            aria-pressed={pressed}
            className={cn(
              '!h-10 !w-10 !justify-center !p-0',
              'disabled:!pointer-events-none disabled:!bg-editor disabled:!text-[var(--vscode-icon-foreground)] disabled:!opacity-40',
              active && '!bg-list-active !text-[var(--vscode-list-activeSelectionForeground)]',
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:!size-4 [&_svg]:!max-h-none [&_svg]:!max-w-none [&_svg]:!fill-none">
              {children}
            </span>
          </ControlButton>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Renders one measured React Flow node using the shared Topic bubble model. */
function TopicBubbleNode({ data }: NodeProps<TopicFlowNode>) {
  const { bubble, corpusPresentation, plane, examplesShortcut } = data;
  const outerRadius = bubble.radius + 7;
  const diameter = outerRadius * 2;
  const tooltipPosition = bubble.position.x <= plane.width / 2 ? Position.Right : Position.Left;
  const matchColor = bubble.matchedWords.length > 0 ? topicMatchColor() : undefined;
  // A named Topic keeps its short label on the bubble, bold and
  // underlined so it reads as named; the tooltip shows the name.
  const { names } = useTopicNames();
  const display = topicNameDisplay(bubble.topic, names);
  return (
    <NodeTooltip className="size-full">
      <NodeTooltipTrigger
        data-testid={`topic-flow-node-${String(bubble.id)}`}
        data-topic-id={bubble.id}
        // Only the drawn circle takes the pointer (issue 314): the node box is
        // a square with room for the rings, so boxes of neighbouring or faded
        // bubbles used to catch the hover meant for a highlighted bubble.
        className={cn(
          'group pointer-events-none relative size-full',
          bubble.filteredOut && 'opacity-[0.18]',
        )}
        aria-hidden="true"
      >
        <svg width={diameter} height={diameter} className="block overflow-visible">
          {bubble.lassoed ? (
            <circle
              cx={outerRadius}
              cy={outerRadius}
              r={bubble.radius + 6}
              fill="none"
              stroke="#7c3aed"
              strokeWidth={2.5}
              strokeDasharray="5 3"
              pointerEvents="none"
              data-testid={`topic-lasso-ring-${String(bubble.id)}`}
            />
          ) : null}
          {bubble.selected ? (
            <circle
              cx={outerRadius}
              cy={outerRadius}
              r={bubble.radius + 4}
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              strokeOpacity={0.7}
              pointerEvents="none"
            />
          ) : null}
          <circle
            cx={outerRadius}
            cy={outerRadius}
            r={bubble.hovered && !bubble.filteredOut ? bubble.radius + 2 : bubble.radius}
            fill={bubble.fill}
            // Opacity shows how evenly the topic spreads across the colour-by
            // values; hover lifts it above that range, and selection is the
            // outline ring rather than opacity (issue 188).
            fillOpacity={bubble.hovered ? TOPIC_OPACITY_HOVER : bubble.fillOpacity}
            stroke={bubble.selected ? '#16a34a' : bubble.hovered ? '#3b82f6' : '#94a3b8'}
            strokeWidth={bubble.selected || bubble.hovered ? 2 : 1}
            // A faded bubble ignores the pointer, so the bubble under it can be hovered.
            pointerEvents={bubble.filteredOut ? 'none' : 'visiblePainted'}
            data-testid={`topic-bubble-circle-${String(bubble.id)}`}
            className={cn(
              'transition-[fill-opacity,stroke,stroke-width] duration-100',
              !bubble.filteredOut &&
                'group-hover:fill-opacity-[0.92] group-hover:stroke-focus group-hover:[stroke-width:2]',
            )}
          />
          <text
            x={outerRadius}
            y={outerRadius + 4}
            textAnchor="middle"
            fontSize={12}
            fill="#1e293b"
            fontWeight={display.name ? 700 : undefined}
            textDecoration={display.name ? 'underline' : undefined}
            className="pointer-events-none select-none"
          >
            {topicShortLabel(bubble.id)}
          </text>
          {bubble.shown ? (
            // The same eye as the Topic card whose examples are shown (issue 353).
            <g data-testid={`topic-shown-eye-${String(bubble.id)}`} pointerEvents="none">
              <circle
                cx={outerRadius + bubble.radius * 0.72}
                cy={outerRadius - bubble.radius * 0.72}
                r={9}
                fill="var(--vscode-button-background)"
                stroke="var(--vscode-editor-background)"
                strokeWidth={1.5}
              />
              <Eye
                x={outerRadius + bubble.radius * 0.72 - 6}
                y={outerRadius - bubble.radius * 0.72 - 6}
                width={12}
                height={12}
                color="var(--vscode-button-foreground)"
                aria-hidden="true"
              />
            </g>
          ) : null}
        </svg>
      </NodeTooltipTrigger>
      <NodeTooltipContent
        align={
          bubble.position.y < plane.height / 3
            ? 'start'
            : bubble.position.y > (plane.height * 2) / 3
              ? 'end'
              : 'center'
        }
        position={tooltipPosition}
        offset={12}
        role="tooltip"
        tabIndex={-1}
        data-testid={`topic-flow-tooltip-${String(bubble.id)}`}
        className="pointer-events-none w-[min(18rem,calc(100%-1rem))] rounded-md border border-surface-border bg-surface p-3 text-label-secondary text-surface-foreground"
      >
        <div className="text-body font-semibold">
          {display.name ?? topicLabel(bubble.topic.id)}
          {display.name ? ' ' : null}
          {display.name ? (
            <span className="ml-1.5 text-label-secondary font-normal text-description">
              {topicShortLabel(bubble.topic.id)}
            </span>
          ) : null}
        </div>
        {display.hint ? (
          <div className="text-label-secondary italic text-description">{display.hint}</div>
        ) : null}
        <div className="mt-1 max-h-36 overflow-hidden text-description">
          <ResponsiveWordCloud
            words={bubble.topic.representative_words.map((term) => ({
              text: term.word,
              value: term.occurrence_count,
              // Find topics matches: bold orange, as in the topic lists (issue 342).
              ...(bubble.matchedWords.includes(term.word) ? { color: matchColor, bold: true } : {}),
            }))}
            minWidth={180}
            aspectRatio={0.48}
          />
        </div>
        <span className="sr-only">
          {bubble.topic.representative_words
            .map((term) => `${term.word}, ${String(term.occurrence_count)} occurrences`)
            .join('; ')}
        </span>
        <div className="mt-2">
          <TopicSizeComposition
            sizes={bubble.topic.size}
            total={bubble.topic.total_size}
            topicId={bubble.topic.id}
            showLabels
            {...corpusPresentation}
          />
        </div>
        {examplesShortcut ? (
          <div className="mt-2 text-description">
            {bubble.shown ? 'Right-click to stop showing examples' : 'Right-click to show examples'}
          </div>
        ) : null}
      </NodeTooltipContent>
    </NodeTooltip>
  );
}

const TOPIC_NODE_TYPES = {
  topic: TopicBubbleNode,
} satisfies NodeTypes;

function drawLassoPath(canvas: HTMLCanvasElement, points: TopicGraphPoint[]) {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (points.length === 0) return;
  const first = points[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  if (points.length >= 3) {
    context.closePath();
    context.fillStyle = 'rgba(124, 58, 237, 0.12)';
    context.fill();
  }
  context.strokeStyle = 'rgba(124, 58, 237, 0.9)';
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.stroke();
}

/** Owns the pointer transaction for the official canvas-style freehand lasso. */
export function TopicLassoCanvas({
  enabled,
  bubbles,
  onComplete,
}: {
  enabled: boolean;
  bubbles: TopicBubbleModel[];
  onComplete: (topicIds: Set<number>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const pathRef = useRef<TopicGraphPoint[]>([]);
  const { getViewport } = useReactFlow<TopicFlowNode>();

  useEffect(() => {
    const pointFromEvent = (event: PointerEvent): TopicGraphPoint | null => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return null;
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const cancelGesture = () => {
      activePointerRef.current = null;
      pathRef.current = [];
      if (canvasRef.current) drawLassoPath(canvasRef.current, []);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return;
      const point = pointFromEvent(event);
      if (!point || !canvasRef.current) return;
      pathRef.current.push(point);
      drawLassoPath(canvasRef.current, pathRef.current);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return;
      const point = pointFromEvent(event);
      if (point) pathRef.current.push(point);
      const polygon = pathRef.current;
      activePointerRef.current = null;
      pathRef.current = [];
      if (canvasRef.current) drawLassoPath(canvasRef.current, []);
      if (polygon.length < 3) return;
      const matches = findTopicIdsInsideLasso(bubbles, polygon, getViewport());
      if (matches.size > 0) onComplete(matches);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (activePointerRef.current === event.pointerId) cancelGesture();
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', cancelGesture);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', cancelGesture);
      cancelGesture();
    };
  }, [bubbles, getViewport, onComplete]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      data-testid="topic-lasso-canvas"
      className="absolute inset-0 z-10 size-full cursor-crosshair touch-none"
      aria-label="Draw an additive lasso around topic bubbles"
      onPointerDown={(event) => {
        if (event.button !== 0 || activePointerRef.current !== null) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        activePointerRef.current = event.pointerId;
        pathRef.current = [{ x: event.clientX - bounds.left, y: event.clientY - bounds.top }];
        drawLassoPath(event.currentTarget, pathRef.current);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Window listeners remain authoritative when capture is unavailable.
        }
      }}
      onLostPointerCapture={(event) => {
        if (activePointerRef.current !== event.pointerId) return;
        activePointerRef.current = null;
        pathRef.current = [];
        drawLassoPath(event.currentTarget, []);
      }}
      onWheel={(event) => {
        if (activePointerRef.current !== null) event.preventDefault();
      }}
    />
  );
}

function TopicExportSvg({
  bubbles,
  viewport,
  width,
  height,
}: {
  bubbles: TopicBubbleModel[];
  viewport: Viewport;
  width: number;
  height: number;
}) {
  // Image and HTML downloads mark named Topics as the bubbles do.
  const { names } = useTopicNames();
  return (
    <svg
      data-topic-modeling-export="true"
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <rect width={width} height={height} fill="#ffffff" />
      <g
        transform={`translate(${String(viewport.x)} ${String(viewport.y)}) scale(${String(viewport.zoom)})`}
      >
        {bubbles.map((bubble) => (
          <g
            key={bubble.id}
            // The interactive HTML download finds each bubble by its topic (issue 279).
            data-topic-id={bubble.id}
            transform={`translate(${String(bubble.position.x)} ${String(bubble.position.y)})`}
            opacity={bubble.filteredOut ? 0.18 : undefined}
          >
            {bubble.lassoed ? (
              <circle
                r={bubble.radius + 6}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2.5}
                strokeDasharray="5 3"
              />
            ) : null}
            {bubble.selected ? (
              <circle
                r={bubble.radius + 4}
                fill="none"
                stroke="#16a34a"
                strokeWidth={2}
                strokeOpacity={0.7}
              />
            ) : null}
            <circle
              r={bubble.radius}
              fill={bubble.fill}
              fillOpacity={bubble.fillOpacity}
              stroke={bubble.selected ? '#16a34a' : '#94a3b8'}
              strokeWidth={bubble.selected ? 2 : 1}
            />
            <text
              textAnchor="middle"
              dy={4}
              fontSize={12}
              fill="#1e293b"
              {...(topicNameDisplay(bubble.topic, names).name
                ? { fontWeight: 700, textDecoration: 'underline' }
                : {})}
            >
              {topicShortLabel(bubble.id)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Renders the interactive React Flow topic plane and its native control toolbar. */
function TopicModelingFlowChartInner({
  bubbles,
  plane,
  onCanvasAspectChange,
  corpusPresentation,
  projectionKey,
  lassoMode,
  lassoFilterActive,
  exportDisabled,
  onToggleLassoMode,
  onClearLassoFilter,
  onAddLassoTopics,
  onDownload,
  onViewReady,
  onToggleTopicSelection,
  onToggleShownTopic,
}: Props) {
  const flowRef = useRef<HTMLDivElement | null>(null);
  const fittedViewportRef = useRef(true);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [paneSize, setPaneSize] = useState({ width: 1, height: 1 });
  const { fitView, getViewport, zoomIn, zoomOut } = useReactFlow<TopicFlowNode>();
  const flowStore = useStoreApi<TopicFlowNode>();
  // React Flow learns its pane size from a ResizeObserver or a window resize.
  // The macOS desktop webview sometimes delivers neither after the chart
  // mounts, leaving the size at zero so Fit did nothing until a page zoom
  // (which fires resize). Read the pane's size before every fit instead.
  const fitBubbles = useCallback(() => {
    const pane = flowRef.current?.querySelector<HTMLElement>('.react-flow');
    if (pane && pane.offsetWidth > 0 && pane.offsetHeight > 0) {
      const { width, height } = flowStore.getState();
      if (width !== pane.offsetWidth || height !== pane.offsetHeight) {
        flowStore.setState({ width: pane.offsetWidth, height: pane.offsetHeight });
      }
    }
    return fitView(FIT_VIEW_OPTIONS);
  }, [fitView, flowStore]);
  // A plain scroll scrolls the pane; the chart takes the wheel only while the
  // zoom key is held (issue 215). React Flow ignores the zoom key when page
  // scrolling is allowed, so scroll capture follows the key.
  const zoomKeyPressed = useKeyPress(CHART_ZOOM_KEY);
  const nodes: TopicFlowNode[] = bubbles.map((bubble) => {
    const diameter = (bubble.radius + 7) * 2;
    return {
      id: `topic-${String(bubble.id)}`,
      type: 'topic',
      position: bubble.position,
      data: {
        bubble,
        corpusPresentation,
        plane,
        examplesShortcut: onToggleShownTopic !== undefined,
      },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: bubble.selected ? 3 : bubble.lassoed ? 2 : 1,
      // The size is known, so React Flow need not measure the node. It hides
      // an unmeasured node, and a fit waits until every node is measured: in
      // the macOS desktop app the webview's ResizeObserver sometimes never
      // reported, so the chart stayed blank and Fit did nothing until a page
      // zoom made it measure again.
      width: diameter,
      height: diameter,
      measured: { width: diameter, height: diameter },
      // The square node box never takes the pointer; its circle does (issue 314).
      style: { width: diameter, height: diameter, pointerEvents: 'none' },
    };
  });

  useEffect(() => {
    if (nodes.length === 0) {
      onViewReady(projectionKey);
      return;
    }
    let cancelled = false;
    let frame: number | null = null;
    fittedViewportRef.current = true;
    const fitCommittedNodes = (attemptsRemaining: number) => {
      frame = requestAnimationFrame(() => {
        frame = null;
        void fitBubbles().then((didFit) => {
          if (cancelled) return;
          if (!didFit) {
            if (attemptsRemaining > 0) fitCommittedNodes(attemptsRemaining - 1);
            return;
          }
          setViewport(getViewport());
          onViewReady(projectionKey);
        });
      });
    };
    fitCommittedNodes(8);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [fitBubbles, getViewport, nodes.length, onViewReady, projectionKey]);

  const aspectCallbackRef = useRef(onCanvasAspectChange);
  useEffect(() => {
    aspectCallbackRef.current = onCanvasAspectChange;
  }, [onCanvasAspectChange]);

  // The bubbles are laid out again for the canvas's shape (issue 308): at
  // once on the first measurement, then once resizing has stopped.
  useEffect(() => {
    const element = flowRef.current;
    if (!element) return;
    let measured = false;
    let relayoutTimer: ReturnType<typeof setTimeout> | null = null;
    const reportAspect = (width: number, height: number) => {
      const drawableWidth = width - FIT_PADDING.left - FIT_PADDING.right;
      const drawableHeight = height - FIT_PADDING.top - FIT_PADDING.bottom;
      if (drawableWidth <= 0 || drawableHeight <= 0) return;
      const aspect = drawableWidth / drawableHeight;
      if (relayoutTimer !== null) clearTimeout(relayoutTimer);
      if (!measured) {
        measured = true;
        aspectCallbackRef.current?.(aspect);
        return;
      }
      relayoutTimer = setTimeout(() => {
        relayoutTimer = null;
        aspectCallbackRef.current?.(aspect);
      }, RELAYOUT_DELAY_MS);
    };
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      reportAspect(bounds.width, bounds.height);
    });
    observer.observe(element);
    const bounds = element.getBoundingClientRect();
    reportAspect(bounds.width, bounds.height);
    return () => {
      observer.disconnect();
      if (relayoutTimer !== null) clearTimeout(relayoutTimer);
    };
  }, []);

  // A new layout moves the bubbles: fit them again unless the user has
  // panned or zoomed.
  const planeKey = `${String(plane.width)}x${String(plane.height)}`;
  const fittedPlaneKeyRef = useRef(planeKey);
  useEffect(() => {
    if (fittedPlaneKeyRef.current === planeKey) return;
    fittedPlaneKeyRef.current = planeKey;
    if (!fittedViewportRef.current || nodes.length === 0) return;
    const frame = requestAnimationFrame(() => {
      void fitBubbles().then(() => {
        setViewport(getViewport());
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [fitBubbles, getViewport, nodes.length, planeKey]);

  useEffect(() => {
    const element = flowRef.current;
    if (!element) return;
    let frame: number | null = null;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      setPaneSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
      if (!fittedViewportRef.current || nodes.length === 0) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        void fitBubbles().then(() => {
          setViewport(getViewport());
        });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [fitBubbles, getViewport, nodes.length]);

  return (
    <div ref={flowRef} className="relative size-full">
      <ReactFlow<TopicFlowNode>
        nodes={nodes}
        edges={EMPTY_EDGES}
        nodeTypes={TOPIC_NODE_TYPES}
        nodeOrigin={NODE_ORIGIN}
        minZoom={0.05}
        maxZoom={4}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        panOnDrag={!lassoMode}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomActivationKeyCode={CHART_ZOOM_KEY}
        zoomOnPinch
        zoomOnDoubleClick
        preventScrolling={zoomKeyPressed}
        onNodeClick={(_event, node) => {
          if (!lassoMode && !node.data.bubble.filteredOut) {
            onToggleTopicSelection(node.data.bubble.id);
          }
        }}
        onNodeContextMenu={(event, node) => {
          // A faded bubble has no examples shortcut, like its hover card
          // (issue 353); the examples pane's close button still works.
          if (!onToggleShownTopic || lassoMode || node.data.bubble.filteredOut) return;
          event.preventDefault();
          onToggleShownTopic(node.data.bubble.id);
        }}
        onMoveStart={(event) => {
          if (event) fittedViewportRef.current = false;
        }}
        onMoveEnd={(_event, nextViewport) => {
          setViewport(nextViewport);
        }}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        attributionPosition="bottom-left"
        className="bg-surface"
      >
        <Controls
          orientation="vertical"
          position="top-left"
          showZoom={false}
          showFitView={false}
          showInteractive={false}
          className="overflow-hidden rounded-md border border-surface-border bg-editor"
          style={{ zIndex: 20 }}
          aria-label="Topic graph controls"
        >
          <TooltipProvider delayDuration={500} skipDelayDuration={300} disableHoverableContent>
            <TopicGraphControlButton
              accessibleLabel="Zoom in"
              label="Zoom in"
              onClick={() => {
                fittedViewportRef.current = false;
                void zoomIn();
              }}
            >
              <Plus aria-hidden="true" />
            </TopicGraphControlButton>
            <TopicGraphControlButton
              accessibleLabel="Zoom out"
              label="Zoom out"
              onClick={() => {
                fittedViewportRef.current = false;
                void zoomOut();
              }}
            >
              <Minus aria-hidden="true" />
            </TopicGraphControlButton>
            <TopicGraphControlButton
              accessibleLabel="Fit view"
              label="Fit view"
              onClick={() => {
                fittedViewportRef.current = true;
                void fitBubbles().then(() => {
                  setViewport(getViewport());
                });
              }}
            >
              <Scan aria-hidden="true" />
            </TopicGraphControlButton>
            <TopicGraphControlButton
              accessibleLabel={lassoMode ? 'Disable additive lasso' : 'Enable additive lasso'}
              label="Select topics"
              pressed={lassoMode}
              active={lassoMode}
              onClick={onToggleLassoMode}
            >
              <LassoSelect aria-hidden="true" />
            </TopicGraphControlButton>
            <TopicGraphControlButton
              accessibleLabel="Clear lasso filter"
              label="Clear filter"
              disabled={!lassoFilterActive}
              onClick={onClearLassoFilter}
            >
              <FilterX aria-hidden="true" />
            </TopicGraphControlButton>
            <TopicGraphControlButton
              accessibleLabel="Download chart"
              label="Download chart"
              disabled={exportDisabled}
              onClick={onDownload}
            >
              <Download aria-hidden="true" />
            </TopicGraphControlButton>
          </TooltipProvider>
        </Controls>
        <TopicLassoCanvas enabled={lassoMode} bubbles={bubbles} onComplete={onAddLassoTopics} />
      </ReactFlow>
      <TopicExportSvg
        bubbles={bubbles}
        viewport={viewport}
        width={paneSize.width}
        height={paneSize.height}
      />
    </div>
  );
}

export function TopicModelingFlowChart(props: Props) {
  return (
    <ReactFlowProvider>
      <TopicModelingFlowChartInner {...props} />
    </ReactFlowProvider>
  );
}
