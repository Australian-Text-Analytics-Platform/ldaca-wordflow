import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { useToolModeContext } from './ToolModeContext';

/**
 * A tool's advanced settings, shown together under one rule while the
 * Advanced switch is on, so it is plain which settings the switch added.
 */
export function AdvancedSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const mode = useToolModeContext();
  if (!mode?.advanced) return null;
  return (
    <div
      role="group"
      aria-label="Advanced settings"
      className={cn('space-y-3 border-t border-surface-border pt-3', className)}
    >
      <p className="text-label-secondary font-medium text-description">Advanced settings</p>
      {children}
    </div>
  );
}
