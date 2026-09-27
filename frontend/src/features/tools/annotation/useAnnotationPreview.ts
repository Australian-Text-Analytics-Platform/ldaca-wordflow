import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import * as api from '@/features/project/api';
import { objectDependencies } from '@/features/project/projectChanges';
import { reportProjectError } from '@/features/project/projectErrors';

export function useAnnotationPreview(base: string, tab: string, active: boolean) {
  const cache = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    request: api.AnnotationRequest;
    page: number;
    size: number;
    startedAt: number;
    data?: api.AnnotationPreview;
    error?: string;
    outdated?: boolean;
  } | null>(null);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setState(null);
  }
  const clear = () => {
    controller.current?.abort();
    controller.current = null;
    setState(null);
    cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', tab] });
  };
  useEffect(() => {
    if (!active) {
      controller.current?.abort();
      controller.current = null;
    }
    return () => {
      controller.current?.abort();
      controller.current = null;
      cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', tab] });
    };
  }, [active, base, tab, cache]);
  // Only a dependency marker is cached, never predictions. Invalidation marks stale without inference.
  useQuery({
    queryKey: ['native', base, 'analysis-preview', tab, 'source-watch', state?.startedAt],
    queryFn: () => null,
    initialData: null,
    enabled: false,
    staleTime: Infinity,
    meta: objectDependencies(
      ...(state
        ? [
            state.request.setup.source,
            ...(state.request.setup.codebook ? [state.request.setup.codebook.source] : []),
            ...(state.request.examples ? [state.request.examples.source] : []),
          ]
        : []),
    ),
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
          key[4] === 'source-watch'
        )
          setState((old) => (old ? { ...old, outdated: true } : old));
      }),
    [base, tab, cache],
  );
  const submit = (request: api.AnnotationRequest, page = 1, size = 10) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const captured = structuredClone(request);
    setState({ request: captured, page, size, startedAt: Date.now() });
    void api
      .previewAnnotation(base, tab, captured, page, size, current.signal)
      .then((data) => {
        if (controller.current !== current || current.signal.aborted) return;
        setState((old) =>
          old ? { ...old, data, outdated: old.outdated === true || data.outdated } : old,
        );
      })
      .catch((error: unknown) => {
        if (controller.current !== current || current.signal.aborted) return;
        setState((old) =>
          old ? { ...old, error: error instanceof Error ? error.message : String(error) } : old,
        );
        reportProjectError(error, 'Annotation Preview');
      });
  };
  return { state, submit, clear };
}
