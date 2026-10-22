import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { TopicEmbeddingModel } from '@/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toastError } from '@/lib/toastError';
import { EMBEDDING_MODEL_LABELS } from '@/features/views/topic-modeling/topicEmbeddingModels';
import { EmbeddingEndpointDialog } from './EmbeddingEndpointDialog';
import {
  useEmbeddingEndpointActions,
  useEmbeddingEndpoints,
  type EmbeddingEndpoint,
  type EmbeddingEndpointCheckResult,
} from './embeddingEndpoints';

/** "English (minilm-l6), Multilingual" for the models an endpoint serves. */
const servedModelsText = (endpoint: EmbeddingEndpoint): string =>
  (Object.entries(endpoint.models) as [TopicEmbeddingModel, string][])
    .map(([model, served]) =>
      served === model
        ? EMBEDDING_MODEL_LABELS[model]
        : `${EMBEDDING_MODEL_LABELS[model]} (${served})`,
    )
    .join(', ');

const checkText = (check: EmbeddingEndpointCheckResult): string => {
  if (!check.reachable) return check.message ?? "Couldn't reach it";
  const ready = (Object.entries(check.available) as [TopicEmbeddingModel, boolean][])
    .filter(([, available]) => available)
    .map(([model]) => EMBEDDING_MODEL_LABELS[model]);
  const summary = ready.length ? `Ready: ${ready.join(' and ')}.` : 'No model is ready.';
  return check.message ? `${summary} ${check.message}` : summary;
};

/**
 * Settings → Servers, Topic Modelling: the endpoints it can embed on with
 * Remote GPU. A server's own are read-only; on a desktop people add their own.
 */
export function EmbeddingEndpointsPanel() {
  const { endpoints, canAdd, isError, retry } = useEmbeddingEndpoints();
  const actions = useEmbeddingEndpointActions();
  const [dialog, setDialog] = useState<{ endpoint: EmbeddingEndpoint | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmbeddingEndpoint | null>(null);
  const [checks, setChecks] = useState<Record<string, EmbeddingEndpointCheckResult>>({});
  const [checking, setChecking] = useState<string | null>(null);

  const check = async (endpoint: EmbeddingEndpoint) => {
    setChecking(endpoint.id);
    try {
      const result = await actions.check.mutateAsync(endpoint.id);
      setChecks((current) => ({ ...current, [endpoint.id]: result }));
    } catch (error) {
      toastError(error, "Couldn't check the server");
    } finally {
      setChecking(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await actions.remove.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Topic Modelling server deleted');
    } catch (error) {
      toastError(error, "Couldn't delete the server");
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-semibold">Topic Modelling</h3>
          <p className="text-body text-description">
            Servers that read text for Topic Modelling on a remote GPU, which is much faster than
            this computer on large corpora. Tick Remote GPU beside Max tokens in Topic Modelling to
            use one. Wordflow picks the English or Multilingual model the run needs. Without a
            server, Topic Modelling reads text on this computer.
          </p>
          {canAdd ? null : (
            <p className="mt-1 text-label-secondary text-description">
              This Wordflow server provides these; they can't be changed here.
            </p>
          )}
        </div>

        {endpoints === undefined ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border px-3 py-4 text-body text-description"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading Topic Modelling servers…
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-error/40 px-3 py-4 text-body"
          >
            <p>Couldn't load Topic Modelling servers.</p>
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : endpoints.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-body text-description">
            {canAdd
              ? 'No Topic Modelling servers. Topic Modelling reads text on this computer.'
              : 'This Wordflow server offers none. Topic Modelling reads text on the Wordflow server.'}
          </p>
        ) : (
          <div className="space-y-2">
            {endpoints.map((endpoint) => {
              const result = checks[endpoint.id];
              return (
                <div
                  key={endpoint.id}
                  className="rounded-md border border-surface-border/70 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">{endpoint.name}</p>
                      <p className="truncate text-label-secondary text-description">
                        {endpoint.source === 'server'
                          ? `Provided by this Wordflow server · ${servedModelsText(endpoint)}`
                          : `${endpoint.base_url} · ${servedModelsText(endpoint)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <Badge variant="outline">
                        {endpoint.source === 'server'
                          ? 'Read-only'
                          : endpoint.has_api_key
                            ? 'Key saved'
                            : 'No key'}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={checking !== null}
                        onClick={() => {
                          void check(endpoint);
                        }}
                      >
                        {checking === endpoint.id ? 'Checking…' : 'Check'}
                      </Button>
                      {endpoint.source === 'user' ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDialog({ endpoint });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDeleteTarget(endpoint);
                            }}
                          >
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {result ? (
                    <p
                      role="status"
                      className={`mt-2 text-label-secondary ${result.reachable ? 'text-description' : 'text-error'}`}
                    >
                      {checkText(result)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {canAdd ? (
        <Button
          type="button"
          onClick={() => {
            setDialog({ endpoint: null });
          }}
        >
          Add server
        </Button>
      ) : null}

      {dialog ? (
        <EmbeddingEndpointDialog
          key={dialog.endpoint?.id ?? 'new'}
          open
          endpoint={dialog.endpoint}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actions.remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Topic Modelling server?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteTarget?.name ?? 'this server'}? Finished Topic Modelling results stay; a
              run that used it needs another endpoint, or Remote GPU unticked, to run again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actions.remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
