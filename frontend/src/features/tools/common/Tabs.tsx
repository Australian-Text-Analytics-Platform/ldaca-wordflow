import { EditorTabs } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import * as analysesApi from '@/features/tools/common/analysisApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
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
  help,
}: {
  base: string;
  active: boolean;
  editing?: boolean;
  kind: analysesApi.AnalysisKind;
  label: string;
  description: string;
  chosen?: string;
  onActivate: (id: string) => void;
  onRemove: (id: string) => void;
  children: (tab: analysesApi.Tab) => ReactNode;
  help?: ReactNode;
}) {
  const navigate = useEditingNavigation();
  const cache = useQueryClient();
  const key = ['native', base, 'tabs', kind];
  const tabs = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => analysesApi.listTabs(base, signal, kind),
  });
  const tab = tabs.data?.find((item) => item.id === chosen) ?? tabs.data?.[0];
  useEffect(() => {
    if (tab && tab.id !== chosen) onActivate(tab.id);
  }, [chosen, tab, onActivate]);
  const create = useMutation({
    mutationKey: [...key, 'create'],
    mutationFn: () => analysesApi.createTab(base, kind),
    onSuccess: async (created) => {
      await cache.cancelQueries({ queryKey: key });
      cache.setQueryData<analysesApi.Tab[]>(key, (old) => [
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
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      analysesApi.updateTab(base, id, { name }),
    onSuccess: (updated) =>
      cache.setQueryData<analysesApi.Tab[]>(key, (old) =>
        old?.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item)),
      ),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => analysesApi.reorderTabs(base, kind, ids),
    onSuccess: (next) =>
      cache.setQueryData<analysesApi.Tab[]>(key, (old) =>
        old
          ?.map((item) => ({
            ...item,
            position: next.find((updated) => updated.id === item.id)?.position ?? item.position,
          }))
          .sort((a, b) => a.position - b.position),
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => analysesApi.deleteTab(base, id),
    onSuccess: (_, id) => {
      onRemove(id);
      cache.setQueryData<analysesApi.Tab[]>(key, (old) => old?.filter((item) => item.id !== id));
    },
  });
  return (
    <div
      data-testid={`${kind}-workspace`}
      className="@container/analysis flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-surface-border bg-surface text-foreground"
    >
      {tab && (
        <EditorTabs
          className="shrink-0"
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
      <ScrollArea data-testid={`${kind}-content`} className="min-h-0 min-w-0 flex-1">
        <div className="space-y-3 p-3">
          {tabs.isPending || (!tab && tabs.isFetching) || (create.isPending && !tab) ? (
            <p role="status">
              {create.isPending && !tab ? `Creating ${label} analysis…` : 'Loading analyses…'}
            </p>
          ) : tabs.isError ? (
            <div role="alert">
              Could not load {label} analyses.{' '}
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
              <div className="flex items-center gap-2">
                <h1>{label}</h1>
                {help}
              </div>
              {create.isError ? (
                <p role="alert">Could not create a {label} analysis.</p>
              ) : (
                <p>{description}</p>
              )}
              <Button
                disabled={editing || create.isPending}
                onClick={() => {
                  navigate(() => {
                    create.mutate();
                  });
                }}
              >
                {create.isError ? 'Retry' : `New ${label} analysis`}
              </Button>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
