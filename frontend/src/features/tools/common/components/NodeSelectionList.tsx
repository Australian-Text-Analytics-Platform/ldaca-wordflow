import { TruncatedTooltip } from './TruncatedTooltip';
import { NodeInputCardContext } from './nodeInputCardContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React, { useEffect, useRef } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';

export interface NodeSelectionRenderArgs {
  node: NodeMetadata;
  nodeId: string;
  index: number;
  color: string;
}

export interface UnavailableNodeSelection {
  id: string;
  name: string;
  column?: string;
}

export type NodeSelectionItem =
  | { kind: 'available'; id: string; node: NodeMetadata }
  | { kind: 'unavailable'; id: string; selection: UnavailableNodeSelection };

export interface NodeSelectionListProps {
  items: NodeSelectionItem[];
  palette: string[];
  nodeColors?: Record<string, string>;
  maxCompare: number;
  /** When provided, each card shows an × button that removes that node from the inputs. */
  onRemoveNode?: (nodeId: string) => void;
  renderHeaderControl?: (args: NodeSelectionRenderArgs) => React.ReactNode;
  renderNodeBody?: (args: NodeSelectionRenderArgs) => React.ReactNode;
  renderExtraNodeContent?: (args: NodeSelectionRenderArgs) => React.ReactNode;
  getNodeTitle?: (node: NodeMetadata, nodeId: string, index: number) => string;
  emptyState?: React.ReactNode;
  className?: string;
  cardClassName?: string;
}

/**
 * Displays the selected analysis data blocks as horizontally scrollable cards,
 * with feature-provided per-node content slots. Each card is assigned a stable
 * palette colour by position so chart legends and metadata slots stay
 * consistent; callers can use the render slots to place matching controls in
 * the card body.
 * Used by: NodeInputsPanel and shared node-selection tests.
 */
export function NodeSelectionList({
  items,
  palette,
  nodeColors,
  maxCompare,
  onRemoveNode,
  renderHeaderControl,
  renderNodeBody,
  renderExtraNodeContent,
  getNodeTitle = (node) => node.name,
  emptyState,
  className,
  cardClassName,
}: NodeSelectionListProps) {
  // Auto-scroll to the right end when the selection changes so the
  // most recently selected data blocks are always visible.
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodeIdsKey = items.map((item) => item.id).join('|');
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [nodeIdsKey]);

  if (!items.length) {
    return emptyState ? <>{emptyState}</> : null;
  }

  const isOverflowed = items.length > maxCompare;

  return (
    <TooltipProvider delayDuration={0}>
      <NodeInputCardContext value={true}>
        <ScrollArea
          data-testid="node-selection-scroll-area"
          viewportRef={scrollRef}
          scrollbars={isOverflowed ? 'horizontal' : 'none'}
          type="always"
          className={cn('@container/node-selection w-full', className)}
        >
          <div
            className={cn(
              'flex gap-2.5 px-3 pt-0',
              isOverflowed ? 'pb-4' : 'flex-col pb-2 @min-[640px]/node-selection:flex-row',
            )}
          >
            {items.map((item, index) => {
              const nodeId = item.id;
              const node = item.kind === 'available' ? item.node : null;
              const unavailable = item.kind === 'unavailable' ? item.selection : null;
              const fallbackColor = palette[index % palette.length] ?? '#000000';
              const color = nodeColors?.[nodeId] ?? fallbackColor;
              const title = node
                ? getNodeTitle(node, nodeId, index)
                : (unavailable?.name ?? nodeId);
              const headerControl = node && renderHeaderControl?.({ node, nodeId, index, color });
              const body = node && renderNodeBody?.({ node, nodeId, index, color });
              const extra = node && renderExtraNodeContent?.({ node, nodeId, index, color });
              const hasBody = Boolean(unavailable) || Boolean(body) || Boolean(extra);
              return (
                <Card
                  key={nodeId}
                  style={
                    {
                      '--selection-basis': `calc((100% - ${String((Math.max(1, maxCompare) - 1) * 0.625)}rem) / ${String(Math.max(1, maxCompare))})`,
                    } as React.CSSProperties
                  }
                  role={unavailable ? 'group' : undefined}
                  aria-label={unavailable ? `${title} unavailable` : undefined}
                  className={cn(
                    '@container/input-card border border-surface-border/60 bg-surface transition-colors',
                    isOverflowed
                      ? 'min-w-0 flex-none basis-full @min-[640px]/node-selection:basis-[var(--selection-basis)]'
                      : 'flex-1 min-w-0',
                    unavailable && 'border-warning bg-warning-background',
                    cardClassName,
                  )}
                >
                  <div
                    className={cn(
                      'flex min-w-0 items-center gap-2 bg-panel px-2 py-1',
                      hasBody ? 'rounded-t-lg' : 'rounded-lg',
                    )}
                    data-testid="node-input-card-header"
                    style={
                      headerControl
                        ? {
                            backgroundColor: `color-mix(in srgb, ${color} 14%, var(--vscode-editor-background))`,
                          }
                        : undefined
                    }
                  >
                    <TruncatedTooltip text={title}>
                      <span
                        tabIndex={0}
                        className="min-w-0 flex-1 truncate text-body font-semibold leading-9 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        {title}
                      </span>
                    </TruncatedTooltip>
                    {headerControl}
                    {onRemoveNode && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Remove ${title}`}
                            onClick={() => {
                              onRemoveNode(nodeId);
                            }}
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-label-secondary hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Remove {title}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {hasBody && (
                    <div
                      className="flex min-w-0 flex-wrap items-center gap-2 p-2"
                      data-testid="node-input-card-content"
                    >
                      {unavailable ? (
                        <div className="min-w-0 basis-full space-y-2">
                          <div
                            role="status"
                            className="flex items-start gap-2 rounded-md border border-warning bg-warning-background p-2 text-body-secondary leading-snug text-warning"
                          >
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <span>
                              This Data Block no longer exists in the Project and cannot be used for
                              a new run.
                            </span>
                          </div>
                          {unavailable.column && (
                            <div className="text-label-secondary text-description">
                              Selected column:{' '}
                              <span className="wrap-break-word font-medium text-foreground">
                                {unavailable.column}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {body}
                          {extra}
                        </>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </NodeInputCardContext>
    </TooltipProvider>
  );
}
