import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { InsetCard } from './InsetCard';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { ResizeHandle } from './ResizeHandle';
/**
 * Full-height graph with a resizable table overlay anchored to the bottom.
 * Showing or resizing the table never changes the graph canvas or viewport.
 * The resize hook updates the overlay directly during dragging.
 *
 * ``collapsed`` (from ProjectView): when true, the panel is completely
 * collapsed into a slim vertical handle with an expand button on the right.
 * ``onToggleCollapse`` toggles that mode.
 * When the preview closes, retain the table until its exit animation finishes. Its
 * saved size is retained for when a preview is opened again.
 */
export function ProjectPanels({
  controls,
  graph,
  table,
  collapsed = false,
  onToggleCollapse,
}: {
  controls: ReactNode;
  graph: ReactNode;
  table: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const hasTable = Boolean(table);
  const [retainedTable, setRetainedTable] = useState(table);
  if (hasTable && table !== retainedTable) setRetainedTable(table);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hasTable) return;
    let cancelled = false;
    // Wait for the CSS exit, or remove immediately when reduced motion disables it.
    const animations = bottomRef.current?.getAnimations() ?? [];
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) setRetainedTable(null);
    });
    return () => {
      cancelled = true;
    };
  }, [hasTable]);
  const {
    containerRef,
    value: ratio,
    isDragging,
    splitterProps,
  } = useResizableSplit({
    defaultValue: 0.5,
    min: 0.2,
    max: 0.8,
    persistKey: 'ldaca.layout.projectGraphRatio',
    /**
     * Applies drag feedback directly to panes so graph/table consumers avoid render churn mid-resize.
     */
    onLiveUpdate: (next) => {
      if (!hasTable) return;
      if (bottomRef.current) bottomRef.current.style.height = `${String((1 - next) * 100)}%`;
    },
  });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute top-4.5 right-0 z-30 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-l-full rounded-r-none border border-surface-border bg-surface text-foreground transition-all hover:bg-panel active:scale-95"
        aria-label="Expand right panel"
        title="Expand right panel"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
    );
  }

  // Clip without a scroll container: focusing the animated overlay must not scroll the graph.
  return (
    <div className="relative h-full overflow-clip bg-transparent" ref={containerRef}>
      <InsetCard className="relative isolate h-full p-2 pt-0 pl-0 max-md:pl-2 @max-[639px]/project-shell:pl-2">
        <div className="p-2 bg-panel border-b border-surface-border shrink-0">{controls}</div>
        <div className="flex-1 min-h-0">{graph}</div>
      </InsetCard>

      {retainedTable && (
        <div
          ref={bottomRef}
          data-testid="project-data-overlay"
          data-state={hasTable ? 'open' : 'closed'}
          inert={!hasTable}
          className="absolute inset-x-0 bottom-0 z-10 flex min-h-30 flex-col motion-safe:data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-safe:data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:fill-mode-forwards duration-200 ease-out transition-none"
          style={{ height: `${String((1 - ratio) * 100)}%` }}
        >
          <ResizeHandle
            orientation="horizontal"
            variant="line"
            isDragging={isDragging}
            className="absolute -top-1 right-2 left-0 z-20 max-md:left-2 @max-[639px]/project-shell:left-2"
            title="Drag to resize"
            aria-label="Resize graph and data panels"
            {...splitterProps}
          />

          <InsetCard className="flex-1 p-2 pt-0 pl-0 max-md:pl-2 @max-[639px]/project-shell:pl-2">
            <div className="flex-1 min-h-0">{retainedTable}</div>
          </InsetCard>
        </div>
      )}
    </div>
  );
}
