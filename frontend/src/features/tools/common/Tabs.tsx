import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { EditorTabs } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as api from '@/features/project/api';
export function Tabs({
  base,
  active,
  editing = false,
  kind,
  label,
  description,
  chosen,
  onActivate,
  onRemove,
  children,
}: {
  base: string;
  active: boolean;
  editing?: boolean;
  kind: api.AnalysisKind;
  label: string;
  description: string;
  chosen?: string;
  onActivate: (id: string) => void;
  onRemove: (id: string) => void;
  children: (tab: api.Tab) => ReactNode;
}) {
  const navigate = useEditingNavigation();
  const cache = useQueryClient();
  const key = ['native', base, 'tabs', kind];
  const tabs = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.listTabs(base, signal, kind),
  });
  const tab = tabs.data?.find((item) => item.id === chosen) ?? tabs.data?.[0];
  useEffect(() => {
    if (tab && tab.id !== chosen) onActivate(tab.id);
  }, [chosen, tab, onActivate]);
  const create = useMutation({
    mutationKey: [...key, 'create'],
    mutationFn: () => api.createTab(base, kind),
    onSuccess: async (created) => {
      await cache.cancelQueries({ queryKey: key });
      cache.setQueryData<api.Tab[]>(key, (old) => [
        ...(old ?? []).filter((item) => item.id !== created.id),
        created,
      ]);
      onActivate(created.id);
    },
  });
  const checked = useRef(false);
  const { mutate: createTab } = create;
  useEffect(() => {
    if (!active) {
      checked.current = false;
      return;
    }
    if (checked.current || editing || !tabs.isSuccess || tabs.isFetching) return;
    checked.current = true;
    if (
      !tabs.data.length &&
      !cache.isMutating({ mutationKey: ['native', base, 'tabs', kind, 'create'] })
    )
      createTab();
  }, [active, editing, tabs.isSuccess, tabs.isFetching, tabs.data, cache, base, kind, createTab]);
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateTab(base, id, { name }),
    onSuccess: (updated) =>
      cache.setQueryData<api.Tab[]>(key, (old) =>
        old?.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item)),
      ),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderTabs(base, kind, ids),
    onSuccess: (next) =>
      cache.setQueryData<api.Tab[]>(key, (old) =>
        old
          ?.map((item) => ({
            ...item,
            position: next.find((updated) => updated.id === item.id)?.position ?? item.position,
          }))
          .sort((a, b) => a.position - b.position),
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTab(base, id),
    onSuccess: (_, id) => {
      onRemove(id);
      cache.setQueryData<api.Tab[]>(key, (old) => old?.filter((item) => item.id !== id));
    },
  });
  return (
    <div
      data-testid={`${kind}-workspace`}
      className="@container/analysis flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-surface-border bg-surface text-foreground"
    >
      {tab && (
        <EditorTabs
          aria-label={`${label} analyses`}
          activeTabId={tab.id}
          tabs={(tabs.data ?? []).map((item) => ({ id: item.id, title: item.name }))}
          onActivate={(id) => {
            if (id !== tab.id)
              navigate(() => {
                onActivate(id);
              });
          }}
          onCreate={
            editing || create.isPending
              ? undefined
              : () => {
                  navigate(() => {
                    create.mutate();
                  });
                }
          }
          onClose={
            editing || remove.isPending
              ? undefined
              : (id) => {
                  navigate(() => {
                    remove.mutate(id);
                  });
                }
          }
          onRename={
            editing
              ? undefined
              : (id, name) => {
                  rename.mutate({ id, name });
                }
          }
          onReorder={
            editing
              ? undefined
              : (ids) => {
                  reorder.mutate(ids);
                }
          }
        />
      )}
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="space-y-3 p-3">
          {tabs.isPending || (create.isPending && !tab) ? (
            <p role="status">Loading {label}…</p>
          ) : tabs.isError ? (
            <div role="alert">
              Could not load analyses.{' '}
              <Button
                onClick={() => {
                  void tabs.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : tab ? (
            children(tab)
          ) : (
            <section className="space-y-3">
              <h1>{label}</h1>
              <p>{description}</p>
              <Button
                disabled={editing || create.isPending}
                onClick={() => {
                  navigate(() => {
                    create.mutate();
                  });
                }}
              >
                New {label} analysis
              </Button>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
