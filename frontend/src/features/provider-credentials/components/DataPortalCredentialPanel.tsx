import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProviderCredentials } from '../useProviderCredentials';
import { toastError } from '@/lib/toastError';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';

/** Standalone Data Portal credential surface, intentionally outside LLM provider settings. */
export function DataPortalCredentialPanel({
  onChanged,
}: {
  /** Called after the token is saved or cleared, e.g. to re-check access. */
  onChanged?: () => void;
} = {}) {
  const credentials = useProviderCredentials();
  // Lets an open LDaCA loader re-check access after a change here (issue 249).
  const notifyPortalTokenChanged = useSettingsDialogStore(
    (state) => state.notifyPortalTokenChanged,
  );
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const configured = credentials.dataPortal.userConfigured;
  const deploymentConfigured = credentials.dataPortal.deploymentConfigured;

  const save = async () => {
    if (!draft.trim()) return;
    setPending(true);
    try {
      await credentials.saveDataPortalCredential(draft);
      setDraft('');
      toast.success('LDaCA access token saved.');
      notifyPortalTokenChanged();
      onChanged?.();
    } catch (error) {
      toastError(error, "Couldn't save the LDaCA access token.");
    } finally {
      setPending(false);
    }
  };

  const clear = async () => {
    setPending(true);
    try {
      await credentials.clearDataPortalCredential();
      toast.success('LDaCA access token removed.');
      notifyPortalTokenChanged();
      onChanged?.();
    } catch (error) {
      toastError(error, "Couldn't remove the LDaCA access token.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-body font-semibold">LDaCA access token</h3>
        <Badge variant={configured || deploymentConfigured ? 'outline' : 'secondary'}>
          {configured
            ? credentials.storage === 'browser'
              ? 'Configured in this browser'
              : 'Configured for this user'
            : deploymentConfigured
              ? 'Set by the server'
              : 'Not configured'}
        </Badge>
      </div>
      <p className="text-body text-description">
        {credentials.storage === 'browser'
          ? 'Your token stays in this browser and is sent only when you browse or import LDaCA collections.'
          : 'Wordflow keeps your token on this computer and uses it only to browse and import LDaCA collections.'}{' '}
        You can get one by signing in to the{' '}
        <a href="https://data.ldaca.edu.au" target="_blank" rel="noreferrer" className="underline">
          LDaCA Data Portal
        </a>
        . Enter a new token to replace the saved one.
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          value={draft}
          placeholder={configured ? 'Enter a replacement token' : 'Enter token'}
          autoComplete="off"
          aria-label="LDaCA access token"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <Button
          type="button"
          disabled={!draft.trim() || pending}
          onClick={() => {
            void save();
          }}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!configured || pending}
          onClick={() => {
            void clear();
          }}
        >
          Clear
        </Button>
      </div>
    </section>
  );
}
