import { PanelRightClose } from 'lucide-react';
import HelpIcon from '@/components/help/HelpIcon';
import { SearchableSelect } from '@/components/ui/searchable-select';

/** Shared graph header. Document identity belongs to the titlebar and server project manager. */
export function ProjectControlsView({
  onToggleCollapse,
  names = [],
  activeName = '',
  onSelect,
}: {
  onToggleCollapse?: () => void;
  names?: string[];
  activeName?: string;
  onSelect?: (name: string) => void;
} = {}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-surface-border bg-surface text-foreground hover:bg-panel"
          aria-label="Collapse project panel"
          title="Collapse"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      )}
      <h3 className="text-body font-medium text-foreground">Editor</h3>
      {onSelect && (
        <div className="min-w-24 flex-1">
          <SearchableSelect
            ariaLabel="Choose Data Block"
            placeholder="Choose Data Block"
            value={activeName}
            options={[...names]
              .sort((a, b) => a.localeCompare(b))
              .map((name) => ({ value: name, label: name }))}
            onChange={onSelect}
          />
        </div>
      )}
      <HelpIcon
        targetKey="ui.project-graph-view"
        label="Editor help"
        className="h-5 w-5 text-description"
      />
    </div>
  );
}
