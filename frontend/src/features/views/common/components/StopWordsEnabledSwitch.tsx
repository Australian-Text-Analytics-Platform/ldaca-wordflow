interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  /** Show only the switch; the label names it for screen readers (issue 353). */
  hideLabel?: boolean;
}

/** Shared enablement primitive; each analysis owns its feature-specific editor. */
export function StopWordsEnabledSwitch({
  checked,
  onCheckedChange,
  label = 'Enable stop words',
  hideLabel = false,
}: Props) {
  return (
    <label className="flex items-center gap-2 text-label-secondary text-description">
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      {hideLabel ? null : label}
    </label>
  );
}
import { Switch } from '@/components/ui/switch';
