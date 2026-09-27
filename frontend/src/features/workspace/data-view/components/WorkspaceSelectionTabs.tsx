import { Check, ChevronDown } from 'lucide-react';

import HelpIcon from '@/components/help/HelpIcon';
import { EditorTabs, type EditorTabItem } from '@/components/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkspaceSelectionTabsState } from '../hooks/useWorkspaceDataTable';

type WorkspaceSelectionTabsProps = WorkspaceSelectionTabsState;

/**
 * The Data Editor's title row: the title, one tab per selected Data Block, and
 * a list of all tabs for quick switching (issue 206).
 * Rendered by: WorkspaceDataTableFeature component.
 * Flow: reuse the shared `EditorTabs` strip (drag to reorder, close, and
 * double-click the active tab to rename its Data Block); the list at the right
 * end shows every tab alphabetically.
 */
export const WorkspaceSelectionTabs = ({
  shouldShowTabs,
  tabs,
  onTabChange,
  onTabClose,
  onTabReorder,
  onTabRename,
}: WorkspaceSelectionTabsProps) => {
  if (!shouldShowTabs) {
    return null;
  }

  const items: EditorTabItem[] = tabs.map((tab) => ({ id: tab.id, title: tab.label }));
  const activeTabId = tabs.find((tab) => tab.isActive)?.id ?? null;
  const sortedTabs = tabs.toSorted((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true }),
  );

  return (
    <div className="flex shrink-0 items-end gap-1 border-b border-surface-border bg-panel pl-2">
      <div className="flex shrink-0 items-center gap-1 self-center pt-[8px]">
        <h3 className="text-body font-medium text-foreground">Data Editor</h3>
        <HelpIcon
          targetKey="ui.data-viewer"
          label="Data Editor"
          className="h-5 w-5 shrink-0 text-description"
        />
      </div>
      <EditorTabs
        className="min-w-0 flex-1"
        aria-label="Data Block tabs"
        tabs={items}
        activeTabId={activeTabId}
        onActivate={onTabChange}
        onClose={onTabClose}
        onReorder={onTabReorder}
        onRename={onTabRename}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="All Data Block tabs"
            title="All tabs"
            className="mr-1 mb-[4px] inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-description hover:bg-list-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-focus"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
          {sortedTabs.map((tab) => (
            <DropdownMenuItem
              key={tab.id}
              onSelect={() => {
                if (!tab.isActive) onTabChange(tab.id);
              }}
            >
              <Check
                className={tab.isActive ? 'size-3.5 shrink-0' : 'size-3.5 shrink-0 opacity-0'}
                aria-hidden="true"
              />
              <span className="truncate">{tab.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
