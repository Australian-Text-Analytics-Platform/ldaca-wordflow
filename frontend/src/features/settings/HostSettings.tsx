import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AppearancePreference } from '@/features/theme/AppearancePreference';
import { DesktopUpdateSettings } from '@/features/updater/DesktopUpdateSettings';
import { SessionErrors } from '@/features/diagnostics/SessionErrorHistory';
import {
  applyColorTheme,
  DARK_THEME,
  LIGHT_THEME,
  useActiveTheme,
} from '@/features/theme/themeRuntime';
import { browserCredentials } from '@/features/server/account';
import { isTauri } from '@/lib/isTauri';
import { ConnectionManager } from '@/features/ai/ConnectionManager';
import { PortalSettings } from './PortalSettings';
import { StorageSettings } from './StorageSettings';
import { GuidanceSettings } from './GuidanceSettings';
import { cn } from '@/lib/utils';
export type SettingsSection = 'general' | 'ai' | 'portal' | 'storage' | 'guidance';
const sections: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI' },
  { id: 'portal', label: 'Portal' },
  { id: 'storage', label: 'Storage' },
  { id: 'guidance', label: 'Guidance' },
];
interface HostServices {
  base: string;
  client: QueryClient;
  openSettings: (section: SettingsSection, opener: HTMLElement) => void;
}
const HostContext = createContext<HostServices | null>(null);
export function useHostServices() {
  return useContext(HostContext);
}
export function HostSettings({
  base,
  client,
  children,
}: {
  base: string;
  client: QueryClient;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>('general');
  const opener = useRef<HTMLElement | null>(null);
  return (
    <HostContext
      value={{
        base,
        client,
        openSettings: (section, target) => {
          opener.current = target;
          setSection(section);
          setOpen(true);
        },
      }}
    >
      {children}
      <QueryClientProvider client={client}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="flex h-[80dvh] w-[min(90vw,1040px)] max-w-none flex-col gap-0 overflow-hidden p-0"
            onInteractOutside={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
          >
            <header className="shrink-0 border-b border-surface-border px-5 py-4 pr-10">
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription className="mt-1">
                {isTauri()
                  ? 'Preferences for this desktop installation.'
                  : browserCredentials()
                    ? 'Preferences for your signed-in web account.'
                    : 'Preferences for this single-user web host.'}
              </DialogDescription>
            </header>
            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] min-[700px]:grid-cols-[180px_minmax(0,1fr)] min-[700px]:grid-rows-1">
              <nav
                aria-label="Settings sections"
                className="flex gap-1 overflow-x-auto border-b border-surface-border bg-sidebar p-3 min-[700px]:flex-col min-[700px]:border-r min-[700px]:border-b-0"
              >
                {sections.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={section === item.id ? 'page' : undefined}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      'shrink-0 rounded-md px-3 py-2 text-left text-body hover:bg-list-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus',
                      section === item.id && 'bg-list-active text-data-block-selection font-medium',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="min-h-0 min-w-0 overflow-y-auto p-5 min-[700px]:p-6">
                {section === 'general' && <GeneralSettings />}
                {section === 'ai' && <ConnectionManager base={base} />}
                {section === 'portal' && <PortalSettings base={base} />}
                {section === 'storage' && <StorageSettings base={base} />}
                {section === 'guidance' && <GuidanceSettings />}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </QueryClientProvider>
    </HostContext>
  );
}
function GeneralSettings() {
  const theme = useActiveTheme();
  return (
    <div className="max-w-prose space-y-6">
      <section className="space-y-3">
        <h2 className="text-heading-3 font-semibold">Appearance</h2>
        <AppearancePreference
          isDark={theme === DARK_THEME}
          onChange={(dark) => applyColorTheme(dark ? DARK_THEME : LIGHT_THEME)}
        />
      </section>
      {isTauri() && <DesktopUpdateSettings />}
      <SessionErrors />
    </div>
  );
}
