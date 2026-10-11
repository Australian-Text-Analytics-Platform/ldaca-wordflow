import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServer } from '@/features/server/context';
import { FileLibrary } from '@/features/server/FileLibrary';
import { importFiles, inspectImport } from '@/features/server/api';
import { startUpload } from '@/features/server/uploads';
import { needsFileImportSelection, type FileImportPlan } from './filesApi';
import { OperationError } from './OperationError';
import { getTasks } from './tasksApi';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HelpIcon from '@/components/help/HelpIcon';
import { LocalFileImport } from './LocalFileImport';
import NativeSampleImport from './NativeSampleImport';
import NativeLdacaImport from './NativeLdacaImport';
import { useProjectFileDrop } from './useProjectFileDrop';

export function DataLoaderWorkspace({
  base,
  active,
  onActivate,
}: {
  base: string;
  active: boolean;
  onActivate: () => void;
}) {
  const server = useServer();
  const cache = useQueryClient();
  // Observe the existing window-level task query without owning another fetch or stream.
  const taskState = useQuery({
    queryKey: ['native', base, 'tasks'],
    queryFn: ({ signal }) => getTasks(base, signal),
    enabled: false,
    meta: { reportError: false },
  });
  const tasks = taskState.data?.tasks ?? [];
  const [incoming, setIncoming] = useState<{
    names: string[];
    projectId: string;
    plan: FileImportPlan;
  } | null>(null);
  const uploaded = useMutation({
    meta: { reportError: false },
    mutationFn: async (files: File[]) => {
      if (!server) return;
      const {
        base: host,
        status: { project_id: session },
      } = server;
      const stored = await Promise.all(files.map((file) => startUpload(host, 'data', file)));
      await cache.invalidateQueries({ queryKey: ['server-files', host, 'data'] });
      if (stored.some((file) => !file))
        throw new Error(
          'An upload did not finish. Review its card before importing the selection.',
        );
      const names = stored.filter((file) => file != null).map((file) => file.name);
      const plan = await inspectImport(host, session, names);
      if (needsFileImportSelection(plan)) return { names, projectId: session, plan };
      await importFiles(host, session, names);
      return null;
    },
    onSuccess: (plan) => {
      if (plan) setIncoming(plan);
    },
  });
  const [source, setSource] = useState('local');
  const [dropped, setDropped] = useState<string[]>([]);
  useProjectFileDrop(
    (paths) => {
      setSource('local');
      setDropped(paths);
      onActivate();
    },
    server
      ? (files) => {
          setSource('local');
          onActivate();
          uploaded.mutate(files);
        }
      : undefined,
  );
  return (
    <section
      className="data-[file-hover=true]:outline-2 data-[file-hover=true]:outline-focus data-[file-hover=true]:-outline-offset-2 @container/data-loader flex h-full min-h-0 min-w-0 flex-col gap-3"
      aria-label="Data Loader"
      data-project-file-drop={server ? undefined : 'loader'}
    >
      <header className="flex shrink-0 items-center justify-between gap-2">
        <h1 className="text-heading-2 font-semibold">Data Loader</h1>
        <HelpIcon targetKey="data-loader.tab" label="Data Loader help" />
      </header>
      <Tabs value={source} onValueChange={setSource} className="min-h-0 flex-1 gap-4">
        <TabsList data-guidance-stage="setup" aria-label="Data sources" className="shrink-0">
          <TabsTrigger value="local">{server ? 'Data files' : 'Local files'}</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="ldaca">LDaCA</TabsTrigger>
        </TabsList>
        <TabsContent
          value="local"
          hidden={source !== 'local'}
          forceMount
          className="flex min-h-0 flex-col data-[state=inactive]:hidden"
        >
          {server ? (
            <>
              {uploaded.isPending && <p role="status">Uploading and importing…</p>}
              {uploaded.error && !('taskId' in uploaded.error && uploaded.error.taskId) && (
                <OperationError title="Could not import dropped files" error={uploaded.error} />
              )}
              <FileLibrary
                dropUpload
                inDataLoader
                base={server.base}
                currentProject={server.status}
                library="data"
                tasks={tasks}
                visible={active && source === 'local'}
                incoming={incoming}
                onIncomingHandled={() => setIncoming(null)}
              />
            </>
          ) : (
            <LocalFileImport
              base={base}
              active={active && source === 'local'}
              tasks={tasks}
              dropped={dropped}
              onDropHandled={() => {
                setDropped([]);
              }}
            />
          )}
        </TabsContent>
        <TabsContent
          value="samples"
          hidden={source !== 'samples'}
          forceMount
          className="flex min-h-0 flex-col data-[state=inactive]:hidden"
        >
          <NativeSampleImport base={base} tasks={tasks} active={active && source === 'samples'} />
        </TabsContent>
        <TabsContent
          value="ldaca"
          hidden={source !== 'ldaca'}
          forceMount
          className="flex min-h-0 flex-col data-[state=inactive]:hidden"
        >
          <NativeLdacaImport base={base} tasks={tasks} active={active && source === 'ldaca'} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
