import { browserCredentials } from '@/features/server/account';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as aiApi from '@/features/ai/api';
import { reportProjectError } from '@/features/project/projectErrors';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const providers: aiApi.AiProvider[] = ['openai', 'openrouter', 'anthropic', 'google', 'custom'];
export function ConnectionDialog({
  base,
  connection,
  onClose,
  onSaved,
}: {
  base: string;
  connection: aiApi.AiConnection | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState<aiApi.AiProvider>(connection?.provider ?? 'openai');
  const [endpoint, setEndpoint] = useState(connection?.endpoint ?? 'http://localhost:1234/v1');
  const [credential, setCredential] = useState<'keep' | 'session' | 'remember' | 'remove'>(
    connection ? 'keep' : browserCredentials() ? 'remember' : 'session',
  );
  const [key, setKey] = useState('');
  const [pending, setPending] = useState(false);
  const save = async () => {
    if (pending) return;
    setPending(true);
    try {
      const update: aiApi.CredentialUpdate =
        credential === 'session' || credential === 'remember'
          ? { action: credential, key }
          : { action: credential };
      const result = await aiApi.saveAiConnection(base, connection?.id ?? null, {
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
            {browserCredentials()
              ? 'API keys stay in this browser, separately for each signed-in account.'
              : 'API keys stay outside projects. Remembered keys use the operating system credential store; session-only keys disappear when the host stops.'}
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
              setProvider(v as aiApi.AiProvider);
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
              {browserCredentials() ? (
                <SelectItem value="remember">Remember in this browser for this account</SelectItem>
              ) : (
                <>
                  <SelectItem value="session">Session only</SelectItem>
                  <SelectItem value="remember">Remember in OS store</SelectItem>
                </>
              )}
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
