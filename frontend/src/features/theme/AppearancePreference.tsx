import { Moon, Sun } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
export function AppearancePreference({
  isDark,
  disabled,
  onChange,
}: {
  isDark: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
      <Label
        htmlFor="settings-color-theme"
        className="flex min-w-0 items-center gap-2 text-body font-medium"
      >
        {isDark ? (
          <Moon className="size-4 shrink-0" aria-hidden />
        ) : (
          <Sun className="size-4 shrink-0" aria-hidden />
        )}
        <span>{isDark ? 'Dark 2026' : 'Light 2026'}</span>
      </Label>
      <Switch
        id="settings-color-theme"
        checked={isDark}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label="Use Dark 2026 theme"
      />
    </div>
  );
}
