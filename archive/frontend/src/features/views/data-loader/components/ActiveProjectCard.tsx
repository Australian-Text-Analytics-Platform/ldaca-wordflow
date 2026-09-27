import { useState } from 'react';
import { LogOut, Plus, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import HelpIcon from '@/components/help/HelpIcon';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { formatTimestamp } from '../utils/format';
import type { ProjectSummary } from '@/api';

type ProjectSelectionOperation = {
  projectId: string | null;
  action: 'load' | 'unload';
} | null;

export interface ActiveProjectCardProps {
  currentProject: ProjectSummary | null;
  nodeCount: number;
  busy: boolean;
  hasActiveTask?: boolean;
  selectionOperation?: ProjectSelectionOperation;
  onCreate: (name: string, description: string) => Promise<boolean>;
  onRename: (value: string) => Promise<void> | void;
  onUpdateDescription: (value: string) => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onUnload: () => Promise<void> | void;
}

interface ActiveProjectControlsProps {
  currentProject: ProjectSummary;
  nodeCount: number;
  busy: boolean;
  hasActiveTask: boolean;
  selectionOperation: ProjectSelectionOperation;
  onRename: (value: string) => Promise<void> | void;
  onUpdateDescription: (value: string) => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onUnload: () => Promise<void> | void;
}

interface CreateProjectFormProps {
  onCreate: (name: string, description: string) => Promise<boolean>;
}

/**
 * Builds the React key used for editable active-project drafts. The card
 * remounts the active controls when the selected project or persisted
 * name/description changes, which replaces the previous render-time sync state.
 * Used by: ActiveProjectCard because the shell owns mode selection while the
 * active controls own only their local draft inputs.
 */
function getActiveProjectDraftKey(project: ProjectSummary) {
  return [project.id, project.name, project.description].join('\n');
}

/**
 * Renders the active-project/create-project panel. `DataLoaderFeature`
 * uses it to keep project creation and currently loaded project controls
 * in one card while delegating persistence to project hooks.
 * Rendered by: DataLoaderFeature module.
 * Flow: sync local editable drafts to the active project identity, choose create vs
 * active-project controls, gate unsafe unloads while tasks run, then forward
 * save/rename/create events to parent actions.
 */
export function ActiveProjectCard({
  currentProject,
  nodeCount,
  busy,
  hasActiveTask = false,
  selectionOperation = null,
  onCreate,
  onRename,
  onUpdateDescription,
  onSave,
  onUnload,
}: ActiveProjectCardProps) {
  return (
    <Card
      data-testid={currentProject ? 'active-project-card' : 'create-project-card'}
      data-guidance={currentProject ? 'active-project' : 'project-setup'}
      className="flex h-full flex-col overflow-hidden"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {currentProject ? 'Active project' : 'Create project'}
          {currentProject ? (
            <HelpIcon
              targetKey="data-loader.active-project.section"
              label="Active project overview"
              tooltip="Choose or rename the project where new data blocks will be added. Save regularly to persist your progress."
            />
          ) : (
            <HelpIcon
              targetKey="data-loader.create-project.name"
              label="Create project overview"
              tooltip="Create a new project before uploading files or adding data blocks. Add an optional description if you want to capture its purpose."
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {currentProject ? (
          <ActiveProjectControls
            key={getActiveProjectDraftKey(currentProject)}
            currentProject={currentProject}
            nodeCount={nodeCount}
            busy={busy}
            hasActiveTask={hasActiveTask}
            selectionOperation={selectionOperation}
            onRename={onRename}
            onUpdateDescription={onUpdateDescription}
            onSave={onSave}
            onUnload={onUnload}
          />
        ) : (
          <CreateProjectForm onCreate={onCreate} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Owns editable controls for the loaded project. The parent remounts this
 * component when persisted project details change, so its local drafts stay
 * simple and do not need cross-prop synchronization state.
 * Used by: ActiveProjectCard because active controls are mutually exclusive
 * from the create form but share the same card shell.
 * Flow: initialize drafts from the persisted project, forward rename and
 * description updates, and gate unload while project mutations or analysis
 * tasks are still active.
 */
function ActiveProjectControls({
  currentProject,
  nodeCount,
  busy,
  hasActiveTask,
  selectionOperation,
  onRename,
  onUpdateDescription,
  onSave,
  onUnload,
}: ActiveProjectControlsProps) {
  const [renameValue, setRenameValue] = useState(currentProject.name);
  const [descriptionValue, setDescriptionValue] = useState(currentProject.description);
  const normalizedCurrentDescription = currentProject.description.trim();
  const normalizedDescriptionValue = descriptionValue.trim();

  return (
    <>
      <div className="rounded-md border border-surface-border/60 bg-panel/30 px-4 py-3 text-body">
        <div className="flex flex-wrap items-center gap-2 text-body font-semibold text-foreground">
          {currentProject.name}
          <Badge>
            {nodeCount} data block{nodeCount === 1 ? '' : 's'}
          </Badge>
        </div>
        <div className="mt-1 text-label-secondary text-description">
          Updated {formatTimestamp(currentProject.modified_at)} | Created{' '}
          {formatTimestamp(currentProject.created_at)}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="rename-project">Rename project</Label>
          <HelpIcon targetKey="data-loader.rename-project.input" label="Rename project input" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="rename-project"
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
          <Label htmlFor="project-description">Project description</Label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="project-description"
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

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void onSave()}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Save
        </Button>
        <div className="flex items-center gap-1">
          <DisabledReasonTooltip
            reason={
              hasActiveTask
                ? 'A task is still running on this project. Wait for it to finish, or cancel it from the task list, before unloading.'
                : selectionOperation
                  ? 'Another Project Load or Unload operation is in progress.'
                  : undefined
            }
          >
            <Button
              variant="outline"
              onClick={() => void onUnload()}
              disabled={busy || hasActiveTask || Boolean(selectionOperation)}
            >
              {selectionOperation?.action === 'unload' ? (
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              {selectionOperation?.action === 'unload' ? 'Unloading…' : 'Unload'}
            </Button>
          </DisabledReasonTooltip>
          <HelpIcon targetKey="data-loader.unload.button" label="Unload project" />
        </div>
      </div>
    </>
  );
}

/**
 * Owns the new-project draft fields. It lives outside ActiveProjectCard so
 * create-mode state cannot mix with active-project rename/description state.
 * Used by: ActiveProjectCard when no project is selected.
 * Flow: collect and trim the draft name/description, call the parent create
 * action, then clear drafts only when that action reports success.
 */
function CreateProjectForm({ onCreate }: CreateProjectFormProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  /**
   * Submits the create form and clears local inputs only after the parent
   * project action reports success.
   * Called by: CreateProjectForm button clicks because the form owns draft
   * cleanup but DataLoaderFeature owns the actual project mutation.
   */
  const handleCreate = async () => {
    const ok = await onCreate(newProjectName.trim(), newProjectDescription.trim());
    if (ok) {
      setNewProjectName('');
      setNewProjectDescription('');
    }
  };

  return (
    <div className="space-y-2">
      <Input
        id="new-project-name"
        value={newProjectName}
        onChange={(event) => {
          setNewProjectName(event.target.value);
        }}
        placeholder="Project name"
      />
      <Input
        value={newProjectDescription}
        onChange={(event) => {
          setNewProjectDescription(event.target.value);
        }}
        placeholder="Optional description"
      />
      <div className="flex items-center gap-2">
        <DisabledReasonTooltip
          reason={!newProjectName.trim() ? 'Enter a project name first' : undefined}
        >
          <Button onClick={() => void handleCreate()} disabled={!newProjectName.trim()}>
            <Plus className="mr-2 h-4 w-4" /> Create project
          </Button>
        </DisabledReasonTooltip>
        <HelpIcon targetKey="data-loader.create-project.button" label="Create project" />
      </div>
    </div>
  );
}
