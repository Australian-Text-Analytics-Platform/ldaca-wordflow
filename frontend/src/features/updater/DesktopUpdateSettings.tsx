import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getUpdatePreferences, setAutomaticUpdateChecks } from './desktopUpdater';

export function DesktopUpdateSettings() {
  const cache = useQueryClient();
  const preferences = useQuery({
    queryKey: ['desktop', 'update-preferences'],
    queryFn: getUpdatePreferences,
  });
  const update = useMutation({
    mutationFn: setAutomaticUpdateChecks,
    onSuccess: (value) => {
      cache.setQueryData(['desktop', 'update-preferences'], value);
    },
  });
  if (preferences.data === null) {
    return (
      <section className="space-y-3 border-t border-surface-border/60 pt-4">
        <h3 className="text-body font-semibold">Desktop Updates</h3>
        <p className="text-body text-description">Updates are disabled for this build.</p>
      </section>
    );
  }
  return (
    <section className="space-y-3 border-t border-surface-border/60 pt-4">
      <div>
        <h3 className="text-body font-semibold">Desktop Updates</h3>
        <p className="text-body text-description">
          Check for a signed Wordflow update at most once per day.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
        <Label htmlFor="settings-automatic-update-checks" className="text-body font-medium">
          Automatically check for updates
        </Label>
        <Switch
          id="settings-automatic-update-checks"
          aria-label="Automatically check for updates"
          checked={preferences.data?.automaticChecks ?? false}
          disabled={!preferences.data || update.isPending}
          onCheckedChange={(checked) => {
            update.mutate(checked);
          }}
        />
      </div>
    </section>
  );
}
