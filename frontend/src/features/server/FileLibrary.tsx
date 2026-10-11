import { request } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { saveGeneratedExport } from '@/lib/download';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { importFile, uploadFile, type Library, type LibraryFile } from './api';
import { type ServerStatus } from './context';

const projectFilename = (project: ServerStatus) => project.project?.path?.split(/[\\/]/).at(-1);
function fileSize(size: number) {
  const unit = size < 1024 ? 0 : size < 1024 ** 2 ? 1 : size < 1024 ** 3 ? 2 : 3;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit ? 1 : 0 }).format(size / 1024 ** unit)} ${['bytes', 'KB', 'MB', 'GB'][unit]}`;
}

/** Server libraries are available even when this browser has not selected a project. */
export function FileLibrary({
  base,
  library,
  currentProject,
  projects = [],
  onOpenProject,
  onSelectProject,
  actions,
  currentActions,
  ready = true,
  disabled = false,
  dropUpload = false,
  inDataLoader = false,
}: {
  base: string;
  library: Library;
  currentProject?: ServerStatus;
  projects?: ServerStatus[];
  onOpenProject?: (name: string) => void;
  onSelectProject?: (id: string) => void;
  actions?: ReactNode;
  currentActions?: ReactNode;
  ready?: boolean;
  disabled?: boolean;
  dropUpload?: boolean;
  inDataLoader?: boolean;
}) {
  const cache = useQueryClient();
  const navigate = useEditingNavigation();
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const removeTrigger = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [remove, setRemove] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [uploading, setUploading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  useEffect(() => () => controller?.abort(), [controller]);
  const files = useQuery({
    queryKey: ['server-files', base, library],
    enabled: ready,
    queryFn: async ({ signal }) =>
      (
        await request(base, '/api/server/files/{library}', 'get', { path: { library }, signal })
      ).json(),
  });
  const operation = useMutation({
    meta: { reportError: false },
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSettled: async () => {
      await cache.invalidateQueries({ queryKey: ['server-files', base, library] });
    },
  });
  const run = (action: () => Promise<unknown>) => {
    setFeedback('');
    operation.mutate(action);
  };
  const upload = async (chosen: File[]) => {
    if (library === 'projects' && chosen.some((file) => !file.name.toLowerCase().endsWith('.wfpj')))
      throw new Error('Choose Wordflow project files (.wfpj).');
    const abort = new AbortController();
    setController(abort);
    try {
      for (const file of chosen) {
        setUploading(file.name);
        await uploadFile(base, library, file, abort.signal);
      }
      setFeedback(
        `${chosen.length === 1 ? 'File' : 'Files'} uploaded. ${library === 'data' ? 'Import into a project when you are ready.' : 'Choose Open to start working.'}`,
      );
    } finally {
      setController(null);
      setUploading('');
    }
  };
  const rows: { key: string; name: string; file?: LibraryFile; project?: ServerStatus }[] = (
    files.data ?? []
  ).map((file) => ({
    key: file.name,
    name: file.name,
    file,
    project:
      library === 'projects'
        ? projects.find((project) => projectFilename(project) === file.name)
        : undefined,
  }));
  if (library === 'projects') {
    for (const project of projects) {
      if (!rows.some((row) => row.project?.project_id === project.project_id))
        rows.push({
          key: project.project_id,
          name: projectFilename(project) ?? project.project?.title ?? 'Untitled',
          project,
        });
    }
  }
  const matching = rows.filter((row) =>
    row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const busy = disabled || operation.isPending;
  const heading = library === 'data' ? 'Data files' : 'Projects';
  return (
    <section aria-label={heading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {!inDataLoader && (
        <div>
          <h2 className="text-heading-3 font-semibold">{heading}</h2>
          {(dropUpload || library === 'projects') && (
            <p className="mt-1 text-description text-body-secondary">
              {library === 'data'
                ? 'Upload files here, then import a copy into a project.'
                : 'Create a project or open a saved Wordflow file.'}
            </p>
          )}
        </div>
      )}
      {currentActions}
      <div className="flex flex-wrap gap-2">
        {actions}
        <Button
          variant="secondary"
          disabled={!ready || busy}
          onClick={() => input.current?.click()}
        >
          Upload {library === 'data' ? 'data files' : 'projects'}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label={library === 'data' ? 'Upload data files' : 'Upload projects'}
        accept={library === 'projects' ? '.wfpj' : '.csv,.tsv,.parquet,.json,.jsonl,.ndjson'}
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (chosen.length) run(() => upload(chosen));
        }}
      />
      <div className="flex items-center gap-2">
        <Input
          ref={searchInput}
          className="min-w-0 flex-1"
          aria-label={`Search ${heading.toLowerCase()}`}
          placeholder={`Search ${heading.toLowerCase()}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`Refresh ${heading.toLowerCase()}`}
          title={`Refresh ${heading.toLowerCase()}`}
          disabled={!ready || files.isFetching || busy}
          onClick={() => {
            void files.refetch();
          }}
        >
          <RefreshCw
            aria-hidden="true"
            className={files.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}
          />
        </Button>
      </div>
      {operation.isPending && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-description">
          <span className="min-w-0 break-all">
            {uploading ? `Uploading ${uploading}…` : 'Working…'}
          </span>
          {controller && (
            <Button variant="ghost" size="sm" onClick={() => controller.abort()}>
              Cancel upload
            </Button>
          )}
        </div>
      )}
      {operation.isError &&
        !(operation.error instanceof Error && operation.error.name === 'AbortError') && (
          <p role="alert" className="break-words text-description text-error">
            {operation.error.message} Try again or choose another filename.
          </p>
        )}
      {feedback && (
        <p role="status" className="text-description">
          {feedback}
        </p>
      )}
      <div
        aria-label={`Drop ${library === 'projects' ? 'project' : 'data'} files to upload`}
        className={`flex min-h-[12rem] min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-dashed p-3 ${dragging ? 'border-focus bg-list-hover' : 'border-description/40'}`}
        onDragEnter={(event) => {
          if (!dropUpload || !event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current += 1;
          if (ready && !busy) setDragging(true);
        }}
        onDragOver={(event) => {
          if (!dropUpload || !event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = ready && !busy ? 'copy' : 'none';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(event) => {
          if (!dropUpload) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          const chosen = Array.from(event.dataTransfer.files);
          if (ready && !busy && chosen.length) run(() => upload(chosen));
        }}
      >
        {!ready || files.isPending ? (
          <div role="status" className="space-y-3 py-3 text-description text-body-secondary">
            <p>Loading {heading.toLowerCase()}…</p>
            <div aria-hidden="true" className="h-8 rounded-sm bg-panel" />
            <div aria-hidden="true" className="h-8 rounded-sm bg-panel" />
          </div>
        ) : files.isError ? (
          <div role="alert" className="py-4 text-description">
            <p>Could not load {heading.toLowerCase()}.</p>
            <Button
              variant="ghost"
              onClick={() => {
                void files.refetch();
              }}
            >
              Retry {heading.toLowerCase()}
            </Button>
          </div>
        ) : matching.length === 0 && search ? (
          <p className="py-3 text-description text-body-secondary">
            No matching {heading.toLowerCase()}.
          </p>
        ) : null}
        <ul className="shrink-0 divide-y divide-surface-border">
          {matching.map(({ key, name, file, project }) => {
            const size = project?.project?.size ?? file?.size;
            const modified = project?.project?.modified ?? file?.modified;
            const current = Boolean(project && project.project_id === currentProject?.project_id);
            return (
              <li key={key} className="flex min-w-0 items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-medium">{name}</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-description text-body-secondary">
                    {project && (
                      <span className={current ? 'font-medium text-foreground' : ''}>
                        {current ? 'Current' : 'Open'}
                      </span>
                    )}
                    {size != null && <span>{fileSize(size)}</span>}
                    {modified != null && (
                      <span>Modified {new Date(modified * 1000).toLocaleString()}</span>
                    )}
                    {!file && <span>{project?.project?.path ? 'Saved project' : 'Not saved'}</span>}
                  </p>
                  {project && file && (
                    <p className="mt-1 text-description text-body-secondary">
                      Close this project to delete its file.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    data-guidance-stage={library === 'data' ? 'action' : undefined}
                    disabled={busy || current || (library === 'data' && !currentProject)}
                    aria-label={
                      library === 'projects'
                        ? `Open ${name}`
                        : `Import ${name} into current project`
                    }
                    onClick={() => {
                      if (library === 'projects') {
                        if (project) onSelectProject?.(project.project_id);
                        else onOpenProject?.(name);
                      } else if (currentProject)
                        navigate(() =>
                          run(async () => {
                            await importFile(base, currentProject.project_id, name);
                            setFeedback(
                              `${name} imported into ${currentProject.project?.title ?? 'Untitled'}.`,
                            );
                          }),
                        );
                    }}
                  >
                    {library === 'projects' ? 'Open' : 'Import'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Actions for ${name}`}
                        onPointerDown={(event) => {
                          removeTrigger.current = event.currentTarget;
                        }}
                        onFocus={(event) => {
                          removeTrigger.current = event.currentTarget;
                        }}
                        disabled={busy}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() =>
                          run(async () => {
                            const response = project
                              ? await request(base, '/api/server/project/{id}/download', 'get', {
                                  path: { id: project.project_id },
                                })
                              : await request(base, '/api/server/files/{library}/{name}', 'get', {
                                  path: { library, name },
                                });
                            await saveGeneratedExport(
                              await response.blob(),
                              file?.name ?? (project && projectFilename(project)) ?? `${name}.wfpj`,
                            );
                          })
                        }
                      >
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={Boolean(project)}
                        onSelect={() => setRemove(name)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
        {ready && !files.isPending && !files.isError && (
          <div className="flex flex-1 shrink-0 flex-col items-center justify-center gap-3 py-6 text-center text-description text-body-secondary">
            <Upload aria-hidden="true" className="size-12 stroke-[1.25]" />
            <p>
              {dragging
                ? 'Drop files to upload.'
                : inDataLoader
                  ? 'Drop files here to upload, or onto the graph to add them directly to your project.'
                  : library === 'projects'
                    ? 'Create a project or drop .wfpj files here to upload.'
                    : dropUpload
                      ? 'Drop data files here to upload and prepare your data.'
                      : 'Drop or upload data files here to prepare your data.'}
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
          <DialogTitle>Delete {remove}?</DialogTitle>
          <DialogDescription>
            {library === 'data'
              ? 'This removes the uploaded file. Data Blocks already copied into projects are retained.'
              : 'This permanently deletes the saved project file.'}
          </DialogDescription>
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
              variant="destructive"
              disabled={operation.isPending}
              onClick={() => {
                if (remove)
                  run(async () => {
                    await request(base, '/api/server/files/{library}/{name}', 'delete', {
                      path: { library, name: remove },
                    });
                    setRemove(null);
                    setFeedback(`${remove} deleted.`);
                  });
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
