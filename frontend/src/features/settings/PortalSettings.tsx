import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { browserCredentials } from '@/features/server/account';
import { portalInfo, updatePortal } from './portalApi';
import { ConfirmAction } from './ConfirmAction';
export function PortalSettings({ base }: { base: string }) {
  const client = useQueryClient();
  const info = useQuery({
    queryKey: ['host', base, 'portal'],
    queryFn: ({ signal }) => portalInfo(base, signal),
  });
  const [token, setToken] = useState('');
  const [storage, setStorage] = useState<'session' | 'remember'>(
    browserCredentials() ? 'remember' : 'session',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [clear, setClear] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ['host', base, 'portal'] });
  const save = async () => {
    setPending(true);
    setError('');
    try {
      await updatePortal(base, { action: storage, key: token });
      setToken('');
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'The Portal credential could not be saved. Retry.',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="max-w-prose space-y-5" aria-label="Portal access">
      <div>
        <h2 className="text-heading-3 font-semibold">Portal access</h2>
        <p className="mt-2 text-description text-body-secondary">
          A token gives access to restricted LDaCA collections. Public collections work without one.
          Data Loader uses the configured token automatically.
        </p>
      </div>
      {info.isPending && <p role="status">Checking Portal access…</p>}
      {info.isError && (
        <div role="alert">
          Portal access could not be loaded.{' '}
          <Button variant="outline" onClick={() => void info.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {info.data && (
        <p role="status" className="font-medium">
          {info.data.has_credential ? 'Token configured' : 'No token configured'}
          {info.data.has_credential &&
            ` · ${browserCredentials() ? 'This browser and account' : info.data.credential_mode === 'session' ? 'This host session' : 'OS credential store'}`}
        </p>
      )}
      {info.data?.credential_error && <p role="alert">{info.data.credential_error}</p>}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim() && !pending) void save();
        }}
      >
        <label className="flex flex-col gap-2">
          {info.data?.has_credential ? 'Replacement token' : 'Portal token'}
          <Input
            type="password"
            autoComplete="off"
            value={token}
            disabled={pending}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          Credential storage
          <Select
            value={storage}
            disabled={pending}
            onValueChange={(value) => setStorage(value as typeof storage)}
          >
            <SelectTrigger aria-label="Portal credential storage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!browserCredentials() && <SelectItem value="session">Session only</SelectItem>}
              <SelectItem value="remember">
                {browserCredentials()
                  ? 'Remember in this browser for this account'
                  : 'Remember in OS credential store'}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
        <p className="text-description text-body-secondary">
          {browserCredentials()
            ? 'Stored only in this browser for the signed-in account. Sent to the worker only for a Portal operation.'
            : 'Session tokens disappear when the host closes. Remembered tokens use the operating system credential store.'}{' '}
          Tokens are kept outside projects and preferences.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !token.trim() || !info.data}>
            {pending ? 'Saving…' : info.data?.has_credential ? 'Replace token' : 'Save token'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              pending || !info.data || (!info.data.has_credential && !info.data.credential_error)
            }
            onClick={() => setClear(true)}
          >
            Clear token
          </Button>
        </div>
      </form>
      {clear && (
        <ConfirmAction
          title="Clear Portal token?"
          description="Restricted collections will require a new token. Public collections remain available."
          action="Clear token"
          onClose={() => setClear(false)}
          onConfirm={async () => {
            await updatePortal(base, { action: 'remove' });
            await refresh();
          }}
        />
      )}
    </section>
  );
}
