import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export interface StripScrollMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

/**
 * A slim scroll bar under a tab strip, drawn by Wordflow rather than the
 * browser so it looks the same in Safari, Chrome and the desktop app.
 * Rendered by: EditorTabs while its tabs overflow. Drag the thumb, or click the
 * rail to jump there; it is for people without horizontal scrolling, so it
 * stays visible, and grows a little while pointed at.
 */
export function StripScrollBar({
  scrollRef,
  metrics,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  metrics: StripScrollMetrics;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerX: number; scrollLeft: number } | null>(null);
  const { scrollLeft, clientWidth, scrollWidth } = metrics;
  const maxScroll = scrollWidth - clientWidth;
  if (maxScroll <= 1) return null;
  // The rail sits inside the strip's 8px side margins.
  const railWidth = Math.max(1, clientWidth - 16);
  const thumbWidth = Math.max(32, (clientWidth / scrollWidth) * railWidth);
  const travel = Math.max(1, railWidth - thumbWidth);
  const thumbLeft = (Math.min(scrollLeft, maxScroll) / maxScroll) * travel;

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerX: event.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
  };
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    const element = scrollRef.current;
    if (!start || !element) return;
    element.scrollLeft = start.scrollLeft + ((event.clientX - start.pointerX) / travel) * maxScroll;
  };
  const endDrag = () => {
    dragRef.current = null;
  };
  /** A click on the rail centres the thumb there. */
  const jump = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    const element = scrollRef.current;
    if (!rail || !element) return;
    const x = event.clientX - rail.getBoundingClientRect().left - thumbWidth / 2;
    element.scrollTo({
      left: (Math.min(Math.max(x, 0), travel) / travel) * maxScroll,
      behavior: 'smooth',
    });
  };

  return (
    <div
      ref={railRef}
      aria-hidden="true"
      data-testid="tab-strip-scrollbar"
      onPointerDown={jump}
      className="group/rail relative mx-[8px] mt-[3px] h-[6px] cursor-pointer"
    >
      <div className="absolute inset-x-0 top-[2px] h-[2px] rounded-full bg-[color-mix(in_srgb,var(--vscode-surface-border)_70%,transparent)] transition-[height,top] group-hover/rail:top-[1px] group-hover/rail:h-[4px]" />
      <div
        data-testid="tab-strip-scrollbar-thumb"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ left: thumbLeft, width: thumbWidth }}
        className="absolute top-[1.5px] h-[3px] rounded-full bg-[color-mix(in_srgb,var(--vscode-scrollbarSlider-background)_45%,transparent)] transition-[height,top,background-color] group-hover/rail:top-0 group-hover/rail:h-[6px] group-hover/rail:bg-[var(--vscode-scrollbarSlider-hoverBackground)] active:bg-[var(--vscode-scrollbarSlider-activeBackground)]"
      />
    </div>
  );
}
