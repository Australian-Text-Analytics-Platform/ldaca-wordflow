import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** Characters kept at the start; the last of them is half faded. */
const HEAD_LENGTH = 3;

interface MiddleFadeLabelProps {
  text: string;
  className?: string;
}

/**
 * Single-line label for a narrow column (issue 199).
 * Flow: when the text fits it shows in full. Otherwise it keeps the first two
 * characters with a half-faded third, then as much of the end as fits, whose
 * first visible characters fade in, like the Data Blocks list. The full text
 * stays available to assistive technology and as the title.
 */
export function MiddleFadeLabel({ text, className }: MiddleFadeLabelProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const update = () => {
      setOverflowing(measure.getBoundingClientRect().width > container.clientWidth + 1);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <span
      ref={containerRef}
      title={text}
      data-testid="middle-fade-label"
      data-overflowing={overflowing ? 'true' : 'false'}
      className={cn('relative flex min-w-0 overflow-hidden whitespace-nowrap', className)}
    >
      {/* Measures the full text without taking part in layout. */}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute whitespace-nowrap">
        {text}
      </span>
      {overflowing ? (
        <>
          <span className="sr-only">{text}</span>
          <span aria-hidden="true" className="shrink-0">
            {text.slice(0, HEAD_LENGTH - 1)}
            <span style={{ maskImage: 'linear-gradient(to right, black 20%, transparent 90%)' }}>
              {text.charAt(HEAD_LENGTH - 1)}
            </span>
          </span>
          {/* rtl clips the start, so the end of the text stays visible. */}
          <span
            aria-hidden="true"
            dir="rtl"
            className="ml-1 min-w-0 flex-1 overflow-hidden text-left"
            style={{ maskImage: 'linear-gradient(to right, transparent, black 1.75em)' }}
          >
            <span dir="ltr">{text}</span>
          </span>
        </>
      ) : (
        <span className="truncate">{text}</span>
      )}
    </span>
  );
}
