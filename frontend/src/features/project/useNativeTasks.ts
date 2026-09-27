import { toast } from 'sonner';
import { reconcileAnalysisDrafts } from '@/features/tools/common/reconcileAnalysisDrafts';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import { refreshProjectQueries, type ChangeScope } from './projectChanges';
import { reportProjectError } from './projectErrors';

function latestTasks(previous: api.TaskSnapshot | undefined, next: api.TaskSnapshot) {
  return previous && previous.revision > next.revision ? previous : next;
}
export function useNativeTasks(base: string) {
  const cache = useQueryClient();
  const [reconnecting, setReconnecting] = useState(false);
  const key = ['native', base, 'tasks'];
  const tasks = useQuery({
    queryKey: key,
    queryFn: async ({ signal, queryKey }) => {
      const snapshot = await api.getTasks(base, signal);
      return latestTasks(cache.getQueryData(queryKey), snapshot);
    },
    meta: { reportError: false },
    staleTime: Infinity,
  });
  useEffect(() => {
    const queryKey = ['native', base, 'tasks'];
    let revision = -1;
    const observed = new Set<string>();
    let disposed = false;
    let pending: ChangeScope | null = null;
    let refreshing = false;
    function refresh(change: ChangeScope) {
      if (change.renames?.length) reconcileAnalysisDrafts(base, change.renames);
      pending = {
        all: pending?.all === true || change.all === true,
        objects: [...(pending?.objects ?? []), ...(change.objects ?? [])],
        resources: [...new Set([...(pending?.resources ?? []), ...(change.resources ?? [])])],
        analysis_ids: [
          ...new Set([...(pending?.analysis_ids ?? []), ...(change.analysis_ids ?? [])]),
        ],
      };
      if (refreshing) return;
      refreshing = true;
      queueMicrotask(() => {
        void (async () => {
          try {
            while (pending && !disposed) {
              const next = pending;
              pending = null;
              await refreshProjectQueries(cache, base, next);
            }
          } finally {
            refreshing = false;
          }
        })();
      });
    }
    function observe(next: api.TaskSnapshot) {
      if (next.revision <= revision) return;
      const retained = new Set(next.tasks.map((task) => task.id));
      for (const id of observed) if (!retained.has(id)) observed.delete(id);
      const initial = revision === -1;
      revision = next.revision;
      for (const task of next.tasks) {
        if (task.finished_at === null || observed.has(task.id)) continue;
        observed.add(task.id);
        if (initial) continue;
        if (task.state === 'succeeded' && task.notice)
          toast.info(task.label, { description: task.notice, id: `task-${base}-${task.id}` });
        if (task.state === 'failed' && task.error)
          reportProjectError(task.error, task.label, `task-${base}-${task.id}`, task.id);
      }
    }
    const initial = cache.getQueryData<api.TaskSnapshot>(queryKey);
    if (initial) observe(initial);
    // HTTP, SSE and cancellation responses all update the same query authority.
    const unsubscribe = cache.getQueryCache().subscribe((event) => {
      const [host, connection, resource] = event.query.queryKey as readonly unknown[];
      if (host === 'native' && connection === base && resource === 'tasks') {
        const snapshot = event.query.state.data as api.TaskSnapshot | undefined;
        if (snapshot) observe(snapshot);
      }
    });
    const events = new EventSource(`${base}/api/project/events`);
    events.addEventListener('tasks', (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as api.TaskSnapshot;
      cache.setQueryData<api.TaskSnapshot>(queryKey, (old) => latestTasks(old, next));
      setReconnecting(false);
    });
    events.addEventListener('change', (event: MessageEvent<string>) => {
      refresh(JSON.parse(event.data) as ChangeScope);
    });
    events.addEventListener('reset', () => {
      refresh({ all: true });
    });
    events.onerror = () => {
      setReconnecting(true);
    };
    return () => {
      disposed = true;
      unsubscribe();
      events.close();
    };
  }, [base, cache]);
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelTask(base, id),
    onSuccess: (next) => {
      cache.setQueryData<api.TaskSnapshot>(key, (old) => latestTasks(old, next));
    },
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.dismissTask(base, id),
    onSuccess: (next) => {
      cache.setQueryData<api.TaskSnapshot>(key, (old) => latestTasks(old, next));
    },
  });
  return {
    tasks: tasks.data?.tasks ?? [],
    reconnecting: reconnecting || tasks.isError,
    cancel: (id: string) => {
      cancel.mutate(id);
    },
    dismiss: (id: string) => {
      dismiss.mutate(id);
    },
    cancellingId: cancel.isPending ? cancel.variables : undefined,
    dismissingId: dismiss.isPending ? dismiss.variables : undefined,
  };
}
