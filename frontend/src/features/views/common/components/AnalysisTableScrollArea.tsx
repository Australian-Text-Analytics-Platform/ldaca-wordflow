import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { ResultFrame } from './ResultFrame';

interface AnalysisTableScrollAreaProps {
  maxHeightClass: string;
  children: React.ReactNode;
  contentClassName?: string;
  className?: string;
  viewportRef?: React.Ref<HTMLDivElement>;
}

/**
 * Wraps wide analysis result tables in the project's standard two-axis scroll
 * area so feature tables do not each implement overflow chrome.
 * Used by: Concordance/Quotation result table blocks. Annotation tables use the
 * resizable AnnotationTableFrame instead.
 */
const AnalysisTableScrollArea = ({
  maxHeightClass,
  children,
  contentClassName = 'min-w-max',
  className,
  viewportRef,
}: AnalysisTableScrollAreaProps) => (
  <ScrollArea
    viewportRef={viewportRef}
    scrollbars="both"
    data-testid="analysis-table-scroll-area"
    className={cn(maxHeightClass, className)}
  >
    <div className={contentClassName}>{children}</div>
  </ScrollArea>
);

interface AnalysisTableFrameProps extends AnalysisTableScrollAreaProps {
  belowTable?: React.ReactNode;
  style?: React.CSSProperties;
  /**
   * Inside an analysis results pane, fill its spare height and offer a resize
   * grip, remembered under this key (issue 196). `maxHeightClass` then applies
   * only outside a results pane.
   */
  resultKey?: string;
}

/**
 * Adds the standard rounded-sm/bordered analysis table shell around
 * AnalysisTableScrollArea.
 * Used by: Concordance/Quotation result blocks because those views need the
 * same clipped border boundary around scrollable tables without re-creating the
 * wrapper classes in every table component.
 */
export const AnalysisTableFrame = ({
  maxHeightClass,
  children,
  belowTable,
  contentClassName,
  className,
  style,
  viewportRef,
  resultKey,
}: AnalysisTableFrameProps) => {
  const shellClassName = cn(
    'overflow-hidden rounded-lg border border-surface-border bg-surface',
    className,
  );
  if (!resultKey) {
    return (
      <div className={shellClassName} style={style}>
        <AnalysisTableScrollArea
          maxHeightClass={maxHeightClass}
          contentClassName={contentClassName}
          viewportRef={viewportRef}
        >
          {children}
        </AnalysisTableScrollArea>
        {belowTable}
      </div>
    );
  }
  return (
    <ResultFrame storageKey={resultKey} fitContent minHeight={200} className={shellClassName}>
      {(height) => (
        // A definite grid row lets the table scroll inside the frame's height.
        <div
          className={cn('grid', height !== null && 'h-full grid-rows-[minmax(0,1fr)_auto]')}
          style={style}
        >
          <AnalysisTableScrollArea
            maxHeightClass={height !== null ? 'h-full' : maxHeightClass}
            contentClassName={contentClassName}
            viewportRef={viewportRef}
          >
            {children}
          </AnalysisTableScrollArea>
          {belowTable ?? <span aria-hidden="true" />}
        </div>
      )}
    </ResultFrame>
  );
};
