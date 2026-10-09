import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InsetCard } from './InsetCard';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { ResizeHandle } from './ResizeHandle';

/** Graph or Editor above a collapsible Data View. Ratios live only until reload. */
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
  const [tableCollapsed, setTableCollapsed] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const {
    containerRef,
    value: ratio,
    isDragging,
    splitterProps,
  } = useResizableSplit({
    defaultValue: 0.5,
    min: 0.2,
    max: 0.8,
    onLiveUpdate: (value) => {
      if (top.current) top.current.style.flexBasis = `${String(value * 100)}%`;
      if (bottom.current) bottom.current.style.flexBasis = `${String((1 - value) * 100)}%`;
    },
  });
  if (collapsed)
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute top-4.5 right-0 z-30 inline-flex h-7 w-7 items-center justify-center rounded-l-full border border-surface-border bg-surface text-foreground"
        aria-label="Expand right panel"
        title="Expand right panel"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
    );
  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div
        ref={top}
        className="flex min-h-30 flex-1 flex-col"
        style={{ flexBasis: hasTable && !tableCollapsed ? `${String(ratio * 100)}%` : '100%' }}
      >
        <InsetCard className="flex-1 p-2 pt-0 pl-0 max-md:pl-2 @max-[639px]/project-shell:pl-2">
          <div className="shrink-0 border-b border-surface-border bg-panel p-2">{controls}</div>
          <div className="min-h-0 flex-1">{graph}</div>
        </InsetCard>
      </div>
      {hasTable && (
        <>
          {!tableCollapsed && (
            <ResizeHandle
              orientation="horizontal"
              isDragging={isDragging}
              aria-label="Resize graph and data panels"
              title="Drag or use arrow keys to resize"
              {...splitterProps}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 justify-start"
            aria-expanded={!tableCollapsed}
            onClick={() => setTableCollapsed(!tableCollapsed)}
          >
            {tableCollapsed ? <ChevronUp /> : <ChevronDown />}Data View
          </Button>
          <div
            ref={bottom}
            data-testid="project-data-overlay"
            className="min-h-30 flex-1"
            hidden={tableCollapsed}
            style={{ flexBasis: `${String((1 - ratio) * 100)}%` }}
          >
            <InsetCard className="h-full p-2 pt-0 pl-0 max-md:pl-2 @max-[639px]/project-shell:pl-2">
              <div className="min-h-0 flex-1">{table}</div>
            </InsetCard>
          </div>
        </>
      )}
    </div>
  );
}
