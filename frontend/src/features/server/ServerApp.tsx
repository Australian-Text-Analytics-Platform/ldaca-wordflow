import type { components } from '@/api/generated/native';
import { AccountControls } from './AccountControls';
import { request } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import ProjectApp from '@/features/project/ProjectApp';
import { createProjectQueryClient, reportProjectError } from '@/features/project/projectErrors';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ServerContext } from './context';
import { subscribeServerEvents } from './events';
import { captureProjectWindowState, restoreProjectWindowState } from './projectWindowState';

export default function ServerApp({ base }: { base: string }) {
  const [client] = useState(createProjectQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ServerProjects base={base} />
    </QueryClientProvider>
  );
}
function ServerProjects({ base }: { base: string }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState(() =>
    new URLSearchParams(window.location.search).get('project'),
  );
  const [clients, setClients] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('project');
    return new Map<string, ReturnType<typeof createProjectQueryClient>>(
      id ? [[id, createProjectQueryClient()]] : [],
    );
  });
  const observedProjects = useRef(new Set<string>());
  const windowStates = useRef(new Map<string, ReturnType<typeof captureProjectWindowState>>());
  const status = useQuery({
    queryKey: ['server', base],
    queryFn: async ({ signal }) => (await request(base, '/api/server', 'get', { signal })).json(),
  });
  useEffect(() => {
    return subscribeServerEvents(base, () => {
      void cache.invalidateQueries({ queryKey: ['server', base] });
    });
  }, [base, cache]);
  const project = status.data?.projects.find((project) => project.project_id === selected);
  const select = (id: string | null) => {
    if (id === selected) return;
    if (project) windowStates.current.set(project.project_id, captureProjectWindowState());
    restoreProjectWindowState(id ? windowStates.current.get(id) : undefined);
    if (id && !clients.has(id))
      setClients((current) => new Map(current).set(id, createProjectQueryClient()));
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('project', id);
    else url.searchParams.delete('project');
    window.history.replaceState(null, '', url);
  };
  useEffect(
    () =>
      cache.getQueryCache().subscribe((event) => {
        if (
          event.type !== 'updated' ||
          event.action.type !== 'success' ||
          event.query.queryKey[0] !== 'server' ||
          event.query.queryKey[1] !== base
        )
          return;
        const registry = cache.getQueryData<components['schemas']['ServerStatus']>([
          'server',
          base,
        ]);
        if (!registry) return;
        const opened = new Set(registry.projects.map((project) => project.project_id));
        const next = new Map(clients);
        for (const [id, client] of clients) {
          if (observedProjects.current.has(id) && !opened.has(id)) {
            void client.cancelQueries();
            client.clear();
            next.delete(id);
            windowStates.current.delete(id);
          }
        }
        observedProjects.current = opened;
        if (next.size !== clients.size) setClients(next);
      }),
    [cache, base, clients],
  );
  if (!status.data || !project)
    return (
      <main className="p-6">
        <Toaster />
        <AccountControls base={base} />
        <p role="status">
          {!status.data
            ? status.isError
              ? 'Could not connect to Wordflow.'
              : 'Opening Wordflow…'
            : selected
              ? 'This project is closed or its worker restarted. Reopen it from the library.'
              : 'Choose a project to begin.'}
        </p>
        {status.isError && (
          <Button
            onClick={() => {
              void status.refetch();
            }}
          >
            Retry
          </Button>
        )}
        {status.data && (
          <>
            <Button
              onClick={() => {
                void request(base, '/api/server/project', 'post', { body: { name: null } })
                  .then((response) => response.json())
                  .then((project) => {
                    select(project.project_id);
                    return status.refetch();
                  })
                  .catch(reportProjectError);
              }}
            >
              New project
            </Button>
            {status.data.projects.map((project) => (
              <Button
                key={project.project_id}
                onClick={() => {
                  select(project.project_id);
                }}
              >
                {project.project?.title ?? 'Untitled'}
              </Button>
            ))}
            <ProjectLibrary base={base} select={select} refresh={() => status.refetch()} />
          </>
        )}
      </main>
    );
  const client = clients.get(project.project_id);
  if (!client) return <p role="status">Opening project…</p>;
  return (
    <ServerContext
      value={{
        base,
        status: project,
        projects: status.data.projects,
        select,
        refresh: () => cache.invalidateQueries({ queryKey: ['server', base] }),
      }}
    >
      <ProjectApp
        key={project.project_id}
        queryClient={client}
        base={`${base}/project/${project.project_id}`}
      />
    </ServerContext>
  );
}
function ProjectLibrary({
  base,
  select,
  refresh,
}: {
  base: string;
  select: (id: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const files = useQuery({
    queryKey: ['server', base, 'projects'],
    queryFn: async () =>
      (
        await request(base, '/api/server/files/{library}', 'get', { path: { library: 'projects' } })
      ).json(),
  });
  return (
    <div>
      {files.data?.map((file) => (
        <Button
          key={file.name}
          onClick={() => {
            void request(base, '/api/server/project', 'post', { body: { name: file.name } })
              .then((response) => response.json())
              .then((project) => {
                select(project.project_id);
                return refresh();
              })
              .catch(reportProjectError);
          }}
        >
          Open {file.name}
        </Button>
      ))}
    </div>
  );
}
