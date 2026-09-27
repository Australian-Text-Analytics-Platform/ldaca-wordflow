import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { reportProjectError } from '@/features/project/projectErrors';
import { request } from '@/features/project/api';
import { saveGeneratedExport } from '@/features/tools/common/chartExport';
import { importFile, uploadFile, type Library } from './api';
import { useServer } from './context';

export function FileLibrary({
  library,
  onOpenProject,
}: {
  library: Library;
  onOpenProject?: (name: string) => void;
}) {
  const server = useServer();
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const base = server?.base ?? '';
  useEffect(() => () => controller?.abort(), [controller]);
  const files = useQuery({
    queryKey: ['server-files', base, library],
    enabled: Boolean(server),
    queryFn: async ({ signal }) =>
      (
        await request(base, '/api/server/files/{library}', 'get', { path: { library }, signal })
      ).json(),
  });
  const operation = useMutation({
    meta: { reportError: false },
    onError: (error) => {
      if (!(error instanceof Error && error.name === 'AbortError')) reportProjectError(error);
    },
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['server-files', base, library] });
    },
  });
  if (!server) return null;
  const currentName = server.status.project?.path?.split(/[\\/]/).at(-1);
  const run = (action: () => Promise<unknown>) => {
    operation.mutate(action);
  };
  const upload = async (chosen: File[]) => {
    const abort = new AbortController();
    setController(abort);
    try {
      for (const file of chosen) await uploadFile(base, library, file, abort.signal);
    } finally {
      setController(null);
    }
  };
  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-3">
      <p className="text-description text-body-secondary">
        {library === 'data'
          ? 'Files are stored independently of projects. Import copies their contents into the current project.'
          : 'Saved projects belong to this server. Download a copy to keep it outside this session.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={operation.isPending} onClick={() => input.current?.click()}>
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
        {controller && (
          <Button
            variant="ghost"
            onClick={() => {
              controller.abort();
            }}
          >
            Cancel upload
          </Button>
        )}
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
          run(() => upload(chosen));
        }}
      />
      {operation.isPending && <p role="status">Working…</p>}
      {files.isPending && <p role="status">Loading files…</p>}
      {files.isError && <p role="alert">Could not load files. Use Refresh to retry.</p>}
      {files.data?.length === 0 && (
        <p className="text-description">
          No {library === 'data' ? 'data files' : 'saved projects'} yet.
        </p>
      )}
      <div className="max-h-[55vh] min-w-0 overflow-auto rounded border border-surface-border">
        <ul className="divide-y divide-surface-border">
          {files.data?.map((file) => (
            <li key={file.name} className="flex min-w-0 flex-wrap items-center gap-2 p-3">
              <div className="min-w-40 flex-1">
                <p className="break-all font-medium">
                  {file.name}
                  {library === 'projects' && file.name === currentName ? ' · Open' : ''}
                </p>
                <p className="text-body-secondary text-description">
                  {new Intl.NumberFormat().format(file.size)} bytes
                  {file.modified ? ` · ${new Date(file.modified * 1000).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  disabled={operation.isPending}
                  onClick={() => {
                    if (library === 'projects') onOpenProject?.(file.name);
                    else run(() => importFile(base, server.status.session_id, file.name));
                  }}
                >
                  {library === 'projects' ? 'Open' : 'Import'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={operation.isPending}
                  onClick={() => {
                    run(async () => {
                      const response = await request(
                        base,
                        '/api/server/files/{library}/{name}',
                        'get',
                        { path: { library, name: file.name } },
                      );
                      await saveGeneratedExport(await response.blob(), file.name);
                    });
                  }}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    operation.isPending || (library === 'projects' && file.name === currentName)
                  }
                  onClick={() => {
                    setRemove(file.name);
                  }}
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
          <DialogTitle>Delete {remove}?</DialogTitle>
          <DialogDescription>
            {library === 'data'
              ? 'This removes the uploaded file. Data Blocks already copied into projects are retained.'
              : 'This permanently deletes the saved project file.'}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setRemove(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={operation.isPending}
              onClick={() => {
                if (remove)
                  run(async () => {
                    await request(base, '/api/server/files/{library}/{name}', 'delete', {
                      path: { library, name: remove },
                    });
                    setRemove(null);
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
