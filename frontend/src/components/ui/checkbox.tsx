import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { Check, Minus } from 'lucide-react';

/** Checkbox primitive used by forms and chart export options with shared checked styling. */
const Checkbox = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 rounded-sm border border-[var(--vscode-checkbox-border)] bg-[var(--vscode-checkbox-background)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-button data-[state=checked]:text-button-foreground data-[state=indeterminate]:bg-button data-[state=indeterminate]:text-button-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="group flex items-center justify-center text-current">
      <Check className="size-4 group-data-[state=indeterminate]:hidden" />
      <Minus className="hidden size-4 group-data-[state=indeterminate]:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);

export { Checkbox };
