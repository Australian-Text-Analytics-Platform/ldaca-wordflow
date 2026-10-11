import { RunError } from '@/features/tools/common/components/RunError';
import type { NativeTask } from '@/features/project/tasksApi';
import { request } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OperationError } from '@/features/project/OperationError';
import { FileImportSelection, SkippedImportFiles } from '@/features/project/FileImportSelection';
import {
  needsFileImportSelection,
  type FileImportPlan,
  type FileImportResult,
} from '@/features/project/filesApi';
import { saveGeneratedExport } from '@/lib/download';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, Upload } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { inspectImport, importFiles, type Library } from './api';
import { type ServerStatus } from './context';
import { startUpload, UploadCards, useUploads } from './uploads';
const parent = (name: string) => name.split('/').slice(0, -1).join('/');
const basename = (name: string) => name.split('/').at(-1) ?? name;
const projectFilename = (project: ServerStatus) => project.project?.path?.split(/[\\/]/).at(-1);
function fileSize(size: number) {
  const unit = size < 1024 ? 0 : size < 1024 ** 2 ? 1 : size < 1024 ** 3 ? 2 : 3;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit ? 1 : 0 }).format(size / 1024 ** unit)} ${['bytes', 'KB', 'MB', 'GB'][unit]}`;
}
export function FileLibrary({
  base,
  currentProject,
  projects = [],
  onSelectProject,
  actions,
  currentActions,
  ready = true,
  disabled = false,
  dropUpload = false,
  inDataLoader = false,
  library,
  tasks = [],
  onOpenProject,
  visible = true,
  incoming,
  onIncomingHandled,
}: {
  base: string;
  currentProject?: ServerStatus;
  projects?: ServerStatus[];
  onSelectProject?: (id: string) => void;
  actions?: ReactNode;
  currentActions?: ReactNode;
  ready?: boolean;
  disabled?: boolean;
  dropUpload?: boolean;
  inDataLoader?: boolean;
  library: Library;
  tasks?: NativeTask[];
  onOpenProject?: (name: string) => void;
  visible?: boolean;
  incoming?: { names: string[]; projectId: string; plan: FileImportPlan } | null;
  onIncomingHandled?: () => void;
}) {
  const navigate = useEditingNavigation();
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const removeTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [remove, setRemove] = useState<string[] | null>(null);
  const [folder, setFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [destination, setDestination] = useState('');
  const [moving, setMoving] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [plan, setPlan] = useState<{
    names: string[];
    projectId: string;
    plan: FileImportPlan;
  } | null>(null);
  const [report, setReport] = useState<FileImportResult | null>(null);
  const revision = useUploads((state) => state.revision);
  useEffect(() => {
    if (!visible) return;
    useUploads.setState((state) => ({
      visibleLibraries: {
        ...state.visibleLibraries,
        [library]: (state.visibleLibraries[library] ?? 0) + 1,
      },
    }));
    return () => {
      useUploads.setState((state) => ({
        visibleLibraries: {
          ...state.visibleLibraries,
          [library]: (state.visibleLibraries[library] ?? 1) - 1,
        },
      }));
    };
  }, [library, visible]);
  useEffect(() => {
    void cache.invalidateQueries({ queryKey: ['server-files', base, library] });
  }, [revision, cache, base, library]);
  const files = useQuery({
    queryKey: ['server-files', base, library],
    enabled: ready,
    meta: { reportError: false },
    queryFn: async ({ signal }) =>
      (
        await request(base, '/api/server/files/{library}', 'get', { path: { library }, signal })
      ).json(),
  });
  const operation = useMutation({
    meta: { reportError: false },
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['server-files', base, library] });
    },
  });
  const run = (action: () => Promise<unknown>) => operation.mutate(action);
  const folders = files.data?.filter((file) => file.is_directory) ?? [];
  const rows = (files.data ?? [])
    .filter((file) => library === 'projects' || parent(file.name) === folder)
    .map((file) => ({
      ...file,
      project:
        library === 'projects'
          ? projects.find((project) => projectFilename(project) === file.name)
          : undefined,
      missingFile: false,
    }));
  if (library === 'projects')
    for (const project of projects) {
      if (!rows.some((row) => row.project?.project_id === project.project_id))
        rows.push({
          name: projectFilename(project) ?? project.project?.title ?? 'Untitled',
          size: project.project?.size ?? 0,
          modified: project.project?.modified ?? null,
          is_directory: false,
          project,
          missingFile: true,
        });
    }
  const shown = rows.filter((row) =>
    row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const busy = disabled || operation.isPending;
  const heading = library === 'data' ? 'Data files' : 'Projects';
  const isOpen = (name: string) =>
    library === 'projects' && projects.some((project) => projectFilename(project) === name);
  const upload = (files: File[]) => {
    if (!ready || busy) return;
    if (
      library === 'projects' &&
      files.some((file) => !file.name.toLowerCase().endsWith('.wfpj'))
    ) {
      run(async () => {
        throw new Error('Choose Wordflow project files (.wfpj).');
      });
      return;
    }
    for (const file of files) void startUpload(base, library, file, folder);
  };
  const chosen = [...selected];
  const shownPlan = plan ?? incoming;
  function choose(name: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }
  function inspect(names: string[]) {
    if (!currentProject) return;
    const projectId = currentProject.project_id;
    run(async () => {
      const inspected = await inspectImport(base, projectId, names);
      if (needsFileImportSelection(inspected)) setPlan({ names, projectId, plan: inspected });
      else setReport(await importFiles(base, projectId, names));
    });
  }
  function download(names: string[], zip = false) {
    run(async () => {
      const project =
        library === 'projects'
          ? projects.find((project) => projectFilename(project) === names[0])
          : undefined;
      if (project) {
        const response = await request(base, '/api/server/project/{id}/download', 'get', {
          path: { id: project.project_id },
        });
        await saveGeneratedExport(await response.blob(), names[0] ?? 'Untitled.wfpj');
      } else if (
        library === 'data' &&
        (zip || names.length > 1 || rows.find((row) => row.name === names[0])?.is_directory)
      ) {
        const response = await request(base, '/api/server/files/download', 'post', {
          body: { library, names },
        });
        await saveGeneratedExport(await response.blob(), 'selected_files.zip');
      } else if (names[0]) {
        const response = await request(base, '/api/server/files/{library}/{name}', 'get', {
          path: { library, name: names[0] },
        });
        await saveGeneratedExport(await response.blob(), names[0]);
      }
    });
  }
  return (
    <section aria-label={heading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {!inDataLoader && <h2 className="text-heading-3 font-semibold">{heading}</h2>}
      {currentActions}
      <p className="text-description text-body-secondary">
        {library === 'data'
          ? 'Import copies selected files into the current project. Texts combine into one Data Block; tables and workbook sheets import separately.'
          : 'Projects belong to this server. Download a copy to keep it elsewhere.'}
      </p>
      <UploadCards library={library} />
      <div className="flex flex-wrap gap-2">
        {actions}
        <Button
          variant="secondary"
          disabled={!ready || busy}
          onClick={() => input.current?.click()}
        >
          Upload {library === 'data' ? 'data files' : 'projects'}
        </Button>
        <Button
          variant="ghost"
          disabled={files.isFetching}
          onClick={() => {
            void files.refetch();
          }}
        >
          Refresh
        </Button>
        {library === 'data' && (
          <>
            <Button
              disabled={!chosen.length || busy || !currentProject}
              onClick={() => navigate(() => inspect(chosen))}
            >
              Import selected
            </Button>
            <Button
              variant="outline"
              disabled={!chosen.length || busy}
              onClick={() => setMoving(true)}
            >
              Move selected
            </Button>
            <Button
              variant="outline"
              disabled={!chosen.length || busy}
              onClick={() => download(chosen, true)}
            >
              Download ZIP
            </Button>
          </>
        )}
        <Button
          variant="outline"
          disabled={!chosen.length || busy || chosen.some(isOpen)}
          onClick={() => setRemove(chosen)}
        >
          Delete selected
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label={library === 'data' ? 'Upload data files' : 'Upload projects'}
        accept={library === 'projects' ? '.wfpj' : undefined}
        onChange={(event) => {
          upload(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {library === 'data' && (
        <>
          <nav
            aria-label="Folders"
            className="max-h-36 overflow-auto rounded-md border p-2 text-body-secondary"
          >
            <Button
              variant={folder === '' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFolder('')}
            >
              All data files
            </Button>
            {folders.map((entry) => (
              <div
                key={entry.name}
                style={{ paddingInlineStart: `${(entry.name.split('/').length - 1) * 12}px` }}
              >
                <Button
                  variant={folder === entry.name ? 'secondary' : 'ghost'}
                  size="sm"
                  title={entry.name}
                  onClick={() => setFolder(entry.name)}
                >
                  ▸ {basename(entry.name)}
                </Button>
              </div>
            ))}
          </nav>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newFolder.trim()) return;
              run(async () => {
                await request(base, '/api/server/files/folder', 'post', {
                  body: { name: folder ? `${folder}/${newFolder.trim()}` : newFolder.trim() },
                });
                setNewFolder('');
              });
            }}
          >
            <Input
              aria-label="New folder name"
              value={newFolder}
              className="min-w-32 flex-1"
              onChange={(event) => setNewFolder(event.target.value)}
            />
            <Button variant="outline" disabled={!newFolder.trim() || operation.isPending}>
              New folder
            </Button>
          </form>
          <p className="break-all text-body-secondary">{folder || 'Data files'}</p>
        </>
      )}
      {shownPlan && (
        <FileImportSelection
          key={JSON.stringify([shownPlan.names, shownPlan.projectId])}
          plan={shownPlan.plan}
          onCancel={() => {
            if (plan) setPlan(null);
            else onIncomingHandled?.();
          }}
          onImport={(selected) => {
            const current = shownPlan;
            if (plan) setPlan(null);
            else onIncomingHandled?.();
            run(async () => {
              setReport(await importFiles(base, current.projectId, current.names, selected));
            });
          }}
        />
      )}
      {report && <SkippedImportFiles files={report.skipped} />}
      {operation.isPending && <p role="status">Working…</p>}
      {library === 'data' ? (
        <RunError
          name="Import"
          title="Could not complete file operation"
          taskLabel="Import local data"
          tasks={tasks}
          active={visible && !remove && !moving}
          busy={operation.isPending}
          error={operation.error}
          onRetry={operation.error ? () => operation.mutate(operation.variables) : undefined}
        />
      ) : (
        operation.error &&
        !remove &&
        !moving && (
          <OperationError
            title="Could not complete file operation"
            error={operation.error}
            onRetry={() => operation.mutate(operation.variables)}
          />
        )
      )}

      <Input
        ref={searchInput}
        aria-label={`Search ${heading.toLowerCase()}`}
        placeholder={`Search ${heading.toLowerCase()}`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {files.isPending && <p role="status">Loading files…</p>}
      {files.isError && (
        <OperationError
          title="Could not load files"
          error={files.error}
          onRetry={() => {
            void files.refetch();
          }}
        />
      )}
      {!files.isPending && !files.isError && shown.length === 0 && (
        <p className="text-description">
          {search ? `No matching ${heading.toLowerCase()}.` : 'This folder is empty.'}
        </p>
      )}
      <div
        className={`flex min-h-40 min-w-0 flex-1 flex-col overflow-auto rounded border border-surface-border p-3 ${dragging ? 'bg-list-hover' : ''}`}
        aria-label={
          library === 'data' ? 'Drop data files to upload' : 'Drop project files to upload'
        }
        onDragEnter={(event) => {
          if (!dropUpload) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!dropUpload) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragLeave={(event) => {
          if (!dropUpload) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(event) => {
          if (!dropUpload) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          upload(Array.from(event.dataTransfer.files));
        }}
      >
        <ul className="divide-y divide-surface-border">
          {shown.map((file) => (
            <li key={file.name} className="flex min-w-0 flex-wrap items-center gap-2 p-3">
              <Checkbox
                aria-label={`Select ${file.name}`}
                disabled={busy || Boolean(file.project)}
                checked={selected.has(file.name)}
                onCheckedChange={(checked) => choose(file.name, checked === true)}
              />
              <div className="min-w-32 flex-1">
                <p className="break-all font-medium">
                  {file.is_directory ? (
                    <Button
                      variant="link"
                      className="h-auto whitespace-normal p-0 text-left"
                      onClick={() => setFolder(file.name)}
                    >
                      ▸ {basename(file.name)}
                    </Button>
                  ) : (
                    basename(file.name)
                  )}
                </p>
                <p className="text-body-secondary text-description">
                  {file.is_directory
                    ? 'Folder'
                    : fileSize(file.project?.project?.size ?? file.size)}
                  {(file.project?.project?.modified ?? file.modified)
                    ? ` · Modified ${new Date((file.project?.project?.modified ?? file.modified ?? 0) * 1000).toLocaleString()}`
                    : ''}
                </p>
                {file.project && (
                  <p className="text-description text-body-secondary">
                    {file.project.project_id === currentProject?.project_id ? 'Current' : 'Open'} ·
                    Saved project
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    busy ||
                    (library === 'data' && !currentProject) ||
                    Boolean(file.project && file.project.project_id === currentProject?.project_id)
                  }
                  aria-label={
                    library === 'projects'
                      ? `Open ${file.name}`
                      : `Import ${file.name} into current project`
                  }
                  data-guidance-stage={library === 'data' ? 'action' : undefined}
                  onClick={() => {
                    if (library === 'projects') {
                      if (file.project) onSelectProject?.(file.project.project_id);
                      else onOpenProject?.(file.name);
                    } else navigate(() => inspect([file.name]));
                  }}
                >
                  {library === 'projects' ? 'Open' : 'Import'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${file.name}`}
                      disabled={busy}
                      onPointerDown={(event) => {
                        removeTrigger.current = event.currentTarget;
                      }}
                      onFocus={(event) => {
                        removeTrigger.current = event.currentTarget;
                      }}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => download([file.name])}>
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={Boolean(file.project)}
                      onSelect={() => {
                        operation.reset();
                        setRemove([file.name]);
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
        {ready && !files.isPending && !files.isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center text-description text-body-secondary">
            <Upload aria-hidden="true" className="size-12 stroke-[1.25]" />
            <p>
              {dragging
                ? 'Drop files to upload.'
                : inDataLoader
                  ? 'Drop files here to upload, or onto the graph to add them directly to your project.'
                  : library === 'projects'
                    ? 'Create a project or drop .wfpj files here to upload.'
                    : 'Drop data files here to upload and prepare your data.'}
            </p>
          </div>
        )}
      </div>
      <Dialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !operation.isPending) setRemove(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (removeTrigger.current?.isConnected) removeTrigger.current.focus();
            else searchInput.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (operation.isPending) event.preventDefault();
          }}
        >
          <DialogTitle>
            Delete {remove?.length === 1 ? remove[0] : `${remove?.length ?? 0} entries`}?
          </DialogTitle>
          <DialogDescription>
            {library === 'data'
              ? 'This permanently removes the selected files and folders. Data Blocks already imported into projects are retained.'
              : 'This permanently deletes the selected project files.'}
          </DialogDescription>
          {operation.error && (
            <OperationError title="Could not delete selection" error={operation.error} />
          )}
          <div className="flex justify-end gap-2">
            <Button
              autoFocus
              variant="ghost"
              disabled={operation.isPending}
              onClick={() => setRemove(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={operation.isPending}
              onClick={() => {
                if (!remove) return;
                const names = remove;
                run(async () => {
                  await request(base, '/api/server/files/delete-batch', 'post', {
                    body: { library, names },
                  });
                  setSelected(
                    (previous) => new Set([...previous].filter((name) => !names.includes(name))),
                  );
                  if (names.some((name) => folder === name || folder.startsWith(`${name}/`)))
                    setFolder('');
                  setRemove(null);
                });
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogTitle>Move selected files and folders</DialogTitle>
          <DialogDescription>Choose their destination folder.</DialogDescription>
          <select
            aria-label="Destination folder"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="rounded-md border bg-surface p-2"
          >
            <option value="">Data files</option>
            {folders.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
          {operation.error && (
            <OperationError title="Could not move selection" error={operation.error} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Cancel
            </Button>
            <Button
              disabled={operation.isPending}
              onClick={() =>
                run(async () => {
                  await request(base, '/api/server/files/move', 'post', {
                    body: { names: chosen, destination },
                  });
                  setSelected(new Set());
                  setMoving(false);
                })
              }
            >
              Move
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
