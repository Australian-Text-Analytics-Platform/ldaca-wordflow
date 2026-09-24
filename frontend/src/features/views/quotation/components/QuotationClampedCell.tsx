import { useRef, useState, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface QuotationClampedCellProps {
  children: ReactNode;
}

/**
 * Bounds the Quote Extraction cell to a fixed width and three lines, and shows
 * the complete cell content in a hover tooltip only when the clamp hides some
 * of it.
 *
 * Rendered by: `QuotationNodeBlock` around the document pseudo-column so the
 * result table no longer grows to the widest unwrapped context.
 */
export function QuotationClampedCell({ children }: QuotationClampedCellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Line clamping hides overflow vertically, so a taller scroll box means
  // there is content the user cannot see.
  const isClamped = () => {
    const element = contentRef.current;
    return element !== null && element.scrollHeight > element.clientHeight + 1;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip
        open={open}
        onOpenChange={(next) => {
          setOpen(next && isClamped());
        }}
      >
        <TooltipTrigger asChild>
          <div
            ref={contentRef}
            data-testid="quotation-clamped-cell"
            className="w-[32rem] line-clamp-3 whitespace-normal break-words"
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-h-[60vh] max-w-xl overflow-y-auto whitespace-normal break-words border border-surface-border bg-surface px-3 py-2 text-body text-foreground"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
