import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';

// One window-local table height shared by Manual and AI review, independent of saved requests.
const useHeight = create<{ height: number }>(() => ({ height: 384 }));
export function ReviewViewport({ children }: { children: ReactNode }) {
  const height = useHeight((s) => s.height);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      // Persist deliberate native resize handles, not max-height changes from resizing the window.
      const value = Number.parseFloat(element.style.height);
      if (Number.isFinite(value) && value !== useHeight.getState().height)
        useHeight.setState({ height: value });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <div
      ref={ref}
      style={{ height }}
      className="min-h-48 max-h-[75vh] min-w-0 resize-y overflow-auto"
    >
      {children}
    </div>
  );
}
