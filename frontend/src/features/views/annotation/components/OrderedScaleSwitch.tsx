import HelpIcon from '@/components/help/HelpIcon';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface OrderedScaleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * The codebook's Ordered scale setting (Chao, 16 Nov 2026), on the Edit
 * codebook title line, with its explanation in a help icon. It belongs to the
 * whole codebook: Save writes or removes the __scale__ row, which AI
 * annotation, the AI Code Designer and Compare to all follow.
 */
export function OrderedScaleSwitch({
  checked,
  onCheckedChange,
  disabled = false,
}: OrderedScaleSwitchProps) {
  return (
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
      <HelpIcon
        targetKey="analysis.annotation.scale"
        label="About ordered scales"
        tooltip="Turn on when the codes are levels from low to high, such as a rating, rather than separate categories. Levels run from the lowest (top) to the highest (bottom); a code such as Not applicable goes outside the scale. Compare to then uses weighted Kappa and ordinal Alpha."
      />
    </span>
  );
}
