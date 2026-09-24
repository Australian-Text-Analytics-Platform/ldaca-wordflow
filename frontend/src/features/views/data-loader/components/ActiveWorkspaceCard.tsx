import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import HelpIcon from '@/components/help/HelpIcon';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { formatTimestamp } from '../utils/format';
import type { WorkspaceSummary } from '@/api';

export interface ActiveWorkspaceCardProps {
  currentWorkspace: WorkspaceSummary | null;
  nodeCount: number;
  busy: boolean;
  onCreate: (name: string, description: string) => Promise<boolean>;
  onRename: (value: string) => Promise<void> | void;
  onUpdateDescription: (value: string) => Promise<void> | void;
}

interface ActiveWorkspaceControlsProps {
  currentWorkspace: WorkspaceSummary;
  nodeCount: number;
  busy: boolean;
  onRename: (value: string) => Promise<void> | void;
  onUpdateDescription: (value: string) => Promise<void> | void;
}

interface CreateWorkspaceFormProps {
  onCreate: (name: string, description: string) => Promise<boolean>;
}

/**
 * Builds the React key used for editable active-workspace drafts. The card
 * remounts the active controls when the selected workspace or persisted
 * name/description changes, which replaces the previous render-time sync state.
 * Used by: ActiveWorkspaceCard because the shell owns mode selection while the
 * active controls own only their local draft inputs.
 */
function getActiveWorkspaceDraftKey(workspace: WorkspaceSummary) {
  return [workspace.id, workspace.name, workspace.description].join('\n');
}

/**
 * Renders the active-workspace/create-workspace panel. `DataLoaderFeature`
 * uses it to keep workspace creation and currently loaded workspace controls
 * in one card while delegating persistence to workspace hooks.
 * Rendered by: DataLoaderFeature module.
 * Flow: sync local editable drafts to the active workspace identity, choose create vs
 * active-workspace controls, gate unsafe unloads while tasks run, then forward
 * save/rename/create events to parent actions.
 */
export function ActiveWorkspaceCard({
  currentWorkspace,
  nodeCount,
  busy,
  onCreate,
  onRename,
  onUpdateDescription,
}: ActiveWorkspaceCardProps) {
  return (
    <Card
      data-testid={currentWorkspace ? 'active-workspace-card' : 'create-workspace-card'}
      data-guidance={currentWorkspace ? 'active-workspace' : 'workspace-setup'}
      className="flex h-full flex-col overflow-hidden"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {currentWorkspace ? 'Active project' : 'Create project'}
          {currentWorkspace ? (
            <HelpIcon
              targetKey="data-loader.active-workspace.section"
              label="Active project overview"
              tooltip="Rename the open project or update its description. New data blocks are added here, and your work is saved automatically."
            />
          ) : (
            <HelpIcon
              targetKey="data-loader.create-workspace.name"
              label="Create project overview"
              tooltip="Create a new project before uploading files or adding data blocks. Add an optional description if you want to capture its purpose."
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {currentWorkspace ? (
          <ActiveWorkspaceControls
            key={getActiveWorkspaceDraftKey(currentWorkspace)}
            currentWorkspace={currentWorkspace}
            nodeCount={nodeCount}
            busy={busy}
            onRename={onRename}
            onUpdateDescription={onUpdateDescription}
          />
        ) : (
          <CreateWorkspaceForm onCreate={onCreate} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Owns editable controls for the loaded workspace. The parent remounts this
 * component when persisted workspace details change, so its local drafts stay
 * simple and do not need cross-prop synchronization state.
 * Used by: ActiveWorkspaceCard because active controls are mutually exclusive
 * from the create form but share the same card shell.
 * Flow: initialize drafts from the persisted workspace, forward rename and
 * description updates, and gate unload while workspace mutations or analysis
 * tasks are still active.
 */
function ActiveWorkspaceControls({
  currentWorkspace,
  nodeCount,
  busy,
  onRename,
  onUpdateDescription,
}: ActiveWorkspaceControlsProps) {
  const [renameValue, setRenameValue] = useState(currentWorkspace.name);
  const [descriptionValue, setDescriptionValue] = useState(currentWorkspace.description);
  const normalizedCurrentDescription = currentWorkspace.description.trim();
  const normalizedDescriptionValue = descriptionValue.trim();

  return (
    <>
      <div className="rounded-md border border-surface-border/60 bg-panel/30 px-4 py-3 text-body">
        <div className="flex flex-wrap items-center gap-2 text-body font-semibold text-foreground">
          {currentWorkspace.name}
          <Badge>
            {nodeCount} data block{nodeCount === 1 ? '' : 's'}
          </Badge>
        </div>
        <div className="mt-1 text-label-secondary text-description">
          Updated {formatTimestamp(currentWorkspace.modified_at)} | Created{' '}
          {formatTimestamp(currentWorkspace.created_at)}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="rename-workspace">Rename project</Label>
          <HelpIcon targetKey="data-loader.rename-workspace.input" label="Rename project input" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="rename-workspace"
            value={renameValue}
            onChange={(event) => {
              setRenameValue(event.target.value);
            }}
            placeholder="Enter new name"
            disabled={busy}
          />
          <Button onClick={() => void onRename(renameValue.trim())} disabled={!renameValue.trim()}>
            Rename
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="workspace-description">Project description</Label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="workspace-description"
            aria-label="Project description"
            value={descriptionValue}
            onChange={(event) => {
              setDescriptionValue(event.target.value);
            }}
            placeholder="Enter project description"
            disabled={busy}
          />
          <Button
            onClick={() => void onUpdateDescription(descriptionValue.trim())}
            disabled={busy || normalizedDescriptionValue === normalizedCurrentDescription}
          >
            Update description
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Owns the new-workspace draft fields. It lives outside ActiveWorkspaceCard so
 * create-mode state cannot mix with active-workspace rename/description state.
 * Used by: ActiveWorkspaceCard when no workspace is selected.
 * Flow: collect and trim the draft name/description, call the parent create
 * action, then clear drafts only when that action reports success.
 */
function CreateWorkspaceForm({ onCreate }: CreateWorkspaceFormProps) {
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');

  /**
   * Submits the create form and clears local inputs only after the parent
   * workspace action reports success.
   * Called by: CreateWorkspaceForm button clicks because the form owns draft
   * cleanup but DataLoaderFeature owns the actual workspace mutation.
   */
  const handleCreate = async () => {
    const ok = await onCreate(newWorkspaceName.trim(), newWorkspaceDescription.trim());
    if (ok) {
      setNewWorkspaceName('');
      setNewWorkspaceDescription('');
    }
  };

  return (
    <div className="space-y-2">
      <Input
        id="new-workspace-name"
        value={newWorkspaceName}
        onChange={(event) => {
          setNewWorkspaceName(event.target.value);
        }}
        placeholder="Project name"
      />
      <Input
        value={newWorkspaceDescription}
        onChange={(event) => {
          setNewWorkspaceDescription(event.target.value);
        }}
        placeholder="Optional description"
      />
      <div className="flex items-center gap-2">
        <DisabledReasonTooltip
          reason={!newWorkspaceName.trim() ? 'Enter a project name first' : undefined}
        >
          <Button onClick={() => void handleCreate()} disabled={!newWorkspaceName.trim()}>
            <Plus className="mr-2 h-4 w-4" /> Create project
          </Button>
        </DisabledReasonTooltip>
        <HelpIcon targetKey="data-loader.create-workspace.button" label="Create project" />
      </div>
    </div>
  );
}
