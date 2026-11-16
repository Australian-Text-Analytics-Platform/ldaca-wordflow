import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface HintTooltipProps {
  /** What the control does, in a sentence. */
  text: string;
  /**
   * One element that takes a ref and pointer and focus handlers: a button,
   * a menu trigger, or a span around a control that doesn't.
   */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * A short explanation of a toolbar control on hover or keyboard focus
 * (Chao, 17 Nov 2026: every button and dropdown in a results toolbar says
 * what it does). Disabled controls use DisabledReasonTooltip instead, since a
 * disabled button gets no pointer events.
 */
export function HintTooltip({ text, children, side = 'top' }: HintTooltipProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs whitespace-normal">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
