import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { presentError } from '@/lib/errorPresentation';
import {
  EMBEDDING_MODEL_LABELS,
  ENGLISH_EMBEDDING_MODEL,
  MULTILINGUAL_EMBEDDING_MODEL,
} from '@/features/views/topic-modeling/topicEmbeddingModels';
import {
  useEmbeddingEndpointActions,
  type EmbeddingEndpoint,
  type EmbeddingEndpointModelList,
} from './embeddingEndpoints';

const MODELS: TopicEmbeddingModel[] = [ENGLISH_EMBEDDING_MODEL, MULTILINGUAL_EMBEDDING_MODEL];
const NOT_SERVED = '__not_served__';

type Chosen = Record<TopicEmbeddingModel, string>;

interface Listing {
  /** The address and key this listing was made with. */
  checkedFor: string;
  result: EmbeddingEndpointModelList;
}

interface Props {
  open: boolean;
  /** The endpoint to change; null adds a new one. */
  endpoint: EmbeddingEndpoint | null;
  onOpenChange: (open: boolean) => void;
}

const noneChosen = (): Chosen => Object.fromEntries(MODELS.map((model) => [model, ''])) as Chosen;

/**
 * The models to preselect: the endpoint's current choice when the server still
 * lists it, else the backend's suggestion, else none.
 */
const preselect = (
  result: EmbeddingEndpointModelList,
  current: Partial<Record<TopicEmbeddingModel, string>>,
): Chosen =>
  Object.fromEntries(
    MODELS.map((model) => {
      const saved = current[model];
      if (saved && result.models.includes(saved)) return [model, saved];
      return [model, result.suggested[model] ?? ''];
    }),
  ) as Chosen;

/**
 * Add or change one of the person's own Topic Modelling servers (a desktop).
 *
 * The server's models are listed first, with the typed key (or, when editing,
 * the saved one), which also checks the key; then each Topic Modelling model
 * is matched to one of them. Saving needs a current list and at least one
 * model. The key is write-only: leave it empty to keep the saved one.
 */
export function EmbeddingEndpointDialog({ open, endpoint, onOpenChange }: Props) {
  const actions = useEmbeddingEndpointActions();
  const [name, setName] = useState(endpoint?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(endpoint?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [chosen, setChosen] = useState<Chosen>(noneChosen);
  const [error, setError] = useState<string | null>(null);
  const saving = actions.add.isPending || actions.update.isPending;
  const checking = actions.listModels.isPending;
  const pending = saving || checking;

  const target = `${baseUrl.trim()}|${apiKey}|${String(removeKey)}`;
  const current = listing !== null && listing.checkedFor === target ? listing.result : null;
  const stale = listing !== null && listing.checkedFor !== target;
  const anyChosen = MODELS.some((model) => chosen[model]);

  const check = async () => {
    setError(null);
    const checkedFor = target;
    try {
      const result = await actions.listModels.mutateAsync({
        base_url: baseUrl.trim(),
        ...(apiKey ? { api_key: apiKey } : {}),
        // A saved key is used only for the address it was saved with.
        ...(endpoint && !apiKey && !removeKey ? { endpoint_id: endpoint.id } : {}),
      });
      setListing({ checkedFor, result });
      setChosen(preselect(result, endpoint?.models ?? {}));
    } catch (caught) {
      setListing(null);
      setError(presentError(caught, "Couldn't check the server").message);
    }
  };

  // Changing a saved server: list its models straight away with the saved key.
  const checkedOnOpen = useRef(false);
  useEffect(() => {
    if (!open || !endpoint || checkedOnOpen.current) return;
    checkedOnOpen.current = true;
    void check();
    // Runs once when the dialog opens for a saved server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, endpoint]);

  const save = async () => {
    const models = Object.fromEntries(
      MODELS.map((model) => [model, chosen[model]]).filter(([, value]) => value),
    ) as Partial<Record<TopicEmbeddingModel, string>>;
    if (!name.trim()) {
      setError('Enter a name');
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
      setError(presentError(caught, "Couldn't save the server").message);
    }
  };

  const canSave =
    !pending && Boolean(name.trim()) && current !== null && current.reachable && anyChosen;
  const listNote = checking
    ? null
    : stale
      ? 'The address or key changed: check again.'
      : current === null
        ? 'Check lists the server’s models, which also checks the key.'
        : current.reachable
          ? current.models.length
            ? `Found ${String(current.models.length)} ${current.models.length === 1 ? 'model' : 'models'}.`
            : (current.message ?? 'The server lists no models.')
          : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {endpoint ? 'Edit Topic Modelling server' : 'Add Topic Modelling server'}
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
              disabled={saving}
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

          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !baseUrl.trim()}
                onClick={() => {
                  void check();
                }}
              >
                {checking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {checking ? 'Checking…' : 'Check'}
              </Button>
              {listNote ? (
                <p role="status" className="text-label-secondary text-description">
                  {listNote}
                </p>
              ) : null}
            </div>
            {current && !current.reachable ? (
              <p role="alert" className="text-label-secondary text-error">
                {current.message ?? 'Couldn’t list the server’s models.'}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-2" disabled={!current?.reachable}>
            <legend className="text-body font-medium">Models</legend>
            <p className="text-label-secondary text-description">
              Choose the server’s name for each model. Wordflow picks English or Multilingual for
              each run.
            </p>
            {MODELS.map((model) => (
              <div key={model} className="flex items-center justify-between gap-3">
                <Label htmlFor={`embedding-endpoint-model-${model}`}>
                  {EMBEDDING_MODEL_LABELS[model]}
                </Label>
                <Select
                  value={chosen[model] || NOT_SERVED}
                  disabled={!current?.reachable || saving}
                  onValueChange={(value) => {
                    setChosen((previous) => ({
                      ...previous,
                      [model]: value === NOT_SERVED ? '' : value,
                    }));
                  }}
                >
                  <SelectTrigger id={`embedding-endpoint-model-${model}`} className="h-8 w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOT_SERVED}>Not served</SelectItem>
                    {(current?.models ?? []).map((served) => (
                      <SelectItem key={served} value={served}>
                        {served}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            disabled={saving}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              void save();
            }}
          >
            {saving ? 'Saving…' : endpoint ? 'Save' : 'Add server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
