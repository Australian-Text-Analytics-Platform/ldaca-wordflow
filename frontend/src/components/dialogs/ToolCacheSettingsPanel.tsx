import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  clearUserToolCacheMutation,
  listToolCachesOptions,
  listToolCachesQueryKey,
  type ToolCacheResource,
} from '@/api';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/features/views/data-loader/utils/format';
import { toastError } from '@/lib/toastError';

type ToolCacheKind = ToolCacheResource['kind'];

const TOOL_CACHES: Record<ToolCacheKind, { name: string; description: string }> = {
  topic_modeling: {
    name: 'Topic Modelling',
    description: 'Text already read into the topic model, so later runs on it are faster.',
  },
  tokeniser: {
    name: 'Tokeniser',
    description: 'Text already split into tokens by tokeniser models, for faster reruns.',
  },
};

/**
 * Shows the current user's tool caches with their size and a Clear button
 * (issue 334; v0.5.4 had one, v0.8 plans automatic clean-up in issue 259).
 * Rendered by: SettingsDialog's Project tab, under the data folder.
 * Flow: list the sizes, ask for an inline confirmation, clear one cache, and
 * report the space freed. The backend refuses while an analysis uses it.
 */
export function ToolCacheSettingsPanel() {
  const queryClient = useQueryClient();
  const caches = useQuery(listToolCachesOptions());
  const [confirming, setConfirming] = useState<ToolCacheKind | null>(null);
  const clear = useMutation({
    ...clearUserToolCacheMutation(),
    onSuccess: (result) => {
      const { name } = TOOL_CACHES[result.kind];
      toast.success(
        result.freed_bytes > 0
          ? `Cleared ${formatBytes(result.freed_bytes)} from the ${name} cache.`
          : `The ${name} cache was already empty.`,
      );
    },
    onError: (error) => {
      toastError(error, "Couldn't clear the cache.");
    },
    onSettled: () => {
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: listToolCachesQueryKey() });
    },
  });

  if (caches.isError) {
    return (
      <div className="flex items-center justify-between gap-3 text-label-secondary text-error">
        <span>Couldn't load the cache sizes.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void caches.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(caches.data?.caches ?? []).map(({ kind, size_bytes: size }) => {
        const { name, description } = TOOL_CACHES[kind];
        const isConfirming = confirming === kind;
        return (
          <div
            key={kind}
            className="space-y-2 rounded-md border border-surface-border/70 px-3 py-2"
            data-testid={`tool-cache-${kind}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-medium">
                  {name}{' '}
                  <span className="font-normal text-description tabular-nums">
                    {size > 0 ? formatBytes(size) : 'Empty'}
                  </span>
                </p>
                <p className="text-label-secondary text-description">{description}</p>
              </div>
              {!isConfirming ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={size === 0 || clear.isPending}
                  onClick={() => {
                    setConfirming(kind);
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            {isConfirming ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border/60 pt-2">
                <p className="text-label-secondary">
                  Clear {formatBytes(size)}? The next {name} run on the same text will be slower.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={clear.isPending}
                    onClick={() => {
                      setConfirming(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={clear.isPending}
                    onClick={() => {
                      clear.mutate({ path: { kind } });
                    }}
                  >
                    {clear.isPending ? 'Clearing…' : `Clear ${name} cache`}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
