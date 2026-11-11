import HelpIcon from '@/components/help/HelpIcon';
import { Switch } from '@/components/ui/switch';

import { useToolModeContext } from './ToolModeContext';

/**
 * The Advanced switch in a tool's parameters card header.
 * Rendered by: analysis features with advanced settings, in the card's
 * `headerAction`. It stays usable while the parameters are locked: the mode
 * changes what is shown and what the next run sends, never a run in progress.
 */
export function AdvancedSwitch() {
  const mode = useToolModeContext();
  if (!mode) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
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
  );
}
