import type { ReactNode } from 'react';
import { CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PreprocessingApplyMode } from '../preprocessingApplyMode';

interface PreprocessingApplyBarProps {
  /** The tool's fixed destination; tools no longer ask users to choose. */
  mode: PreprocessingApplyMode;
  children: ReactNode;
}

/** Keeps the tool's fixed result destination, its inputs, and the apply action together. */
export function PreprocessingApplyBar({ mode, children }: PreprocessingApplyBarProps) {
  return (
    <CardFooter
      role="group"
      aria-label="Apply result"
      className="gap-x-3 gap-y-2 border-t border-surface-border bg-panel/20 py-4"
    >
      <p className="shrink-0 text-body font-medium text-description">
        {mode === 'create' ? 'Result: New Data Block' : 'Result: Updates the selected Data Block'}
      </p>
      <div
        className={cn(
          'flex min-w-0 items-center gap-3',
          mode === 'create' ? 'flex-[1_1_28rem] flex-wrap' : 'flex-[1_1_10rem]',
        )}
      >
        {children}
      </div>
    </CardFooter>
  );
}
