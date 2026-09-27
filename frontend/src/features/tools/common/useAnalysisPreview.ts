import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Pages and submitted Preview settings belong only to this mounted tab visit. */
export function useAnalysisPreview<Request>(
  base: string,
  id: string,
  active: boolean,
  handoff: { request: Request; generation: number } | undefined,
  consumeHandoff: (base: string, id: string) => void,
) {
  const cache = useQueryClient();
  const [submitted, setSubmitted] = useState(handoff);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setSubmitted(undefined);
  }
  const clear = () => {
    setSubmitted(undefined);
    void cache.cancelQueries({ queryKey: ['native', base, 'analysis-preview', id] });
    cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', id] });
  };
  useEffect(() => {
    consumeHandoff(base, id);
  }, [base, id, consumeHandoff]);
  useEffect(() => {
    if (!active) {
      void cache.cancelQueries({ queryKey: ['native', base, 'analysis-preview', id] });
      cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', id] });
    }
  }, [active, base, id, cache]);
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: ['native', base, 'analysis-preview', id] });
      cache.removeQueries({ queryKey: ['native', base, 'analysis-preview', id] });
    },
    [base, id, cache],
  );
  return {
    submitted,
    clear,
    submit: (request: Request) => {
      setSubmitted((previous) => ({ request, generation: (previous?.generation ?? 0) + 1 }));
    },
  };
}
