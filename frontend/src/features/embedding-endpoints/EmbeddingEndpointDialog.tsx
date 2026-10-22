import { useState } from 'react';

import type { TopicEmbeddingModel } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { presentError } from '@/lib/errorPresentation';
import {
  EMBEDDING_MODEL_LABELS,
  ENGLISH_EMBEDDING_MODEL,
  MULTILINGUAL_EMBEDDING_MODEL,
} from '@/features/views/topic-modeling/topicEmbeddingModels';
import { useEmbeddingEndpointActions, type EmbeddingEndpoint } from './embeddingEndpoints';

const MODELS: TopicEmbeddingModel[] = [ENGLISH_EMBEDDING_MODEL, MULTILINGUAL_EMBEDDING_MODEL];

interface Props {
  open: boolean;
  /** The endpoint to change; null adds a new one. */
  endpoint: EmbeddingEndpoint | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Add or change one of the person's own embedding endpoints (a desktop).
 * The key is write-only: leave it empty to keep the saved one.
 */
export function EmbeddingEndpointDialog({ open, endpoint, onOpenChange }: Props) {
  const actions = useEmbeddingEndpointActions();
  const [name, setName] = useState(endpoint?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(endpoint?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  // New endpoints start with each model served under its own id (vLLM's default).
  const [served, setServed] = useState<Record<TopicEmbeddingModel, string>>(
    () =>
      Object.fromEntries(
        MODELS.map((model) => [model, endpoint ? (endpoint.models[model] ?? '') : model]),
      ) as Record<TopicEmbeddingModel, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const pending = actions.add.isPending || actions.update.isPending;

  const save = async () => {
    const models = Object.fromEntries(
      MODELS.map((model) => [model, served[model].trim()]).filter(([, value]) => value),
    ) as Partial<Record<TopicEmbeddingModel, string>>;
    const problem = !name.trim()
      ? 'Enter a name'
      : !baseUrl.trim()
        ? 'Enter the endpoint address'
        : Object.keys(models).length === 0
          ? 'Name at least one model it serves'
          : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      if (endpoint) {
        await actions.update.mutateAsync({
          id: endpoint.id,
          body: {
            name: name.trim(),
            base_url: baseUrl.trim(),
            models,
            ...(removeKey ? { api_key: null } : apiKey ? { api_key: apiKey } : {}),
          },
        });
      } else {
        await actions.add.mutateAsync({
          name: name.trim(),
          base_url: baseUrl.trim(),
          models,
          ...(apiKey ? { api_key: apiKey } : {}),
        });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(presentError(caught, "Couldn't save the endpoint").message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {endpoint ? 'Edit embedding endpoint' : 'Add embedding endpoint'}
          </DialogTitle>
          <DialogDescription>
            A server that embeds text for Topic Modelling, such as vLLM or a LiteLLM gateway. The
            key is kept on this computer and never shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="embedding-endpoint-name">Name</Label>
            <Input
              id="embedding-endpoint-name"
              value={name}
              disabled={pending}
              placeholder="Lab GPU"
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="embedding-endpoint-url">Address</Label>
            <Input
              id="embedding-endpoint-url"
              value={baseUrl}
              disabled={pending}
              placeholder="https://gateway.example/v1"
              autoComplete="url"
              onChange={(event) => {
                setBaseUrl(event.target.value);
              }}
            />
            <p className="text-label-secondary text-description">
              The API root, ending in /v1. It must answer OpenAI-style embeddings requests.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="embedding-endpoint-key">
              API key
              <span className="ml-1 font-normal text-description">(optional)</span>
            </Label>
            <Input
              id="embedding-endpoint-key"
              type="password"
              value={apiKey}
              disabled={pending || removeKey}
              placeholder={endpoint?.has_api_key ? 'Saved: leave empty to keep it' : ''}
              autoComplete="off"
              onChange={(event) => {
                setApiKey(event.target.value);
              }}
            />
            {endpoint?.has_api_key ? (
              <label className="flex items-center gap-2 text-label-secondary text-description">
                <input
                  type="checkbox"
                  checked={removeKey}
                  disabled={pending}
                  onChange={(event) => {
                    setRemoveKey(event.target.checked);
                  }}
                />
                Remove the saved key
              </label>
            ) : null}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-body font-medium">Model names on this endpoint</legend>
            <p className="text-label-secondary text-description">
              Leave a model empty if the endpoint doesn't serve it.
            </p>
            {MODELS.map((model) => (
              <div key={model} className="space-y-1">
                <Label htmlFor={`embedding-endpoint-model-${model}`}>
                  {EMBEDDING_MODEL_LABELS[model]}
                </Label>
                <Input
                  id={`embedding-endpoint-model-${model}`}
                  value={served[model]}
                  disabled={pending}
                  autoComplete="off"
                  onChange={(event) => {
                    setServed((current) => ({ ...current, [model]: event.target.value }));
                  }}
                />
              </div>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="text-body text-error">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              void save();
            }}
          >
            {pending ? 'Saving…' : endpoint ? 'Save' : 'Add endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
