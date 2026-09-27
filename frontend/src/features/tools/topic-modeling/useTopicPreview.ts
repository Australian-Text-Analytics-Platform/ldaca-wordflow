import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { objectDependencies } from '@/features/project/projectChanges';
import { reportProjectError } from '@/features/project/projectErrors';

export function useTopicPreview(base: string, tab: string, active: boolean) {
  const cache = useQueryClient();
  const connection = useRef<{
    controller: AbortController;
    id?: string;
    cancelling: boolean;
  } | null>(null);
  const [state, setState] = useState<{
    request: api.TopicRequest;
    startedAt: number;
    update?: api.TopicPreviewUpdate;
    error?: string;
    cancelling?: boolean;
    outdated?: boolean;
  } | null>(null);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setState(null);
  }
  const clear = () => {
    connection.current?.controller.abort();
    connection.current = null;
    setState(null);
    void cache.cancelQueries({ queryKey: ['native', base, 'analysis-preview', tab] });
    cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', tab] });
  };
  useEffect(() => {
    if (!active) {
      connection.current?.controller.abort();
      connection.current = null;
    }
    return () => {
      connection.current?.controller.abort();
      connection.current = null;
      void cache.cancelQueries({ queryKey: ['native', base, 'analysis-preview', tab] });
      cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', tab] });
    };
  }, [active, base, tab, cache]);
  // This passive query participates in existing dependency invalidation. It never
  // fits a model; only an explicit Preview action opens the fitting connection.
  useQuery({
    queryKey: ['native', base, 'analysis-preview', tab, 'source-watch', state?.update?.preview_id],
    queryFn: () => null,
    initialData: null,
    enabled: false,
    meta: objectDependencies(...(state?.request.inputs.map((input) => input.source) ?? [])),
    staleTime: Infinity,
  });
  useEffect(
    () =>
      cache.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey as readonly unknown[];
        if (
          event.type === 'updated' &&
          event.action.type === 'invalidate' &&
          key[0] === 'native' &&
          key[1] === base &&
          key[2] === 'analysis-preview' &&
          key[3] === tab &&
          key[4] === 'source-watch' &&
          event.query.state.isInvalidated
        ) {
          setState((old) => (old ? { ...old, outdated: true } : old));
        }
      }),
    [base, tab, cache],
  );
  const submit = (request: api.TopicRequest, sampling: api.TopicSampling[]) => {
    clear();
    const current = {
      controller: new AbortController(),
      cancelling: false,
      id: undefined as string | undefined,
    };
    connection.current = current;
    const captured = structuredClone({ request, sampling });
    setState({ request: captured.request, startedAt: Date.now() });
    void api
      .streamTopicPreview(base, tab, captured, current.controller.signal, (update) => {
        if (connection.current !== current || current.cancelling) return;
        current.id = update.preview_id;
        setState((old) => (old ? { ...old, update } : old));
      })
      .catch((error: unknown) => {
        if (
          connection.current !== current ||
          current.controller.signal.aborted ||
          current.cancelling
        )
          return;
        setState((old) =>
          old
            ? {
                ...old,
                error: error instanceof Error ? error.message : String(error),
                outdated: true,
              }
            : old,
        );
        reportProjectError(error, 'Topic Modelling Preview');
      });
  };
  const cancel = async () => {
    const current = connection.current;
    if (!current) return;
    current.cancelling = true;
    setState((old) => (old ? { ...old, cancelling: true } : old));
    try {
      if (current.id) await api.deleteTopicPreview(base, tab, current.id);
    } catch (error) {
      if (!current.controller.signal.aborted) reportProjectError(error);
    } finally {
      if (connection.current === current) clear();
    }
  };
  return { state, submit, clear, cancel };
}
