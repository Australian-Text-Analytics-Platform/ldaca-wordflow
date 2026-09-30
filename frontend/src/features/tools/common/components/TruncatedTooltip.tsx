import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Measure rendered text, including select values nested inside a field wrapper. */
function hasClippedText(element: HTMLElement): boolean {
  return [element, ...element.querySelectorAll<HTMLElement>('span')].some((candidate) => {
    const style = getComputedStyle(candidate);
    return (
      (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
      candidate.scrollWidth > candidate.clientWidth
    );
  });
}

export function TruncatedTooltip({ text, children }: { text: string; children: ReactElement }) {
  const trigger = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !trigger.current) return;
    const observer = new ResizeObserver(() => {
      if (trigger.current && !hasClippedText(trigger.current)) setOpen(false);
    });
    observer.observe(trigger.current);
    return () => {
      observer.disconnect();
    };
  }, [open]);
  return (
    <Tooltip
      delayDuration={0}
      open={open}
      onOpenChange={(next) => {
        setOpen(next && !!trigger.current && hasClippedText(trigger.current));
      }}
    >
      <TooltipTrigger
        asChild
        ref={(element) => {
          trigger.current = element;
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">{text}</TooltipContent>
    </Tooltip>
  );
}
