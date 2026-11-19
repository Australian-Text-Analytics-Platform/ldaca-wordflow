import { type ReactNode, useRef, useState } from 'react';

import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { cn } from '@/lib/utils';

/** The brief pane can't be dragged smaller than this. */
const MIN_TOP_HEIGHT = 64;
/** The codebook pane always keeps this much, so codes stay readable. */
const MIN_BOTTOM_HEIGHT = 160;
const KEYBOARD_STEP = 40;
/** The dialog keeps 1rem from the window at the top and at the bottom. */
const WINDOW_MARGIN = 32;
const STORAGE_KEY = 'ldaca.layout.codebookEditorBriefHeight';

const readStoredHeight = (): number | null => {
  try {
    const parsed = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredHeight = (height: number | null) => {
  try {
    if (height === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
  } catch {
    // Private windows can refuse storage; the height then lasts until the window closes.
  }
};

interface CodebookEditorSplitProps {
  /** The input above the divider: the AI Code Designer's brief. None means no divider. */
  top: ReactNode | null;
  /** The codebook below the divider: Task context and the codes. */
  children: ReactNode;
}

/**
 * The Edit codebook window's two panes (Chao, 19 Nov 2026), laid out like the
 * analysis tools: the brief, an input, above; the codebook people read and
 * change after designing below, Task context included. Each pane scrolls, and
 * the divider between them drags (double-click resets, arrow keys step). The
 * codebook pane keeps at least 160 px; the brief pane gives way first when the
 * window is short. The height is remembered on this device.
 * Used by: `AnnotationClassDescriptionsEditor`.
 */
export function CodebookEditorSplit({ top, children }: CodebookEditorSplitProps) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [storedHeight, setStoredHeight] = useState<number | null>(readStoredHeight);
  const [drag, setDrag] = useState<{ startY: number; startHeight: number; height: number } | null>(
    null,
  );

  /** Keeps the brief pane between its minimum and what leaves the codebook pane its minimum. */
  const clamp = (height: number) => {
    const topHeight = topRef.current?.getBoundingClientRect().height ?? height;
    const bottomHeight = bottomRef.current?.getBoundingClientRect().height ?? MIN_BOTTOM_HEIGHT;
    const dialog = topRef.current?.closest('[role="dialog"]');
    // The dialog can still grow until it meets the window's margins.
    const growth = dialog
      ? Math.max(0, window.innerHeight - WINDOW_MARGIN - dialog.getBoundingClientRect().height)
      : 0;
    const max = topHeight + Math.max(0, bottomHeight - MIN_BOTTOM_HEIGHT) + growth;
    return Math.round(Math.min(Math.max(height, MIN_TOP_HEIGHT), Math.max(MIN_TOP_HEIGHT, max)));
  };

  const commit = (height: number | null) => {
    setStoredHeight(height);
    writeStoredHeight(height);
  };

  const topHeight = drag?.height ?? storedHeight;
  const currentTopHeight = () => topRef.current?.getBoundingClientRect().height ?? 0;

  return (
    <div className="flex min-h-0 flex-col" data-testid="codebook-editor-body">
      {top !== null ? (
        <>
          <div
            ref={topRef}
            data-testid="codebook-editor-brief-pane"
            // Shrinks only once the codebook pane is at its minimum.
            className={cn(
              '-mr-1 min-h-16 shrink-[0.001] overflow-y-auto pr-1',
              topHeight === null && 'max-h-[40dvh]',
            )}
            style={topHeight === null ? undefined : { height: topHeight }}
          >
            {top}
          </div>
          <ResizeHandle
            orientation="horizontal"
            variant="bar"
            isDragging={drag !== null}
            role="separator"
            aria-label="Resize the brief and the codebook"
            aria-orientation="horizontal"
            aria-valuenow={topHeight ?? undefined}
            aria-valuemin={MIN_TOP_HEIGHT}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
            data-testid="codebook-editor-divider"
            className="my-1.5 w-full shrink-0"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const startHeight = currentTopHeight();
              setDrag({ startY: event.clientY, startHeight, height: startHeight });
            }}
            onPointerMove={(event) => {
              if (!drag) return;
              const next = clamp(drag.startHeight + event.clientY - drag.startY);
              if (next !== drag.height) setDrag({ ...drag, height: next });
            }}
            onPointerUp={(event) => {
              if (!drag) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              if (drag.height !== drag.startHeight) commit(drag.height);
              setDrag(null);
            }}
            onPointerCancel={() => {
              setDrag(null);
            }}
            onDoubleClick={() => {
              commit(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              const step = event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP;
              commit(clamp(currentTopHeight() + step));
            }}
          />
        </>
      ) : null}
      <div
        ref={bottomRef}
        data-testid="codebook-editor-codebook-pane"
        className={cn(
          '-mr-1 flex flex-auto flex-col gap-3 overflow-y-auto pr-1',
          top !== null && 'min-h-40',
        )}
      >
        {children}
      </div>
    </div>
  );
}
