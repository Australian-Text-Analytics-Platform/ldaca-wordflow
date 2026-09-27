import type { ReactNode } from 'react';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleOff,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { tutorialIndexTarget } from '@/tutorials/documentationRegistry';
import HelpIcon from '@/components/help/HelpIcon';
import { TOOL_DEFINITIONS } from '@/features/tools/toolRegistry';
import type { ToolId } from '@/features/tools/toolIds';
import { ResizeHandle } from './ResizeHandle';
import { useStackedSplits } from './sidebar/useStackedSplits';
type SectionKey = 'tools' | 'nodes' | 'tasks';

/** Ordered sidebar section ids consumed by `useStackedSplits` and rendering loops. */
const SECTION_KEYS: SectionKey[] = ['tools', 'nodes', 'tasks'];
/** Human labels for collapsible sidebar sections shown in the section headers. */
const SECTION_TITLES: Record<SectionKey, string> = {
  tools: 'Tools',
  nodes: 'Data Blocks',
  tasks: 'Tasks',
};
/** Help target ids paired with sidebar section headers for contextual docs. */
const SECTION_HELP_KEYS: Record<SectionKey, string> = {
  tools: 'ui.tool-choice',
  nodes: 'ui.data-selection',
  tasks: 'ui.task-centre',
};
/** Minimum sidebar section height passed to the stacked split resize hook. */
const MIN_SECTION_HEIGHT = 120;
/** Initial task section share sized for roughly two compact task rows. */
const TASKS_SECTION_DEFAULT_RATIO = 0.18;
/** Task section minimum sized for one compact task row plus its section header. */
const TASKS_SECTION_MIN_HEIGHT = 76;
/** Initial section ratios keep Tasks compact while preserving space for navigation and data blocks. */
const INITIAL_SECTION_RATIOS: Record<SectionKey, number> = {
  tools: (1 - TASKS_SECTION_DEFAULT_RATIO) / 2,
  nodes: (1 - TASKS_SECTION_DEFAULT_RATIO) / 2,
  tasks: TASKS_SECTION_DEFAULT_RATIO,
};
/** Per-section minimum heights let the compact task stream shrink independently of larger sections. */
const SECTION_MIN_HEIGHTS: Partial<Record<SectionKey, number>> = {
  tasks: TASKS_SECTION_MIN_HEIGHT,
};

