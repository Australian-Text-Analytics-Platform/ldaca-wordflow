import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DOC_IMAGE_ZOOM_MAX, DOC_IMAGE_ZOOM_STEP } from '@/config/layout';
import { useZoom } from '@/hooks/useZoom';

/** A Help image chosen for a closer look. */
export interface DocImage {
  src: string;
  alt: string;
}

interface Size {
  width: number;
  height: number;
}

/** Space kept clear around the image, in px (the `p-4` of the scroll area, both sides). */
const VIEWPORT_PADDING = 32;

const ZOOM_BUTTON_CLASS =
  'px-2 py-1 rounded-sm border border-input-border text-foreground hover:bg-panel/60 disabled:opacity-50 disabled:hover:bg-transparent';

/**
 * Shows one Help image in a window nearly as large as the app's, where it can
 * be enlarged and moved around.
 *
 * Why: inside Help an image is never wider than the text column, so the detail
 * of a large screenshot cannot be read there, whatever the text zoom.
 * Flow: the image opens fitted to the window (never above its real size);
 * zooming multiplies that size, and the scroll area then scrolls or is dragged.
 * Rendered by: `DocumentView`, over the Help window or a standalone document.
 */
export function DocImageViewer({
  image,
  onClose,
  returnFocusTo,
}: {
  image: DocImage;
  onClose: () => void;
  /** The control that opened the viewer; it takes the focus back on closing. */
  returnFocusTo?: HTMLElement | null;
}) {
  const { zoom, zoomIn, zoomOut, zoomReset, canZoomIn, canZoomOut } = useZoom({
    keyboardShortcuts: true,
    min: 1,
    max: DOC_IMAGE_ZOOM_MAX,
    step: DOC_IMAGE_ZOOM_STEP,
  });
  // The scroll area arrives through a portal after the first render, so it is
  // kept in state: the size observer below starts once it exists.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const measure = () => {
      setAvailable({
        width: viewport.clientWidth - VIEWPORT_PADDING,
        height: viewport.clientHeight - VIEWPORT_PADDING,
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [viewport]);

  // Until both sizes are known (an area not laid out yet measures 0) the image
  // is held inside the window by CSS.
  const measured =
    natural !== null &&
    available !== null &&
    Math.min(natural.width, natural.height, available.width, available.height) > 0;
  const width = measured
    ? natural.width *
      Math.min(1, available.width / natural.width, available.height / natural.height) *
      zoom
    : null;
  const movable = zoom > 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="doc-image-viewer flex h-[92vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
        hideCloseButton
        // Without this the focus falls to the window behind, and a keyboard
        // reader of Help is sent back to the top of the page.
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.isConnected) return;
          event.preventDefault();
          returnFocusTo.focus();
        }}
      >
        <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-4 py-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">
            {image.alt || 'Image'}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={zoomOut}
              disabled={!canZoomOut}
              className={ZOOM_BUTTON_CLASS}
              aria-label="Zoom out"
              title="Zoom out (Ctrl/Cmd -)"
            >
              −
            </button>
            <button
              type="button"
              onClick={zoomReset}
              className={`${ZOOM_BUTTON_CLASS} min-w-16`}
              aria-label="Fit to window"
              title="Fit to window (Ctrl/Cmd 0)"
            >
              {zoom === 1 ? 'Fit' : `${String(Math.round(zoom * 100))}%`}
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={!canZoomIn}
              className={ZOOM_BUTTON_CLASS}
              aria-label="Zoom in"
              title="Zoom in (Ctrl/Cmd +)"
            >
              +
            </button>
          </div>
          <DialogClose className="text-body text-link hover:text-link whitespace-nowrap">
            Close
          </DialogClose>
        </header>
        <div
          ref={setViewport}
          data-testid="doc-image-viewport"
          className={`flex flex-1 overflow-auto bg-editor p-4 ${movable ? 'cursor-grab active:cursor-grabbing' : ''}`}
          // Dragging moves an enlarged image, for a mouse without sideways scrolling.
          onPointerDown={(event) => {
            if (!movable || event.button !== 0) return;
            const area = event.currentTarget;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: area.scrollLeft,
              top: area.scrollTop,
            };
            area.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const area = event.currentTarget;
            area.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
            area.scrollTop = drag.current.top - (event.clientY - drag.current.y);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {/* m-auto, not centring on the flex box: an image larger than the area must start at its top-left edge to be scrolled to. */}
          <img
            src={image.src}
            alt={image.alt}
            draggable={false}
            className="m-auto block h-auto shrink-0 select-none"
            style={
              width === null
                ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                : { width, maxWidth: 'none' }
            }
            onLoad={(event) => {
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
