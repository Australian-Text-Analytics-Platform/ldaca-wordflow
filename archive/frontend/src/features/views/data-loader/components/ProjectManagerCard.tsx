import { Loader2, RefreshCcw, Upload } from 'lucide-react';
import React, { useRef } from 'react';
import type { ProjectCatalogueItem } from '@/api';
import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from '@/features/preferences/useUserPreferences';
import type { ProjectDownloadsHandle } from '@/features/project/project-downloads/ProjectDownloadsContext';
import { ProjectManagerItem } from './ProjectManagerItem';

export interface ProjectManagerCardProps {
  projects: ProjectCatalogueItem[];
  currentProjectId: string | null;
  busy: boolean;
  hasActiveTask?: boolean;
  selectionOperation?: {
    projectId: string | null;
    action: 'load' | 'unload';
  } | null;
  uploadingZip: boolean;
  refreshing: boolean;
  downloads: ProjectDownloadsHandle;
  loadFailures?: Readonly<Record<string, string>>;
  onUploadZip: (file: File) => Promise<void> | void;
  onRefresh: () => void;
  onLoadProject: (projectId: string | null) => void;
  onDeleteProject: (projectId: string) => void;
}

/**
 * Lists saved projects and their quick actions. `DataLoaderFeature` uses it
 * beside the active-project card for load/unload, favorite, download, delete,
 * refresh, and ZIP upload controls.
 * Rendered by `DataLoaderFeature` beside `ActiveProjectCard`.
 * Flow: render the project list and controls, capture rename/delete/save/upload events, and
 * hand mutations to parent hooks while reflecting busy states.
 */
export function ProjectManagerCard({
  projects,
  currentProjectId,
  busy,
  hasActiveTask = false,
  selectionOperation = null,
  uploadingZip,
  refreshing,
  downloads,
  loadFailures = {},
  onUploadZip,
  onRefresh,
  onLoadProject,
  onDeleteProject,
}: ProjectManagerCardProps) {
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const { preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const favoriteProjects = preferences.favorite_workspaces ?? [];
  const isFavorite = (projectId: string) => favoriteProjects.includes(projectId);
  const toggleFavorite = (projectId: string) => {
    updatePreferences.mutate({
      favorite_workspaces: isFavorite(projectId)
        ? favoriteProjects.filter((id) => id !== projectId)
        : [...favoriteProjects, projectId],
    });
  };

  /**
   * Forwards the selected ZIP file to the parent upload action and clears the
   * file input so selecting the same archive again still fires change events.
   * Attached to the hidden project-ZIP input's `onChange` prop.
   */
  const handleZipChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await onUploadZip(file);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <Card
      data-guidance="project-manager"
      className="@container/project-manager flex h-full flex-col overflow-hidden"
    >
      <CardHeader>
        <div className="flex flex-col items-stretch gap-2 @min-[288px]/project-manager:flex-row @min-[288px]/project-manager:items-center @min-[288px]/project-manager:justify-between">
          <CardTitle className="flex items-center gap-2">
            Project manager
            <HelpIcon
              targetKey="data-loader.project-manager.section"
              label="Project manager overview"
              tooltip="Switch between saved projects or remove ones you no longer need."
            />
          </CardTitle>
          <div className="flex w-full flex-wrap items-center gap-1 @min-[288px]/project-manager:w-auto @min-[288px]/project-manager:justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => zipInputRef.current?.click()}
              disabled={uploadingZip || busy}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {uploadingZip ? 'Uploading…' : 'Upload project'}
            </Button>
            <input
              ref={zipInputRef}
              type="file"
              aria-label="Upload project archive"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                void handleZipChange(e);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Refresh project list"
              title="Refresh project list"
              onClick={onRefresh}
              disabled={refreshing || busy}
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {busy && !projects.length ? (
          <div className="flex items-center gap-2 text-body text-description">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-md border border-dashed border-surface-border-foreground/60 px-4 py-3 text-center text-body text-description">
            No projects yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto pr-2">
            {projects.map((project) => (
              <ProjectManagerItem
                key={project.id}
                project={project}
                currentProjectId={currentProjectId}
                hasActiveTask={hasActiveTask}
                selectionOperation={selectionOperation}
                downloads={downloads}
                loadFailure={loadFailures[project.id]}
                favorite={isFavorite(project.id)}
                onToggleFavorite={() => {
                  toggleFavorite(project.id);
                }}
                onLoadProject={onLoadProject}
                onDeleteProject={onDeleteProject}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
