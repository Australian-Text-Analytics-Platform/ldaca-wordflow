import type React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResultFrame } from '@/features/views/common/components/ResultFrame';
import { cn } from '@/lib/utils';

/** Height of the table outside an analysis results pane (tests, previews). */
const FALLBACK_MAX_HEIGHT = 'min(384px, 75vh)';

interface AnnotationTableFrameProps {
  children: React.ReactNode;
  belowTable?: React.ReactNode;
  contentClassName?: string;
  viewportRef?: React.Ref<HTMLDivElement>;
}

/**
 * Always-scrollable shell shared by the Annotation Manual, Preview, and Review tables.
 * Flow: the table fills the results pane's spare height, so the
 * parameters/results handle shows more or fewer rows, and never grows past
 * its rows. The bottom-right grip sets its own size, remembered for the
 * Annotation tool; double-clicking the grip returns to filling (issue 196).
 */
export function AnnotationTableFrame({
  children,
  belowTable,
  contentClassName = 'min-w-full',
  viewportRef,
}: AnnotationTableFrameProps) {
  return (
    <ResultFrame
      storageKey="annotation.table"
      fitContent
      minHeight={240}
      className="rounded-lg border border-surface-border bg-surface"
    >
      {(height) => (
        // A definite grid row lets the table scroll inside the frame's height.
        <div className={cn('grid', height !== null && 'h-full grid-rows-[minmax(0,1fr)_auto]')}>
          <ScrollArea
            viewportRef={viewportRef}
            scrollbars="both"
            type="always"
            data-testid="analysis-table-scroll-area"
            className={height !== null ? 'h-full' : undefined}
            style={height !== null ? undefined : { maxHeight: FALLBACK_MAX_HEIGHT }}
          >
            <div className={cn(contentClassName)}>{children}</div>
          </ScrollArea>
          {belowTable ?? <span aria-hidden="true" />}
        </div>
      )}
    </ResultFrame>
  );
}
