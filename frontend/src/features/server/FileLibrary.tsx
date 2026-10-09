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
import { useEffect, useRef, useState } from 'react';
import { inspectImport, importFiles, type Library } from './api';
import { useServer } from './context';
import { startUpload, UploadCards, useUploads } from './uploads';
const parent = (name: string) => name.split('/').slice(0, -1).join('/');
const basename = (name: string) => name.split('/').at(-1) ?? name;
export function FileLibrary({
  library,
  tasks = [],
  onOpenProject,
  visible = true,
  incoming,
  onIncomingHandled,
}: {
  library: Library;
  tasks?: NativeTask[];
  onOpenProject?: (name: string) => void;
  visible?: boolean;
  incoming?: { names: string[]; projectId: string; plan: FileImportPlan } | null;
  onIncomingHandled?: () => void;
}) {
  const server = useServer();
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
  const base = server?.base ?? '';
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
    enabled: Boolean(server),
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
  if (!server) return null;
  const currentName = server.status.project?.path?.split(/[\\/]/).at(-1);
  const run = (action: () => Promise<unknown>) => operation.mutate(action);
  const folders = files.data?.filter((file) => file.is_directory) ?? [];
  const shown =
    files.data?.filter((file) => library === 'projects' || parent(file.name) === folder) ?? [];
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
    if (!server) return;
    const projectId = server.status.project_id;
    run(async () => {
      const inspected = await inspectImport(base, projectId, names);
      if (needsFileImportSelection(inspected)) setPlan({ names, projectId, plan: inspected });
      else setReport(await importFiles(base, projectId, names));
    });
  }
  function download(names: string[]) {
    run(async () => {
      if (library === 'data') {
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
    <section className="flex min-h-0 min-w-0 flex-col gap-3">
      <p className="text-description text-body-secondary">
        {library === 'data'
          ? 'Import copies selected files into the current project. Texts combine into one Data Block; tables and workbook sheets import separately.'
          : 'Projects belong to this server. Download a copy to keep it elsewhere.'}
      </p>
      <UploadCards library={library} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => input.current?.click()}>
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
              disabled={!chosen.length || operation.isPending}
              onClick={() => inspect(chosen)}
            >
              Import selected
            </Button>
            <Button
              variant="outline"
              disabled={!chosen.length || operation.isPending}
              onClick={() => setMoving(true)}
            >
              Move selected
            </Button>
            <Button
              variant="outline"
              disabled={!chosen.length || operation.isPending}
              onClick={() => download(chosen)}
            >
              Download ZIP
            </Button>
          </>
        )}
        <Button
          variant="outline"
          disabled={!chosen.length || operation.isPending}
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
          for (const file of Array.from(event.target.files ?? []))
            void startUpload(base, library, file, folder);
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
        <p className="text-description">This folder is empty.</p>
      )}
      <div className="max-h-[45vh] min-w-0 overflow-auto rounded border border-surface-border">
        <ul className="divide-y divide-surface-border">
          {shown.map((file) => (
            <li key={file.name} className="flex min-w-0 flex-wrap items-center gap-2 p-3">
              <Checkbox
                aria-label={`Select ${file.name}`}
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
                  {library === 'projects' && file.name === currentName ? ' · Open' : ''}
                </p>
                <p className="text-body-secondary text-description">
                  {file.is_directory ? 'Folder' : `${file.size.toLocaleString()} bytes`}
                  {file.modified ? ` · ${new Date(file.modified * 1000).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  disabled={operation.isPending}
                  onClick={() => {
                    if (library === 'projects') onOpenProject?.(file.name);
                    else inspect([file.name]);
                  }}
                >
                  {library === 'projects' ? 'Open' : 'Import'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={operation.isPending}
                  onClick={() => download([file.name])}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    operation.isPending || (library === 'projects' && file.name === currentName)
                  }
                  onClick={() => setRemove([file.name])}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Dialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <DialogContent>
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
            <Button variant="ghost" disabled={operation.isPending} onClick={() => setRemove(null)}>
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