export function SidebarView({
  header,
  toolsContent,
  nodesContent,
  tasksContent,
  nodeCount,
  selectedCount,
  clearSelection,
  visibleTools,
  setToolHidden,
  connection,
  onFeedback,
}: {
  onFeedback: () => void;
  header?: ReactNode;
  toolsContent: ReactNode;
  nodesContent: ReactNode;
  tasksContent: ReactNode;
  nodeCount: number;
  selectedCount: number;
  clearSelection: () => void;
  visibleTools: ToolId[];
  setToolHidden: (tool: ToolId, hidden: boolean) => void;
  connection?: { connected: boolean; connecting: boolean; error: string | null };
}) {
  const openDocument = useUIStore((s) => s.openDocument);
  const {
    containerRef: sectionsContainerRef,
    isCollapsed,
    toggleSection,
    getSectionFlexStyle,
    assignSectionScrollRef,
    resizingLowerKey,
    handleResizeStart,
  } = useStackedSplits<SectionKey>(SECTION_KEYS, {
    minSectionPx: MIN_SECTION_HEIGHT,
    sectionMinPx: SECTION_MIN_HEIGHTS,
    initialRatios: INITIAL_SECTION_RATIOS,
  });

  return (
    <SidebarRoot
      data-testid="sidebar-container"
      className="@container/sidebar pt-0! pr-0! [&_[data-slot=sidebar-inner]]:overflow-hidden [&_[data-slot=sidebar-inner]]:rounded-lg [&_[data-slot=sidebar-inner]]:border [&_[data-slot=sidebar-inner]]:border-sidebar-border [&_[data-slot=sidebar-inner]]:bg-sidebar"
    >
      <div className="flex h-full min-h-0 w-full flex-col">
        {header}

        <SidebarContent className="flex-1 overflow-hidden border-y border-surface-border/60">
          <div ref={sectionsContainerRef} className="flex h-full flex-col overflow-hidden">
            {SECTION_KEYS.map((key, index) => {
              const title = SECTION_TITLES[key];
              const collapsed = isCollapsed(key);
              const previousKey = SECTION_KEYS[index - 1];
              const resizeDisabled = previousKey ? isCollapsed(previousKey) || collapsed : true;
              const TwistieIcon = collapsed ? ChevronRight : ChevronDown;
              return (
                <div
                  key={key}
                  className={cn(
                    'relative flex min-h-0 flex-col',
                    index > 0 && 'border-t border-surface-border/60',
                  )}
                  style={getSectionFlexStyle(key)}
                >
                  {index > 0 && previousKey ? (
                    <ResizeHandle
                      orientation="horizontal"
                      variant="line"
                      isDragging={resizingLowerKey === key}
                      disabled={resizeDisabled}
                      className="absolute -top-1 right-0 left-0 z-10"
                      aria-label={`Resize ${title}`}
                      onPointerDown={(event) => {
                        handleResizeStart(previousKey, key, event);
                      }}
                      title="Drag to resize"
                    />
                  ) : null}
                  <div
                    data-sidebar-section={key}
                    data-testid={`sidebar-section-${key}`}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <div>
                      <div
                        data-testid={`sidebar-section-header-${key}`}
                        className="group/sidebar-section-header mx-1 flex items-center rounded-md transition-colors hover:bg-list-hover focus-within:bg-list-hover"
                      >
                        <button
                          type="button"
                          data-guidance={key === 'nodes' ? 'data-blocks' : undefined}
                          className="flex min-w-0 flex-1 items-center justify-between px-2 py-1.5 text-label-secondary font-semibold uppercase tracking-wide text-description"
                          onClick={() => {
                            toggleSection(key);
                          }}
                          aria-expanded={!collapsed}
                        >
                          <span className="flex min-w-0 items-center gap-1">
                            <TwistieIcon
                              data-testid={`sidebar-section-twistie-${key}`}
                              className="h-4 w-4 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{title}</span>
                          </span>
                          {key === 'tasks' && connection && (
                            <div className="flex items-center gap-2 text-[11px] text-description">
                              <Circle
                                data-testid="tasks-connection-indicator"
                                className={cn('h-3 w-3', {
                                  'fill-[var(--vscode-charts-green)] text-[var(--vscode-charts-green)]':
                                    connection.connected,
                                  'text-warning fill-warning animate-pulse': connection.connecting,
                                  'text-description fill-description':
                                    !connection.connected &&
                                    !connection.connecting &&
                                    !connection.error,
                                  'fill-error text-error': !!connection.error,
                                })}
                              />
                            </div>
                          )}
                        </button>
                        {key === 'nodes' && (
                          <div className="flex items-center gap-2 text-[11px] text-description">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-description"
                                  aria-label="Clear selection"
                                  disabled={selectedCount === 0}
                                  onClick={clearSelection}
                                >
                                  <CircleOff
                                    data-testid="clear-selection-icon"
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="right">Clear</TooltipContent>
                            </Tooltip>
                            <span className="font-semibold text-foreground/80">
                              {selectedCount > 0
                                ? `${selectedCount.toString()}/${nodeCount.toString()}`
                                : nodeCount.toString()}
                            </span>
                          </div>
                        )}
                        <HelpIcon
                          targetKey={SECTION_HELP_KEYS[key]}
                          label={title}
                          className="h-5 w-5 shrink-0 text-description"
                        />
                        {key === 'tools' && (
                          <div className="pr-1.5">
                            <DropdownMenu>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-description"
                                      aria-label="Edit visible tools"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="right">Edit visible tools</TooltipContent>
                              </Tooltip>
                              <DropdownMenuContent align="end" className="w-56">
                                {TOOL_DEFINITIONS.filter(({ id }) => id !== 'data-loader').map(
                                  ({ id, label }) => {
                                    const checked = visibleTools.includes(id);
                                    return (
                                      <DropdownMenuCheckboxItem
                                        key={id}
                                        checked={checked}
                                        onSelect={(event) => {
                                          event.preventDefault();
                                          setToolHidden(id, checked);
                                        }}
                                      >
                                        {label}
                                      </DropdownMenuCheckboxItem>
                                    );
                                  },
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex-1 overflow-hidden transition-[max-height] duration-200',
                        collapsed ? 'max-h-0' : 'max-h-full',
                      )}
                    >
                      {!collapsed && (
                        <div className="flex h-full flex-col overflow-hidden">
                          <div
                            ref={(node) => {
                              assignSectionScrollRef(key, node);
                            }}
                            className="flex h-full min-h-0 flex-col overflow-y-auto scrollbar-none px-2 py-2 text-body"
                          >
                            {key === 'tools' && toolsContent}
                            {key === 'nodes' && nodesContent}
                            {key === 'tasks' && tasksContent}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SidebarContent>

        <SidebarFooter
          data-testid="sidebar-help-feedback"
          className="shrink-0 space-y-2 overflow-hidden px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <div className="flex flex-1 flex-col gap-2 @min-[208px]/sidebar:flex-row">
              <Button
                variant="ghost"
                className="flex-1 justify-center"
                onClick={() => {
                  openDocument(tutorialIndexTarget);
                }}
              >
                <BookOpen className="h-4 w-4" />
                <span>Help</span>
              </Button>
              <Button
                variant="ghost"
                className="flex-1 justify-center"
                onClick={() => {
                  onFeedback();
                }}
              >
                <MessageSquare className="h-4 w-4" />
                <span>Feedback</span>
              </Button>
            </div>
          </div>
        </SidebarFooter>
      </div>

      <SidebarRail />
    </SidebarRoot>
  );
}
