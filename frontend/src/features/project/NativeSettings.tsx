import { SettingsButton } from '@/components/layout/SettingsButton';
import { useHostServices } from '@/features/settings/HostSettings';
export default function NativeSettings() {
  const host = useHostServices();
  if (!host) return null;
  return (
    <SettingsButton
      tooltipSide="bottom"
      className="h-8 w-8 text-[var(--vscode-icon-foreground)] [&_svg]:size-6"
      onOpen={(opener) => host.openSettings('general', opener)}
    />
  );
}
