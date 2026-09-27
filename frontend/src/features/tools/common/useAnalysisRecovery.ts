import { useState, useSyncExternalStore } from 'react';
import { notifyManager, useQueryClient } from '@tanstack/react-query';

/** Read failures from the existing result cache; only render failures need local state. */
export function useAnalysisRecovery(base: string, analysisId: string | null) {
  const cache = useQueryClient().getQueryCache();
  const [renderFailure, setRenderFailure] = useState<string | null>(null);
  const queryFailed = useSyncExternalStore(
    (notify) => {
      // Observer subscriptions may change while another component renders.
      const schedule = notifyManager.batchCalls(notify);
      return cache.subscribe(({ query }) => {
        const [scope, connection, resource, id] = query.queryKey as readonly unknown[];
        if (
          scope === 'native' &&
          connection === base &&
          resource === 'analyses' &&
          id === analysisId
        )
          schedule();
      });
    },
    () =>
      Boolean(analysisId) &&
      cache
        .findAll({ queryKey: ['native', base, 'analyses', analysisId], type: 'active' })
        .some((query) => query.state.status === 'error'),
  );
  return {
    failed: queryFailed || (Boolean(analysisId) && renderFailure === analysisId),
    onRenderError: () => {
      setRenderFailure(analysisId);
    },
    reset: () => {
      setRenderFailure(null);
    },
  };
}
