import type { components } from '@/api/generated/native';
import { request } from '@/api/client';
import { Toaster } from '@/components/ui/sonner';
import { HostSettings } from '@/features/settings/HostSettings';
import { TooltipProvider } from '@/components/ui/tooltip';
import ProjectApp from '@/features/project/ProjectApp';
import { createProjectQueryClient } from '@/features/project/projectErrors';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { UploadCards } from './uploads';
import { ServerContext } from './context';
import { subscribeServerEvents } from './events';
import { captureProjectWindowState, restoreProjectWindowState } from './projectWindowState';
import { ProjectDataDialog } from './ProjectDataDialog';

export default function ServerApp({ base }: { base: string }) {
  const [client] = useState(createProjectQueryClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <HostSettings base={base} client={client}>
          <ServerProjects base={base} />
          <UploadCards />
        </HostSettings>
      </TooltipProvider>
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
      void cache.invalidateQueries({ queryKey: ['server-files', base] });
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
          const entry = registry.projects.find((project) => project.project_id === id);
          if (entry) {
            void client.cancelQueries({ queryKey: ['native', `${base}/project/${id}`, 'project'] });
            client.setQueryData(['native', `${base}/project/${id}`, 'project'], entry.project);
            void client.invalidateQueries({ queryKey: ['server-files', base] });
          }
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
      <main className="flex min-h-dvh flex-col bg-editor text-foreground">
        <Toaster />
        <ProjectDataDialog
          base={base}
          projects={status.data?.projects ?? []}
          open
          onOpenChange={() => undefined}
          select={select}
          refresh={() => status.refetch()}
          ready={Boolean(status.data)}
          connectionError={status.isError}
          notice={
            status.data && selected
              ? 'This project is closed or its worker restarted. Reopen it from the library.'
              : undefined
          }
        />
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
