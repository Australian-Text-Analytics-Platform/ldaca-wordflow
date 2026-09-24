import { useRef, useState, type ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface QuotationClampedCellProps {
  children: ReactNode;
}

/** Horizontal shift that keeps the tooltip from reading as the next table row. */
const TOOLTIP_ALIGN_OFFSET_PX = 48;

/**
 * Bounds the Quote Extraction cell to a fixed width and three lines, and shows
 * the complete cell content in a hover tooltip only when the clamp hides some
 * of it. The tooltip is tinted, outlined, shifted right, and points back at
 * the cell so it stands apart from the table cells it overlays.
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
            className="w-[42rem] line-clamp-3 whitespace-normal break-words"
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={8}
          alignOffset={TOOLTIP_ALIGN_OFFSET_PX}
          className="max-w-2xl overflow-visible whitespace-normal break-words rounded-lg border-2 border-focus bg-info-background px-4 py-3 text-body text-foreground shadow-[var(--vscode-shadow-lg)]"
        >
          {/* Scroll inside the bubble; the bubble itself must not clip its arrow. */}
          <div className="max-h-[60vh] overflow-y-auto">{children}</div>
          <TooltipPrimitive.Arrow className="fill-focus" width={14} height={7} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
