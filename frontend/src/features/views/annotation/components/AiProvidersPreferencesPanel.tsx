import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
import { Label } from '@/components/ui/label';
import {
  useAiDefaultModels,
  useSetAiDefaultModel,
} from '@/features/preferences/useAiDefaultModels';
import type { AnnotationProviderConfigurationView } from '@/features/provider-credentials/providerCredentialsStore';
import { useProviderCredentials } from '@/features/provider-credentials/useProviderCredentials';
import { providerConfigurationSecondaryText } from '../aiProviders';
import {
  isServerAiConfiguration,
  serverAiDefaultModels,
  useServerAiProviders,
} from '@/features/server-ai-providers/serverAiProviders';
import { AddAnnotationProviderDialog } from './AddAnnotationProviderDialog';
import { EditAnnotationProviderDialog } from './EditAnnotationProviderDialog';
import { ModelNameCombobox } from './ModelNameCombobox';
import { toastError } from '@/lib/toastError';

interface DefaultModelFieldProps {
  configuration: AnnotationProviderConfigurationView;
  /** The person's saved default, '' when none. */
  saved: string;
  /** The server's default for its own provider, if it sets one. */
  serverDefault: string | undefined;
  disabled: boolean;
}

/**
 * A provider's default model. It may stay empty: the first model used with
 * the provider in a Project then becomes that Project's. A model chosen in a
 * Project never changes this default.
 */
function DefaultModelField({
  configuration,
  saved,
  serverDefault,
  disabled,
}: DefaultModelFieldProps) {
  const setDefault = useSetAiDefaultModel();
  const [draft, setDraft] = useState(saved);
  const fieldId = `ai-default-model-${configuration.id}`;

  const commit = (value: string) => {
    const model = value.trim();
    if (model === saved) return;
    setDefault.mutate(
      { configurationId: configuration.id, model },
      {
        onSuccess: () => {
          toast.success(model ? 'Default model saved' : 'Default model removed');
        },
        onError: (error) => {
          setDraft(saved);
          toastError(error, "Couldn't save the default model");
        },
      },
    );
  };

  const hint = saved
    ? 'New Annotation tabs start with this model, unless the Project has used another one.'
    : serverDefault
      ? `Empty: Annotation starts with this server's default, ${serverDefault}, until a Project uses another model.`
      : 'Empty: the first model used in a Project becomes that Project’s model.';

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-label-secondary font-medium">
        Default model
      </Label>
      <ModelNameCombobox
        id={fieldId}
        configuration={configuration}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        disabled={disabled || setDefault.isPending}
      />
      <p className="text-label-secondary text-description">{hint}</p>
    </div>
  );
}

/** Generative AI servers for Annotation, each with an optional default model. */
export function AiProvidersPreferencesPanel() {
  const credentials = useProviderCredentials();
  const defaultModels = useAiDefaultModels() ?? {};
  const serverDefaults = serverAiDefaultModels(useServerAiProviders());
  const setDefault = useSetAiDefaultModel();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnnotationProviderConfigurationView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnotationProviderConfigurationView | null>(
    null,
  );
  const [clearOpen, setClearOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const remove = async () => {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await credentials.deleteAnnotationProvider(deleteTarget.id);
      if (defaultModels[deleteTarget.id]) {
        setDefault.mutate({ configurationId: deleteTarget.id, model: '' });
      }
      setDeleteTarget(null);
      toast.success('Provider deleted');
    } catch (error) {
      toastError(error, "Couldn't delete provider");
    } finally {
      setPending(false);
    }
  };

  const clearAll = async () => {
    setPending(true);
    try {
      await credentials.clearAnnotationProviders();
      setClearOpen(false);
      toast.success('Annotation providers cleared');
    } catch (error) {
      toastError(error, "Couldn't clear providers");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-semibold">Generative AI</h3>
          <p className="text-body text-description">
            Used by Annotation. Without one, Annotation can only be done by hand.
          </p>
          <p className="mt-1 text-body text-description">
            {credentials.storage === 'browser'
              ? 'Configurations stay in this browser for the current account. Secrets are sent only with provider requests.'
              : 'Configurations are stored by the local backend. Saved secrets are never returned to the browser.'}
          </p>
          <p className="mt-1 text-label-secondary text-description">
            Names, saved keys and default models can be edited. Provider type and Custom Base URL
            stay fixed.
          </p>
        </div>

        {credentials.isLoading ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border px-3 py-4 text-body text-description"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading Annotation providers…
          </div>
        ) : credentials.error ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-error/40 px-3 py-4 text-body"
          >
            <p>Couldn't load Annotation providers.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void credentials.retry()}
            >
              Retry
            </Button>
          </div>
        ) : credentials.annotationProviders.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-body text-description">
            No Annotation providers configured.
          </p>
        ) : (
          <div className="space-y-2">
            {credentials.annotationProviders.map((configuration) => (
              <div
                key={configuration.id}
                className="rounded-md border border-surface-border/70 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium">{configuration.name}</p>
                    <p className="truncate text-label-secondary text-description">
                      {providerConfigurationSecondaryText(configuration)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">
                      {isServerAiConfiguration(configuration)
                        ? 'Read-only'
                        : configuration.has_api_key
                          ? 'Key saved'
                          : 'No key'}
                    </Badge>
                    {/* The server's own providers can't be edited or deleted here. */}
                    {isServerAiConfiguration(configuration) ? null : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setEditTarget(configuration);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setDeleteTarget(configuration);
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <DefaultModelField
                  key={defaultModels[configuration.id] ?? ''}
                  configuration={configuration}
                  saved={defaultModels[configuration.id] ?? ''}
                  serverDefault={serverDefaults[configuration.id]}
                  disabled={pending}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            setAddOpen(true);
          }}
          disabled={pending}
        >
          Add provider
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setClearOpen(true);
          }}
          disabled={
            pending ||
            credentials.annotationProviders.every((configuration) =>
              isServerAiConfiguration(configuration),
            )
          }
        >
          Clear all providers
        </Button>
      </div>

      <AddAnnotationProviderDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditAnnotationProviderDialog
        configuration={editTarget}
        pending={pending}
        onOpenChange={() => {
          setEditTarget(null);
        }}
        onSave={async (configurationId, input) => {
          setPending(true);
          try {
            await credentials.updateAnnotationProvider(configurationId, input);
            setEditTarget(null);
            toast.success('Provider updated');
          } finally {
            setPending(false);
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteTarget?.name ?? 'this provider configuration'}? Completed Run output
              remains readable. Preview pages and future requests that use this provider will no
              longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
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

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all providers?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete every configured Annotation provider. Completed Run output remains readable,
              but Preview pages and future provider requests will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void clearAll();
              }}
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
