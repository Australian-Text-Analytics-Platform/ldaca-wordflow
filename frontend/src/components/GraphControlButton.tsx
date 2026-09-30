import type { ReactNode } from 'react';
import { ControlButton } from '@xyflow/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Fixed-width graph action; the wrapper also exposes disabled actions' names. */
export function GraphControlButton({
  accessibleLabel,
  label,
  children,
  disabled,
  active,
  pressed = active,
  destructive,
  onClick,
}: {
  accessibleLabel: string;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  pressed?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip delayDuration={0} disableHoverableContent>
      <TooltipTrigger asChild>
        <span
          className="block w-10"
          tabIndex={disabled ? 0 : undefined}
          aria-label={disabled ? accessibleLabel : undefined}
        >
          <ControlButton
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={accessibleLabel}
            aria-pressed={pressed}
            className={cn(
              '!h-10 !w-10 !min-w-10 !justify-center !px-3 transition-colors',
              'disabled:!bg-editor disabled:!text-[var(--vscode-icon-foreground)] disabled:!opacity-40',
              active && '!bg-list-active !text-[var(--vscode-list-activeSelectionForeground)]',
              destructive && !disabled && '!text-error hover:!bg-error/10',
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:!size-4 [&_svg]:!max-h-none [&_svg]:!max-w-none [&_svg]:!fill-none">
              {children}
            </span>
          </ControlButton>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
