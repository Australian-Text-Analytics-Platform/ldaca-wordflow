import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { patchPreferences, usePreferences } from '@/features/preferences/preferences';
import { ConfirmAction } from './ConfirmAction';
export function GuidanceSettings() {
  const { guidance } = usePreferences();
  const [reset, setReset] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <section className="max-w-prose space-y-5" aria-label="Contextual guidance">
      <div>
        <h2 className="text-heading-3 font-semibold">Contextual guidance</h2>
        <p className="mt-2 text-description text-body-secondary">
          Short hints explain setup, actions, results and next steps in each tool. They stay out of
          the way while you edit or run work.
        </p>
      </div>
      <label className="flex items-center justify-between gap-4 font-medium">
        Show contextual hints
        <Switch
          checked={guidance.enabled}
          disabled={pending}
          onCheckedChange={(enabled) => {
            setPending(true);
            void patchPreferences({ guidance: { enabled } })
              .catch(() => {})
              .finally(() => setPending(false));
          }}
        />
      </label>
      <p className="text-description text-body-secondary">
        Got it remembers a hint. Not now pauses hints until you revisit the tool. Reset history lets
        acknowledged hints appear again and keeps your enable choice.
      </p>
      <Button
        variant="outline"
        onClick={() => setReset(true)}
        disabled={Object.keys(guidance.acknowledgments).length === 0}
      >
        Reset hint history
      </Button>
      {reset && (
        <ConfirmAction
          title="Reset hint history?"
          description="Acknowledged hints can appear again when you visit a tool. Your Show contextual hints choice stays unchanged."
          action="Reset history"
          onClose={() => setReset(false)}
          onConfirm={() => patchPreferences({ guidance: { resetAcknowledgments: true } })}
        />
      )}
    </section>
  );
}
