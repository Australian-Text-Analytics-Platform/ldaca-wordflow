import {
  CircleAlert,
  Download as DownloadIcon,
  Loader2,
  MoreHorizontal,
  Star,
  Trash2,
} from 'lucide-react';
import type { ProjectCatalogueItem } from '@/api';
import { Button } from '@/components/ui/button';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectDownloadsHandle } from '@/features/project/project-downloads/ProjectDownloadsContext';
import { formatTimestamp } from '../utils/format';

interface ProjectManagerItemProps {
  project: ProjectCatalogueItem;
  currentProjectId: string | null;
  hasActiveTask: boolean;
  selectionOperation: { projectId: string | null; action: 'load' | 'unload' } | null;
  downloads: ProjectDownloadsHandle;
  loadFailure?: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onLoadProject: (projectId: string | null) => void;
  onDeleteProject: (projectId: string) => void;
}

const ProjectDescription = ({ description }: { description?: string | null }) => {
  const trimmedDescription = description?.trim();
  let descriptionText = 'No description added yet.';
  if (trimmedDescription) descriptionText = trimmedDescription;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          aria-label="View project description"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-xs">
        <DropdownMenuLabel>Description</DropdownMenuLabel>
        <div className="px-2 py-1.5 text-body text-widget-foreground whitespace-pre-wrap">
          {descriptionText}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Renders one available or unavailable project and its valid actions. */
export function ProjectManagerItem({
  project,
  currentProjectId,
  hasActiveTask,
  selectionOperation,
  downloads,
  loadFailure,
  favorite,
  onToggleFavorite,
  onLoadProject,
  onDeleteProject,
}: ProjectManagerItemProps) {
  const projectId = project.id;
  if ('message' in project) {
    const isIncompatible = project.reason === 'incompatible_format';
    const isSelectionTarget =
      selectionOperation?.action === 'load' && selectionOperation.projectId === projectId;
    const trimmedProjectName = project.name?.trim();
    let projectName = 'Unnamed project';
    if (trimmedProjectName) projectName = trimmedProjectName;
    return (
      <div
        data-testid={`project-manager-item-${projectId}`}
        className="flex flex-col gap-3 rounded-md border border-error/50 bg-error/5 px-4 py-3 @min-[480px]/project-manager:flex-row @min-[480px]/project-manager:items-center @min-[480px]/project-manager:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-medium">
            <CircleAlert className="h-4 w-4 shrink-0 text-error" aria-hidden="true" />
            <span className="text-error">{projectName}</span>
            <ProjectDescription description={project.description} />
          </div>
          <div className="mt-1 break-all text-[11px] text-description">
            Project ID: <span>{projectId}</span>
          </div>
          <div className="mt-2 text-label-secondary text-description">
            Created {formatTimestamp(project.created_at)} | Updated{' '}
            {formatTimestamp(project.modified_at)}
          </div>
          <div className="mt-2 max-w-prose text-label-secondary text-description">
            {project.message}
          </div>
          {loadFailure ? (
            <div
              role="alert"
              className="mt-2 flex max-w-prose items-start gap-1.5 text-label-secondary text-error"
            >
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">Failed to load:</span> {loadFailure}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <DisabledReasonTooltip
            reason={
              hasActiveTask
                ? 'A task is still running on the current project. Wait for it to finish, or cancel it from the task list, before switching projects.'
                : selectionOperation
                  ? 'Another Project Load or Unload operation is in progress.'
                  : undefined
            }
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onLoadProject(projectId);
              }}
              disabled={hasActiveTask || Boolean(selectionOperation)}
            >
              {isSelectionTarget ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isSelectionTarget ? 'Loading…' : 'Load'}
            </Button>
          </DisabledReasonTooltip>
          <DisabledReasonTooltip reason={isIncompatible ? undefined : project.message}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void downloads.startDownload(projectId, projectName);
              }}
              disabled={
                !isIncompatible ||
                downloads.isStarting(projectId) ||
                downloads.isPending(projectId)
              }
            >
              <DownloadIcon className="mr-1.5 h-4 w-4" />
              {downloads.isPending(projectId)
                ? 'Preparing…'
                : downloads.isStarting(projectId)
                  ? 'Starting…'
                  : 'Download archive'}
            </Button>
          </DisabledReasonTooltip>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              onDeleteProject(projectId);
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>
    );
  }

  const isActive = projectId === currentProjectId;
  const isSelectionTarget =
    selectionOperation?.action === 'load'
      ? selectionOperation.projectId === projectId
      : selectionOperation?.action === 'unload' && isActive;
  return (
    <div
      data-testid={`project-manager-item-${projectId}`}
      className={`flex flex-col gap-2 rounded-md border px-4 py-3 @min-[480px]/project-manager:flex-row @min-[480px]/project-manager:items-center @min-[480px]/project-manager:justify-between ${
        loadFailure
          ? 'border-error/50 bg-error/5'
          : isActive
            ? 'border-button bg-button/10 ring-1 ring-focus/20'
            : 'border-surface-border/70 bg-editor'
      }`}
    >
      <div>
        <div className="flex items-center gap-1 font-medium text-foreground">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={onToggleFavorite}
          >
            <Star
              className={`h-4 w-4 ${
                favorite
                  ? 'fill-[var(--vscode-charts-orange)] text-[var(--vscode-charts-orange)]'
                  : 'text-description'
              }`}
            />
          </Button>
          <span>{project.name.trim() ? project.name : projectId}</span>
          <ProjectDescription description={project.description} />
        </div>
        <div className="text-label-secondary text-description">
          Updated {formatTimestamp(project.modified_at)} | {project.total_nodes} data block
          {project.total_nodes === 1 ? '' : 's'}
        </div>
        {loadFailure ? (
          <div
            role="alert"
            className="mt-2 flex max-w-prose items-start gap-1.5 text-label-secondary text-error"
          >
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">Failed to load:</span> {loadFailure}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <DisabledReasonTooltip
          reason={
            hasActiveTask
              ? isActive
                ? 'A task is still running on this project. Wait for it to finish, or cancel it from the task list, before unloading.'
                : 'A task is still running on the current project. Wait for it to finish, or cancel it from the task list, before switching projects.'
              : selectionOperation
                ? 'Another Project Load or Unload operation is in progress.'
                : undefined
          }
        >
          <Button
            data-guidance={isActive ? undefined : 'load-project'}
            size="sm"
            variant={isActive ? 'outline' : 'secondary'}
            onClick={() => {
              onLoadProject(isActive ? null : projectId);
            }}
            disabled={hasActiveTask || Boolean(selectionOperation)}
          >
            {isSelectionTarget ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {isSelectionTarget
              ? selectionOperation?.action === 'unload'
                ? 'Unloading…'
                : 'Loading…'
              : isActive
                ? 'Unload'
                : 'Load'}
          </Button>
        </DisabledReasonTooltip>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void downloads.startDownload(
              projectId,
              project.name.trim() ? project.name : projectId,
            );
          }}
          disabled={downloads.isStarting(projectId) || downloads.isPending(projectId)}
        >
          <DownloadIcon className="mr-1.5 h-4 w-4" />
          {downloads.isPending(projectId)
            ? 'Preparing…'
            : downloads.isStarting(projectId)
              ? 'Starting…'
              : 'Download'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            onDeleteProject(projectId);
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}
