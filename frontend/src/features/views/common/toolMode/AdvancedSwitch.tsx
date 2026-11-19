import { useState } from 'react';
import { Info } from 'lucide-react';

import HelpIcon from '@/components/help/HelpIcon';
import { Switch } from '@/components/ui/switch';
import { useNudgeStore } from '@/features/nudges/nudgeStore';

import { useToolModeContext } from './ToolModeContext';
import { dismissAdvancedHint, readAdvancedHintDismissed } from './toolMode';

/** The hint's words, kept to one short line. */
export const ADVANCED_HINT_TEXT =
  'Turn on Advanced to see and change more settings and their defaults.';

/**
 * A one-line light blue hint beside the switch while Advanced is off (Chao,
 * 19 Nov 2026): Basic hides settings and runs with their defaults, which is
 * easy to forget. Got it hides it for this tool on this device until the next update.
 */
function AdvancedHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <p
      role="note"
      data-testid="advanced-hint"
      className="flex min-w-0 items-center gap-1.5 rounded-md border border-info/40 bg-info-background py-0.5 pl-2 pr-0.5 text-label-secondary text-foreground"
    >
      <Info aria-hidden="true" className="size-3.5 shrink-0 text-info" />
      <span className="min-w-0 truncate" title={ADVANCED_HINT_TEXT}>
        {ADVANCED_HINT_TEXT}
      </span>
      <button
        type="button"
        className="shrink-0 rounded-sm px-1.5 py-0.5 font-medium text-link hover:bg-list-hover focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus"
        title="Don't show this hint again for this tool until the next update"
        onClick={onDismiss}
      >
        Got it
      </button>
    </p>
  );
}

/**
 * The Advanced switch in a tool's parameters card header, with the Advanced
 * hint to its left while Advanced is off.
 * Rendered by: analysis features with advanced settings, in the card's
 * `headerAction`. It stays usable while the parameters are locked: the mode
 * changes what is shown and what the next run sends, never a run in progress.
 */
export function AdvancedSwitch({ guidanceTarget }: { guidanceTarget?: string } = {}) {
  const mode = useToolModeContext();
  const suggestionsOn = useNudgeStore((state) => state.enabled);
  const viewId = mode?.viewId;
  const [hintDismissed, setHintDismissed] = useState(() =>
    viewId ? readAdvancedHintDismissed(viewId) : true,
  );
  if (!mode) return null;
  // Suggestions off hides the hint as well; a tool without an id can't remember a dismissal.
  const showHint = !mode.advanced && !hintDismissed && suggestionsOn && viewId !== undefined;
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
      {showHint ? (
        <AdvancedHint
          onDismiss={() => {
            dismissAdvancedHint(viewId);
            setHintDismissed(true);
          }}
        />
      ) : null}
      <div data-guidance={guidanceTarget} className="flex shrink-0 items-center gap-1.5">
        <label className="flex items-center gap-2 text-label-secondary text-description">
          Advanced
          <Switch
            size="sm"
            checked={mode.advanced}
            onCheckedChange={mode.setAdvanced}
            aria-label="Advanced settings"
          />
        </label>
        <HelpIcon
          targetKey="ui.tool-mode"
          label="About Basic and Advanced"
          tooltip="Show this tool's advanced settings. When off, they are hidden and the tool uses their defaults."
          className="h-5 w-5 shrink-0 text-description"
        />
      </div>
    </div>
  );
}
