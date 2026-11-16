import HelpIcon from '@/components/help/HelpIcon';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface OrderedScaleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Why the switch is disabled, shown on hover. */
  disabledReason?: string;
}

/**
 * The codebook's Ordered scale setting (Chao, 16 Nov 2026), with its
 * explanation in a help icon. In the Edit codebook window it sits on the
 * Brief's line and follows the AI Code Designer button: when the designer
 * can't run, the switch is disabled with the same reason.
 */
export function OrderedScaleSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  disabledReason,
}: OrderedScaleSwitchProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <DisabledReasonTooltip reason={disabled ? disabledReason : undefined}>
        <span className="inline-flex items-center gap-1.5">
          <Switch
            id="codebook-scale"
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
          />
          <Label htmlFor="codebook-scale" className="font-normal">
            Ordered scale
          </Label>
        </span>
      </DisabledReasonTooltip>
      <HelpIcon
        targetKey="analysis.annotation.scale"
        label="About ordered scales"
        tooltip="Turn on when the codes are levels from low to high, such as a rating, rather than separate categories. Levels run from the lowest (top) to the highest (bottom); a code such as Not applicable goes outside the scale. Compare to then uses weighted Kappa and ordinal Alpha."
      />
    </span>
  );
}
