import { useState } from 'react';
import { PanelRightClose, Pencil } from 'lucide-react';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { toast } from 'sonner';
import { getInvalidWorkspaceNameMessage } from '@/features/workspace/common/workspaceName';
import { useInlineRename } from '@/lib/rename/useInlineRename';
import HelpIcon from '@/components/help/HelpIcon';
import { ChangeProjectMenu } from './ChangeProjectMenu';

/**
 * Workspace graph toolbar used above the graph pane. It centralizes workspace
 * rename and help controls; graph actions live on the graph canvas.
 * Rendered by: WorkspaceView above the graph canvas.
 * Flow: read workspace identity, manage rename validation, then render header controls.
 *
 * ``onToggleCollapse`` renders the collapse button. The collapsed shell
 * returns before mounting this toolbar, so controls only model the live graph
 * view and carry no unreachable compact-mode branch.
 */
export function WorkspaceControls({ onToggleCollapse }: { onToggleCollapse?: () => void } = {}) {
  const { currentWorkspace } = useWorkspaceData();
  const { renameWorkspace } = useWorkspaceActions();

  // The name the open rename box started from; a changed Project closes it.
  const [renamingName, setRenamingName] = useState<string>();
  const currentWorkspaceName = currentWorkspace?.name ?? '';
  const isEditing = renamingName !== undefined && renamingName === currentWorkspaceName;

  /** Called by: the WorkspaceControls Rename button onClick prop. */
  const startRename = () => {
    if (!currentWorkspaceName) {
      return;
    }
    setRenamingName(currentWorkspaceName);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-surface-border bg-surface text-foreground hover:bg-panel"
          aria-label="Collapse Project panel"
          title="Collapse"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      )}
      <h3 className="text-body font-medium text-foreground">Project Graph</h3>
      <HelpIcon
        targetKey="ui.workspace-graph-view"
        label="Project Graph"
        className="h-5 w-5 text-description"
      />
      <span className="text-description">|</span>

      {isEditing ? (
        <ProjectNameInput
          name={currentWorkspaceName}
          onSubmit={renameWorkspace}
          onClose={() => {
            setRenamingName(undefined);
          }}
        />
      ) : (
        <span className="text-body font-semibold text-foreground">
          {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- show placeholder for an empty name, not only null/undefined */}
          {currentWorkspace?.name || 'No Project'}
        </span>
      )}

      {currentWorkspace && (
        <button
          className="inline-flex items-center gap-1 text-label-secondary text-description hover:text-foreground px-2 py-1 border rounded-sm"
          onClick={startRename}
          title="Rename"
          aria-label="Rename Project"
        >
          <Pencil className="h-3 w-3" />
          Rename
        </button>
      )}

      {/* Switch projects without going to the Data Loader (issue 192). */}
      <ChangeProjectMenu />
    </div>
  );
}

/** The Project name rename box, following the shared rename rule (issue 210). */
function ProjectNameInput({
  name,
  onSubmit,
  onClose,
}: {
  name: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { inputProps } = useInlineRename({
    original: name,
    onSubmit: async (next) => {
      try {
        await onSubmit(next);
        return true;
      } catch (error) {
        const message = getInvalidWorkspaceNameMessage(error);
        if (!message) throw error;
        toast.error(message);
        return false;
      }
    },
    onClose,
    failureTitle: "Couldn't rename the Project.",
  });
  return (
    <input
      {...inputProps}
      className="px-2 py-1 border rounded-sm text-body"
      aria-label="Project name"
    />
  );
}
