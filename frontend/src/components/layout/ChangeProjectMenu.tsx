import { useState } from 'react';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

import type { WorkspaceSummary } from '@/api/frontendModels';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import {
  isPendingTaskState,
  isRunningTaskState,
} from '@/features/workspace/task-stream/taskProjection';
import { useTaskResources } from '@/features/workspace/task-stream/useWorkspaceTaskInbox';

/**
 * Switches the open Project from the Project Graph title bar (issue 192).
 * Follows the Data Loader's rule: while an Analysis in the current Project is
 * queued or running, every Project is disabled and the menu says why, so the
 * user can wait for it or stop it. Otherwise a choice is confirmed first; the
 * backend then closes the current Project (saved continuously) and opens the
 * chosen one.
 */
export function ChangeProjectMenu() {
  const { workspaces, currentWorkspace, currentWorkspaceId } = useWorkspaceData();
  const { setCurrentWorkspace } = useWorkspaceActions();
  const { tasks } = useTaskResources(currentWorkspaceId);
  const [target, setTarget] = useState<WorkspaceSummary | null>(null);
  const [switching, setSwitching] = useState(false);

  const activeTaskCount = currentWorkspaceId
    ? tasks.filter(
        (task) =>
          task.resource_type === 'analysis' &&
          task.workspace_id === currentWorkspaceId &&
          (isRunningTaskState(task.state) || isPendingTaskState(task.state)),
      ).length
    : 0;
  const otherProjects = workspaces.filter((workspace) => workspace.id !== currentWorkspaceId);
  const currentName = currentWorkspace?.name ?? 'this project';
  const busyNote =
    activeTaskCount === 1
      ? `A task is still running in “${currentName}”. Wait for it to finish, or stop it in its tab, before switching projects.`
      : `${String(activeTaskCount)} tasks are still running in “${currentName}”. Wait for them to finish, or stop them in their tabs, before switching projects.`;

  const confirmSwitch = async () => {
    if (!target) return;
    if (activeTaskCount > 0) {
      // A task started after the menu was opened.
      toast.warning(busyNote);
      setTarget(null);
      return;
    }
    setSwitching(true);
    try {
      await setCurrentWorkspace(target.id);
      toast.success(`Switched to “${target.name}”.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not open “${target.name}”.`);
    } finally {
      setSwitching(false);
      setTarget(null);
    }
  };

  return (
    <div className="ml-auto flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={switching}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            {switching ? 'Switching…' : 'Change Project'}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
          {activeTaskCount > 0 ? (
            <>
              <DropdownMenuLabel
                role="note"
                className="whitespace-normal font-normal text-label-secondary text-description"
              >
                {busyNote}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {otherProjects.length === 0 ? (
            <DropdownMenuItem disabled>No other projects</DropdownMenuItem>
          ) : (
            otherProjects.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                disabled={activeTaskCount > 0}
                onSelect={() => {
                  setTarget(workspace);
                }}
              >
                <span className="truncate">{workspace.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <HelpIcon
        targetKey="ui.change-project"
        label="About switching projects"
        tooltip="Close this project and open another one without going to the Data Loader."
        className="h-5 w-5 shrink-0 text-description"
      />

      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !switching) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to “{target?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentWorkspace
                ? `“${currentWorkspace.name}” is saved automatically and will be closed.`
                : 'The project will open in the Project Graph.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={switching}
              onClick={(event) => {
                event.preventDefault();
                void confirmSwitch();
              }}
            >
              {switching ? 'Switching…' : 'Switch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
