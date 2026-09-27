import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Keep unavailable actions explainable with pointer and keyboard activation. */
export function AnalysisAction({
  reason,
  onClick,
  className,
  ...props
}: ComponentProps<typeof Button> & { reason?: string | false }) {
  return (
    <Button
      {...props}
      className={cn('aria-disabled:opacity-40 aria-disabled:cursor-default', className)}
      aria-disabled={Boolean(reason)}
      onClick={(event) => {
        if (reason) {
          toast.info(reason);
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
