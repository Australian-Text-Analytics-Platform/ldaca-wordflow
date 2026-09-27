import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServer } from '@/features/server/context';
import { FileLibrary } from '@/features/server/FileLibrary';
import { uploadFile, importFile } from '@/features/server/api';
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
  const uploaded = useMutation({
    mutationFn: async (files: File[]) => {
      if (!server) return;
      const {
        base: host,
        status: { session_id: session },
      } = server;
      for (const file of files) {
        const stored = await uploadFile(host, 'data', file);
        await cache.invalidateQueries({ queryKey: ['server-files', host, 'data'] });
        await importFile(host, session, stored.name);
      }
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
      data-project-file-drop="loader"
    >
      <header className="flex shrink-0 items-center justify-between gap-2">
        <h1 className="text-heading-2 font-semibold">Data Loader</h1>
        <HelpIcon targetKey="data-loader.tab" label="Data Loader help" />
      </header>
      <Tabs value={source} onValueChange={setSource} className="min-h-0 flex-1 gap-4">
        <TabsList aria-label="Data sources" className="shrink-0">
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
              <p className="text-description text-body-secondary">
                Drop files here or onto the graph to upload and import them.
              </p>
              {uploaded.isPending && <p role="status">Uploading and importing…</p>}
              <FileLibrary library="data" />
            </>
          ) : (
            <LocalFileImport
              base={base}
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
          <NativeSampleImport base={base} active={active && source === 'samples'} />
        </TabsContent>
        <TabsContent
          value="ldaca"
          hidden={source !== 'ldaca'}
          forceMount
          className="flex min-h-0 flex-col data-[state=inactive]:hidden"
        >
          <NativeLdacaImport base={base} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
