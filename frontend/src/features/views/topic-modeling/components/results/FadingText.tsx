import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * One line of text that fades out at its end when it does not fit, like the
 * Topic words line, with the full text on hover (Chao: Topic names can be long).
 * Text that fits is not faded.
 */
export function FadingText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      setOverflowing(element.scrollWidth > element.clientWidth + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [text]);
  return (
    <span
      ref={ref}
      title={overflowing ? text : undefined}
      className={cn(
        'min-w-0 overflow-hidden whitespace-nowrap',
        overflowing && '[mask-image:linear-gradient(to_right,#000_calc(100%_-_2rem),transparent)]',
        className,
      )}
    >
      {text}
    </span>
  );
}
