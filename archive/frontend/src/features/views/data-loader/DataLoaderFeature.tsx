import {
  Download as DownloadIcon,
  FolderPlus,
  FolderUp,
  Loader2,
  RefreshCcw,
  Upload,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';
import HelpIcon from '@/components/help/HelpIcon';
import InfoIcon from '@/components/help/InfoIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserPreferences } from '@/features/preferences/useUserPreferences';
import { AddFilePanel, FilePreviewPanel } from '@/features/views/data-loader/components';
import { useFiles } from '@/features/views/data-loader/hooks/useFiles';
import { useProjectData } from '@/features/project/common/hooks/useProjectData';
import { useProjectStatus } from '@/features/project/common/hooks/useProjectStatus';
import { useProjectDownloads } from '@/features/project/project-downloads/ProjectDownloadsContext';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { ResizeHandle } from '@/components/layout/ResizeHandle';
import {
  isPendingTaskState,
  isRunningTaskState,
} from '@/features/project/task-stream/taskProjection';
import { useTaskResources } from '@/features/project/task-stream/useProjectTaskInbox';
import { ActiveProjectCard } from './components/ActiveProjectCard';
import { DataLoaderDialogs } from './components/DataLoaderDialogs';
import { FileTree } from './components/FileTree';
import { SampleDataPanel } from './components/SampleDataPanel';
import { ProjectManagerCard } from './components/ProjectManagerCard';
import { useDataLoaderGuidance } from './hooks/useDataLoaderGuidance';
import { useDataLoaderProjectActions } from './hooks/useDataLoaderProjectActions';
import { useFileBrowserActions } from './hooks/useFileBrowserActions';
import { useFolderCreation } from './hooks/useFolderCreation';
import { useLdacaImport } from './hooks/useLdacaImport';
import { useUploadState } from './hooks/useUploadState';
import { countFilesInNode } from './utils/fileTreeHelpers';

interface FileListShellProps {
  children: ReactNode;
  creatingFolder: boolean;
  isDropActive: boolean;
  empty?: boolean;
  onCreateRootFolder: () => void;
}

/**
 * Shared frame for the Data Loader file list.
 *
 * Rendered by: DataLoaderFeature for both empty and populated file-list states
 * because those branches share the root-folder toolbar, bordered drop-state
 * styling, and scroll-constrained frame while keeping their actual body content
 * different.
 */
function FileListShell({
  children,
  creatingFolder,
  isDropActive,
  empty = false,
  onCreateRootFolder,
}: FileListShellProps) {
  let stateClasses = '';
  if (isDropActive) {
    stateClasses = empty ? 'border-button text-foreground' : 'border-button';
  } else if (empty) {
    stateClasses = 'border-surface-border-foreground/60 text-description border-dashed';
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border ${stateClasses}`}
    >
      <div
        role="toolbar"
        aria-label="File list"
        data-guidance="file-library-toolbar"
        className="border-surface-border/60 flex items-center justify-start border-b px-2 py-1.5"
      >
        <Button
          size="icon"
          variant="ghost"
          className="text-description hover:text-foreground h-7 w-7 shrink-0"
          onClick={onCreateRootFolder}
          disabled={creatingFolder}
          aria-label="Add root folder"
          title="Add root folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {children}
    </div>
  );
}

/**
 * Orchestrates the Data Loader tab. It exists as the feature shell that wires
 * project actions, file browsing, uploads, sample imports, and dialogs for
 * the main app route.
 * Rendered by: ViewRouter when the user opens the Data Loader view because
 * this component is the only place that combines file-system state, project
 * mutations, upload/import hooks, and the split-panel layout. DataLoaderFeature
 * tests render it to verify those integrated workflows stay connected, while
 * AddFilePanel receives callbacks from it so individual selected files can be
 * promoted into project nodes.
 * Flow: collect project/auth/file-browser state, build notification and
 * mutation hooks, derive project/file summary values, block unsafe project
 * changes while tasks are active, then render the project, file tree, sample
 * data, preview, and dialog panels with the handlers they need.
 */
function DataLoaderFeature() {
  const { projectCatalogue, projects, currentProjectId, projectGraph } = useProjectData();
  const { isLoading } = useProjectStatus();

  const {
    fileTree,
    selectedFile,
    setSelectedFile,
    loadingFiles,
    uploadFileAtPath,
    createUploadDirectory,
    getUploadResource,
    handleDeleteFile,
    handleDownloadFile,
    refreshFiles,
  } = useFiles();

  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [addFileName, setAddFileName] = useState<string | null>(null);
  const filesPaneRef = useRef<HTMLDivElement | null>(null);
  const [filesPaneHeight, setFilesPaneHeight] = useState<number | null>(null);
  const {
    containerRef: splitContainerRef,
    value: projectPaneHeight,
    isDragging,
    splitterProps,
  } = useResizableSplit({
    mode: 'pixel',
    defaultValue: 500,
    min: 240,
    max: 1200,
    keyboardStep: 40,
    persistKey: 'ldaca.layout.dataLoaderProjectHeight',
    onDragStart: () => {
      const height = filesPaneRef.current?.getBoundingClientRect().height;
      if (height && height > 0) setFilesPaneHeight(height);
    },
  });
  const hasProjectSelected = Boolean(currentProjectId);

  /**
   * Called by: Data Loader hooks when long-running file, project, import, or
   * folder actions need consistent user feedback. They call through this local
   * adapter so durations and Sonner entry points stay centralized instead of
   * each hook choosing its own toast behavior.
   * Flow: choose an error-specific or normal duration, map the semantic status
   * to the matching Sonner API, and fall back to the neutral toast for info.
   */
  const notify = (type: 'success' | 'error' | 'info', message: string) => {
    const duration = type === 'error' ? 6000 : 3500;
    if (type === 'success') {
      toast.success(message, { duration });
    } else if (type === 'error') {
      toast.error(message, { duration });
    } else {
      toast(message, { duration });
    }
  };

  const projectDownloads = useProjectDownloads();
  const {
    projectToDelete,
    deletingProject,
    projectNameAlert,
    refreshingProjects,
    uploadingProjectZip,
    closeProjectNameAlert,
    closeDeleteProjectDialog,
    handleCreateProject,
    handleRenameProject,
    handleSaveProject,
    handleSetCurrentProject,
    handleUpdateProjectDescription,
    openDeleteProjectDialog,
    handleConfirmDeleteProject,
    handleRefreshProjects,
    handleUploadProjectZip,
    handleAddFileToProject,
    projectLoadFailures,
    projectSelectionOperation,
  } = useDataLoaderProjectActions({
    projectCatalogue,
    hasProjectSelected,
    notify,
  });
  const {
    citationDirectory,
    citationPath,
    citationContent,
    citationLoading,
    refreshingFiles,
    handleRefreshFiles,
    handleMoveFile,
    openCitation,
    closeCitation,
  } = useFileBrowserActions({ refreshFiles, notify });
  const {
    ldacaImportOpen,
    setLdacaImportOpen,
    searchMethod,
    setSearchMethod,
    searchQuery,
    setSearchQuery,
    collectionFilter,
    setCollectionFilter,
    fileFormatFilter,
    setFileFormatFilter,
    featuredRecords,
    featuredLoading,
    searchResults,
    hasSearched,
    searching,
    importingId,
    ldacaImporting,
    errorMessage: ldacaErrorMessage,
    handleLdacaSearch,
    handleLdacaImport,
  } = useLdacaImport({ notify });
  const {
    fileInputRef,
    folderInputRef,
    isBusy: uploadBusy,
    progressText,
    conflicts: uploadConflicts,
    isFileDropActive,
    openFilePicker,
    openFolderPicker,
    cancelUpload,
    closeConflictDialog,
    handleFileAreaDragOver,
    handleFileAreaDragLeave,
    handleFileAreaDrop,
    handleFileInputChange,
    handleFolderInputChange,
  } = useUploadState({
    uploadFileAtPath,
    createUploadDirectory,
    getUploadResource,
    refreshFiles,
    notify,
  });
  const {
    createFolderOpen,
    setCreateFolderOpen,
    createFolderParentPath,
    createFolderParentLabel,
    newFolderName,
    setNewFolderName,
    creatingFolder,
    folderNameAlert,
    closeFolderNameAlert,
    openCreateFolderDialog,
    handleCreateFolder,
  } = useFolderCreation({ notify });

  const { preferences } = useUserPreferences();
  const favoriteProjects = preferences.favorite_workspaces ?? [];

  const sortedProjects = projects.toSorted((a, b) => {
    const aId = a.id;
    const bId = b.id;
    const aFav = favoriteProjects.includes(aId) ? 1 : 0;
    const bFav = favoriteProjects.includes(bId) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    // modified_at/created_at may be '' and must fall through to the next timestamp source

    const aTime = Date.parse(a.modified_at || a.created_at || '');

    const bTime = Date.parse(b.modified_at || b.created_at || '');
    return (bTime || 0) - (aTime || 0);
  });
  const sortedProjectCatalogue = [
    ...sortedProjects,
    ...projectCatalogue
      .filter((project) => project.availability === 'unavailable')
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  ];

  const totalFileCount = fileTree.reduce((sum, node) => sum + countFilesInNode(node), 0);

  const currentProject =
    projects.find((project) => project.id === currentProjectId) ?? null;

  const nodeCount = projectGraph?.nodes.length ?? currentProject?.total_nodes ?? 0;

  /**
   * Bridges the add-file dialog to project node creation. The AddFilePanel
   * calls this after optional sheet selection, and the feature owns clearing
   * the pending filename afterward.
   * Called by: AddFilePanel's submit path because the sheet chooser only knows
   * the selected worksheet; DataLoaderFeature holds the pending filename and the
   * project mutation hook needed to create the node.
   * Flow: ignore submits with no pending filename, delegate node creation to the
   * project action hook, report any failure through the feature toast adapter,
   * then clear the pending filename so the dialog cannot resubmit stale state.
   */
  const handleAddToProject = async (selectedSheet?: string | null) => {
    if (!addFileName) return;
    try {
      await handleAddFileToProject(addFileName, selectedSheet);
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to add file to project.');
    } finally {
      setAddFileName(null);
    }
  };

  const projectBusy = isLoading.projects || isLoading.currentProject;
  // Block project switching or unloading while an Analysis on the active
  // Project is still running. User File Imports have no Project owner.
  const { tasks } = useTaskResources(currentProjectId);
  const hasActiveTask = currentProjectId
    ? tasks.some(
        (task) =>
          task.resource_type === 'analysis' &&
          task.workspace_id === currentProjectId &&
          (isRunningTaskState(task.state) || isPendingTaskState(task.state)),
      )
    : false;

  useDataLoaderGuidance({
    currentProjectId,
    loadingFiles,
    nodeCount,
    totalFileCount,
    projectBusy,
    projectCount: projects.length,
  });

  return (
    <div className="@container/data-loader flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-foreground leading-none font-semibold tracking-tight">Data Loader</h1>
          <InfoIcon
            targetKey="data-loader.overview"
            label="About the Data Loader"
            tooltip="Learn what the Data Loader is and how it helps you get started."
          />
          <HelpIcon
            targetKey="data-loader.tab"
            label="Data loader overview"
            tooltip="Manage projects, upload text data, and add files to the active project. Use this tab before running downstream analyses."
          />
        </div>
      </div>

      <div
        ref={splitContainerRef}
        data-testid="data-loader-split"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          data-testid="data-loader-project-pane"
          className="min-h-0 shrink-0 overflow-y-auto @min-[576px]/data-loader:overflow-hidden"
          style={{ flexBasis: `${String(projectPaneHeight)}px` }}
        >
          <div className="grid min-h-full gap-4 @min-[576px]/data-loader:h-full @min-[576px]/data-loader:min-h-0 @min-[576px]/data-loader:grid-cols-2">
            <ActiveProjectCard
              currentProject={currentProject}
              nodeCount={nodeCount}
              busy={projectBusy}
              hasActiveTask={hasActiveTask}
              selectionOperation={projectSelectionOperation}
              onCreate={handleCreateProject}
              onRename={handleRenameProject}
              onUpdateDescription={handleUpdateProjectDescription}
              onSave={handleSaveProject}
              onUnload={() => {
                void handleSetCurrentProject(null);
              }}
            />

            <ProjectManagerCard
              projects={sortedProjectCatalogue}
              currentProjectId={currentProjectId}
              busy={projectBusy}
              hasActiveTask={hasActiveTask}
              selectionOperation={projectSelectionOperation}
              uploadingZip={uploadingProjectZip}
              refreshing={refreshingProjects}
              downloads={projectDownloads}
              loadFailures={projectLoadFailures}
              onUploadZip={handleUploadProjectZip}
              onRefresh={() => void handleRefreshProjects()}
              onLoadProject={(projectId) => void handleSetCurrentProject(projectId)}
              onDeleteProject={openDeleteProjectDialog}
            />
          </div>
        </div>

        <ResizeHandle
          orientation="horizontal"
          isDragging={isDragging}
          {...splitterProps}
          aria-label="Resize data loader sections"
          className="-my-0.5"
          title="Drag to resize. Double-click to reset."
        />

        <div
          ref={filesPaneRef}
          data-testid="data-loader-files-pane"
          className="flex min-h-0 shrink-0 flex-col overflow-hidden"
          style={{
            flexBasis: filesPaneHeight === null ? 'auto' : `${String(filesPaneHeight)}px`,
          }}
        >
          <Card className="flex h-full flex-col overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  Files & uploads
                  <HelpIcon
                    targetKey="data-loader.files.section"
                    label="Files and uploads section"
                    tooltip="Load delimited, JSON, Parquet, Avro, Arrow IPC, spreadsheet, UTF-8 text, or ZIP document files into the active project."
                  />
                </CardTitle>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Refresh file list"
                  title="Refresh file list"
                  onClick={() => {
                    void handleRefreshFiles();
                  }}
                  disabled={refreshingFiles || loadingFiles}
                >
                  <RefreshCcw className={`h-4 w-4 ${refreshingFiles ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-4">
              <div data-guidance="file-sources" className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button onClick={openFilePicker} disabled={uploadBusy}>
                    <Upload className="mr-2 h-4 w-4" /> Upload files
                  </Button>
                  <HelpIcon targetKey="data-loader.upload.button" label="About upload files" />
                </div>
                <Button variant="outline" onClick={openFolderPicker} disabled={uploadBusy}>
                  <FolderUp className="mr-2 h-4 w-4" /> Upload folder
                </Button>
                <div className="flex items-center gap-1">
                  <SampleDataPanel />
                  <HelpIcon
                    targetKey="data-loader.import-sample.button"
                    label="About import sample data"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setLdacaImportOpen(true);
                    }}
                    disabled={ldacaImporting}
                  >
                    <DownloadIcon className="mr-2 h-4 w-4" /> Import from LDaCA
                  </Button>
                  <HelpIcon
                    targetKey="data-loader.import-ldaca.button"
                    label="About import from LDaCA"
                  />
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  aria-label="Upload files"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    void handleFileInputChange(e);
                  }}
                />
                <input
                  ref={(input) => {
                    folderInputRef.current = input;
                    if (input) input.setAttribute('webkitdirectory', '');
                  }}
                  type="file"
                  aria-label="Upload folder"
                  className="hidden"
                  onChange={(event) => {
                    void handleFolderInputChange(event);
                  }}
                />
              </div>

              <div className="text-description text-label-secondary">
                Drop files and folders into the file list, or use the upload buttons. Folder picking
                is available if this browser cannot accept a dropped folder.
              </div>

              {uploadBusy ? (
                <div className="bg-panel/50 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-body">
                  <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span className="truncate">{progressText}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={cancelUpload}>
                    Cancel
                  </Button>
                </div>
              ) : null}

              <div
                role="region"
                aria-label="Files upload area"
                onDragEnter={handleFileAreaDragOver}
                onDragOver={handleFileAreaDragOver}
                onDragLeave={handleFileAreaDragLeave}
                onDrop={(e) => {
                  void handleFileAreaDrop(e);
                }}
                className={`flex min-h-0 flex-1 flex-col rounded-md transition-colors ${isFileDropActive ? 'border-button bg-button/5 ring-focus/20 border ring-2' : ''}`}
              >
                {loadingFiles ? (
                  <div className="text-description flex items-center gap-2 text-body">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
                  </div>
                ) : fileTree.length === 0 ? (
                  <FileListShell
                    creatingFolder={creatingFolder}
                    isDropActive={isFileDropActive}
                    empty
                    onCreateRootFolder={() => {
                      openCreateFolderDialog('', 'root');
                    }}
                  >
                    <div className="flex flex-1 items-start px-4 py-3 text-body">
                      {isFileDropActive
                        ? 'Drop files or folders here to upload them.'
                        : 'No files found. Upload a dataset to begin.'}
                    </div>
                  </FileListShell>
                ) : (
                  <FileListShell
                    creatingFolder={creatingFolder}
                    isDropActive={isFileDropActive}
                    onCreateRootFolder={() => {
                      openCreateFolderDialog('', 'root');
                    }}
                  >
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="flex flex-col gap-0.5 p-2">
                        <FileTree
                          nodes={fileTree}
                          selectedFile={selectedFile}
                          loadingFiles={loadingFiles}
                          hasProjectSelected={hasProjectSelected}
                          projectId={currentProjectId}
                          onPreviewFile={setPreviewFile}
                          onAddFile={setAddFileName}
                          onSelectFile={setSelectedFile}
                          onDownloadFile={(file) => {
                            void handleDownloadFile(file);
                          }}
                          onDeleteFile={(file) => {
                            void handleDeleteFile(file);
                          }}
                          onCreateFolderInside={openCreateFolderDialog}
                          onOpenCitation={(directory, readmePath) => {
                            void openCitation(directory, readmePath);
                          }}
                          onMoveFile={handleMoveFile}
                        />
                      </div>
                    </ScrollArea>
                  </FileListShell>
                )}
              </div>
              <div className="text-description flex shrink-0 flex-wrap items-center justify-between gap-3 text-label-secondary">
                <div>Total files: {totalFileCount}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <FilePreviewPanel
        filename={previewFile}
        open={Boolean(previewFile)}
        /** Clears the selected preview file when the preview dialog closes. */
        onClose={() => {
          setPreviewFile(null);
        }}
      />
      <AddFilePanel
        filename={addFileName}
        open={Boolean(addFileName)}
        /** Clears the pending file-to-project selection when the add dialog closes. */
        onClose={() => {
          setAddFileName(null);
        }}
        onConfirm={handleAddToProject}
      />
      <DataLoaderDialogs
        projectNameAlert={{
          message: projectNameAlert,
          onClose: closeProjectNameAlert,
        }}
        folderNameAlert={{
          message: folderNameAlert,
          onClose: closeFolderNameAlert,
        }}
        deleteProject={{
          target: projectToDelete,
          deleting: deletingProject,
          onCancel: closeDeleteProjectDialog,
          /**
           * Confirms the pending project delete from the presentation dialog.
           * Invoked by `DataLoaderDialogs` when project deletion is confirmed.
           */
          onConfirm: () => void handleConfirmDeleteProject(),
        }}
        ldacaImport={{
          open: ldacaImportOpen,
          onOpenChange: setLdacaImportOpen,
          searchMethod,
          onSearchMethodChange: setSearchMethod,
          query: searchQuery,
          onQueryChange: setSearchQuery,
          collectionFilter,
          onCollectionFilterChange: setCollectionFilter,
          fileFormatFilter,
          onFileFormatFilterChange: setFileFormatFilter,
          featuredRecords,
          featuredLoading,
          searchResults,
          hasSearched,
          searching,
          importingId,
          importing: ldacaImporting,
          errorMessage: ldacaErrorMessage,
          /**
           * Routes dialog search submission through the feature's guarded search handler.
           * Invoked by `DataLoaderDialogs` when its Oni search form submits.
           */
          onSearch: () => void handleLdacaSearch(),
          /**
           * Routes row-level imports through the feature's import task handler.
           * Invoked by `DataLoaderDialogs` from an Oni result/import action.
           */
          onImport: (recordId) => void handleLdacaImport(recordId),
        }}
        createFolder={{
          open: createFolderOpen,
          onOpenChange: setCreateFolderOpen,
          parentPath: createFolderParentPath,
          parentLabel: createFolderParentLabel,
          name: newFolderName,
          onNameChange: setNewFolderName,
          creating: creatingFolder,
          // The dialog only knows about form state; folder creation stays in
          // the hook so file-list refetch and alerts share one owner.
          // Invoked by DataLoaderDialogs when its create-folder form submits.
          onCreate: () => void handleCreateFolder(),
        }}
        citation={{
          directory: citationDirectory,
          path: citationPath,
          content: citationContent,
          loading: citationLoading,
          onClose: closeCitation,
        }}
        uploadConflicts={{
          paths: uploadConflicts,
          onClose: closeConflictDialog,
        }}
      />
    </div>
  );
}

export default DataLoaderFeature;
