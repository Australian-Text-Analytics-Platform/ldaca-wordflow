import React from 'react';
import { Cog } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';

const SettingsDialog = React.lazy(() =>
  import('@/components/dialogs/SettingsDialog').then(({ SettingsDialog }) => ({
    default: SettingsDialog,
  })),
);

interface SettingsButtonProps {
  className?: string;
  iconClassName?: string;
  tooltipSide?: React.ComponentProps<typeof TooltipContent>['side'];
}

/**
 * Opens the shared Settings dialog from application chrome, and renders it
 * whenever another part of the app opens it at a tab (issue 249).
 */
export function SettingsButton({
  className,
  iconClassName,
  tooltipSide = 'right',
}: SettingsButtonProps) {
  const open = useSettingsDialogStore((state) => state.open);
  const tab = useSettingsDialogStore((state) => state.tab);
  const openSettings = useSettingsDialogStore((state) => state.openSettings);
  const closeSettings = useSettingsDialogStore((state) => state.closeSettings);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-tauri-drag-region="false"
            className={cn('h-7 w-7 text-description', className)}
            aria-label="Open settings"
            data-guidance="settings-button"
            onClick={() => {
              openSettings();
            }}
          >
            <Cog data-testid="settings-button-icon" className={iconClassName ?? 'h-4 w-4'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>Settings</TooltipContent>
      </Tooltip>

      {open ? (
        <React.Suspense fallback={null}>
          <SettingsDialog
            open
            initialTab={tab}
            onOpenChange={(next) => {
              if (!next) closeSettings();
            }}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}
