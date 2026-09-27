import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as api from '@/features/project/api';
import { reportProjectError } from '@/features/project/projectErrors';

const providers: api.AiProvider[] = ['openai', 'openrouter', 'anthropic', 'google', 'custom'];
export function ProviderSelector({
  base,
  provider,
  model,
  onChange,
  disabled = false,
}: {
  base: string;
  provider: string;
  model: string;
  onChange: (provider: string, model: string) => void;
  disabled?: boolean;
}) {
  const connections = useQuery({
    queryKey: ['host', base, 'ai-providers'],
    queryFn: ({ signal }) => api.aiConnections(base, signal),
  });
  const chosen = connections.data?.find((c) => c.id === provider);
  const [dialog, setDialog] = useState<api.AiConnection | 'new' | null>(null);
  const models = useQuery({
    queryKey: ['host', base, 'ai-models', provider, chosen?.revision],
    queryFn: ({ signal }) => api.aiModels(base, provider, signal),
    enabled: Boolean(
      chosen &&
        (chosen.has_credential || chosen.provider === 'custom' || chosen.provider === 'apple'),
    ),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 space-y-1">
          Connection
          <SearchableSelect
            ariaLabel="AI connection"
            disabled={disabled}
            value={provider}
            options={(connections.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            onChange={(id) => {
              onChange(
                id,
                connections.data?.find((c) => c.id === id)?.provider === 'apple' ? 'system' : model,
              );
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setDialog('new');
          }}
        >
          New connection
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || !chosen || chosen.built_in}
          onClick={() => {
            if (chosen) setDialog(chosen);
          }}
        >
          Edit connection
        </Button>
      </div>
      {chosen?.credential_error && (
        <p className="text-description text-label-secondary">{chosen.credential_error.message}</p>
      )}
      {provider && !chosen && connections.isSuccess && (
        <p role="status">This saved connection is unavailable. Choose a replacement.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 space-y-1">
          Model
          <SearchableSelect
            ariaLabel="Discovered AI model"
            disabled={disabled || models.isFetching}
            value={model}
            options={(models.data ?? []).map((value) => ({ value }))}
            onChange={(value) => {
              onChange(provider, value);
            }}
            placeholder={models.isFetching ? 'Discovering models…' : 'Search models'}
          />
        </label>
        <label className="min-w-48 flex-1 space-y-1">
          Model name
          <Input
            aria-label="AI model name"
            disabled={disabled || chosen?.built_in}
            value={model}
            onChange={(e) => {
              onChange(provider, e.target.value);
            }}
            placeholder="Or enter a model identifier"
          />
        </label>
        <Button
          variant="ghost"
          disabled={disabled || !chosen || models.isFetching}
          onClick={() => {
            void models.refetch();
          }}
        >
          Refresh models
        </Button>
      </div>
      {models.isError && (
        <p className="text-description text-label-secondary">
          Model discovery failed. Enter a model name or retry.
        </p>
      )}
      {dialog && (
        <ConnectionDialog
          key={dialog === 'new' ? 'new' : dialog.id}
          base={base}
          connection={dialog === 'new' ? null : dialog}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={(id) => {
            onChange(id, model);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
function ConnectionDialog({
  base,
  connection,
  onClose,
  onSaved,
}: {
  base: string;
  connection: api.AiConnection | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState<api.AiProvider>(connection?.provider ?? 'openai');
  const [endpoint, setEndpoint] = useState(connection?.endpoint ?? 'http://localhost:1234/v1');
  const [credential, setCredential] = useState<'keep' | 'session' | 'remember' | 'remove'>(
    connection ? 'keep' : 'session',
  );
  const [key, setKey] = useState('');
  const [pending, setPending] = useState(false);
  const save = async () => {
    if (pending) return;
    setPending(true);
    try {
      const update: api.CredentialUpdate =
        credential === 'session' || credential === 'remember'
          ? { action: credential, key }
          : { action: credential };
      const result = await api.saveAiConnection(base, connection?.id ?? null, {
        name,
        ...(connection ? {} : { provider, endpoint: provider === 'custom' ? endpoint : null }),
        credential: update,
      });
      setKey('');
      await cache.invalidateQueries({ queryKey: ['host', base, 'ai-providers'] });
      onSaved(result.id);
    } catch (error) {
      reportProjectError(error);
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    if (!connection || pending) return;
    setPending(true);
    try {
      await api.deleteAiConnection(base, connection.id);
      await cache.invalidateQueries({ queryKey: ['host', base, 'ai-providers'] });
      onSaved('');
    } catch (error) {
      reportProjectError(error);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{connection ? 'Edit connection' : 'New AI connection'}</DialogTitle>
          <DialogDescription>
            API keys stay outside projects. Remembered keys use the operating system credential
            store; session-only keys disappear when the app closes.
          </DialogDescription>
        </DialogHeader>
        <label>
          Name
          <Input
            aria-label="Connection name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            disabled={pending}
          />
        </label>
        <label>
          Provider
          <Select
            value={provider}
            disabled={Boolean(connection) || pending}
            onValueChange={(v) => {
              setProvider(v as api.AiProvider);
            }}
          >
            <SelectTrigger aria-label="Provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((v) => (
                <SelectItem value={v} key={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {provider === 'custom' && (
          <label>
            API endpoint
            <Input
              aria-label="API endpoint"
              value={endpoint}
              onChange={(e) => {
                setEndpoint(e.target.value);
              }}
              disabled={Boolean(connection) || pending}
            />
          </label>
        )}
        <label>
          Credential
          <Select
            value={credential}
            disabled={pending}
            onValueChange={(v) => {
              setCredential(v as typeof credential);
            }}
          >
            <SelectTrigger aria-label="Credential">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {connection && <SelectItem value="keep">Keep current credential</SelectItem>}
              <SelectItem value="session">Session only</SelectItem>
              <SelectItem value="remember">Remember in OS store</SelectItem>
              <SelectItem value="remove">No key / remove key</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {(credential === 'session' || credential === 'remember') && (
          <label>
            API key
            <Input
              type="password"
              autoComplete="off"
              value={key}
              disabled={pending}
              onChange={(e) => {
                setKey(e.target.value);
              }}
            />
          </label>
        )}
        <DialogFooter>
          {connection && (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                void remove();
              }}
            >
              Delete connection
            </Button>
          )}
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              pending ||
              !name.trim() ||
              ((credential === 'session' || credential === 'remember') && !key.trim())
            }
            onClick={() => {
              void save();
            }}
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
