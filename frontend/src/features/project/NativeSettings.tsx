import { AppearancePreference } from '@/features/theme/AppearancePreference';
import { DesktopUpdateSettings } from '@/features/updater/DesktopUpdateSettings';
import { SettingsButton } from '@/components/layout/SettingsButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  applyColorTheme,
  DARK_THEME,
  LIGHT_THEME,
  useActiveTheme,
} from '@/features/theme/themeRuntime';
import { isTauri } from '@/lib/isTauri';
import { SessionErrors } from '@/features/diagnostics/SessionErrorHistory';

function NativeSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const theme = useActiveTheme();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences for this device.</DialogDescription>
        </DialogHeader>
        <section className="space-y-3">
          <h3 className="text-body font-semibold">Appearance</h3>
          <AppearancePreference
            isDark={theme === DARK_THEME}
            onChange={(dark) => {
              applyColorTheme(dark ? DARK_THEME : LIGHT_THEME);
            }}
          />
        </section>
        {isTauri() && <DesktopUpdateSettings />}
        <SessionErrors />
      </DialogContent>
    </Dialog>
  );
}
export default function NativeSettings() {
  return (
    <SettingsButton
      tooltipSide="bottom"
      className="h-8 w-8 text-[var(--vscode-icon-foreground)]"
      iconClassName="h-5 w-5"
      renderDialog={(props) => <NativeSettingsDialog {...props} />}
    />
  );
}
