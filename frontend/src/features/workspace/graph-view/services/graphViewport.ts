import { COMPACT_NODE_ZOOM_THRESHOLD, type GraphLayout } from './graphLayout';

/**
 * Fit view never zooms out past this, so compact card names stay readable
 * (about 9px on screen). A graph too large to fit shows its start instead,
 * and scrolling pans to the rest (issue 345).
 */
export const FIT_MIN_ZOOM = 0.35;
const FIT_MAX_ZOOM = 1;
const FIT_PADDING = 0.2;
/** Screen margin kept when a graph larger than the pane is aligned to its start. */
const FIT_EDGE_MARGIN_PX = 24;
/** The vertical control rail covers the pane's left edge; Fit view keeps clear of it. */
const CONTROL_RAIL_INSET_PX = 56;

export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PaneSize {
  width: number;
  height: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const layoutBounds = (layout: GraphLayout): Bounds | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, position] of layout.positions) {
    const size = layout.sizes.get(id);
    if (!size) continue;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const zoomToFit = (bounds: Bounds, pane: PaneSize) =>
  Math.min(
    pane.width / Math.max(1, bounds.width * (1 + FIT_PADDING)),
    pane.height / Math.max(1, bounds.height * (1 + FIT_PADDING)),
  );

/** Centres the bounds on one axis when they fit, otherwise aligns their start. */
const placeAxis = (start: number, length: number, zoom: number, paneLength: number, inset = 0) =>
  length * zoom <= paneLength - inset - 2 * FIT_EDGE_MARGIN_PX
    ? inset + (paneLength - inset) / 2 - (start + length / 2) * zoom
    : inset + FIT_EDGE_MARGIN_PX - start * zoom;

/** The pane to the right of the control rail. */
const fitArea = (pane: PaneSize): PaneSize => ({
  width: Math.max(1, pane.width - CONTROL_RAIL_INSET_PX),
  height: pane.height,
});

/**
 * Chooses the Fit view viewport and which layout it shows. The full layout is
 * used while it fits at a zoom that still shows full cards; otherwise the
 * compact layout is fitted, at no less than FIT_MIN_ZOOM (issue 345).
 * Used by: the graph controls' Fit view and the first view of a Project.
 */
export const fitGraphViewport = (
  layouts: { full: GraphLayout; compact: GraphLayout },
  pane: PaneSize,
): { viewport: GraphViewport; compact: boolean } | null => {
  if (pane.width <= 0 || pane.height <= 0) return null;
  const full = layoutBounds(layouts.full);
  const compact = layoutBounds(layouts.compact);
  if (!full || !compact) return null;
  const area = fitArea(pane);
  const fullZoom = Math.min(zoomToFit(full, area), FIT_MAX_ZOOM);
  if (fullZoom >= COMPACT_NODE_ZOOM_THRESHOLD) {
    return {
      compact: false,
      viewport: {
        x: placeAxis(full.x, full.width, fullZoom, pane.width, CONTROL_RAIL_INSET_PX),
        y: placeAxis(full.y, full.height, fullZoom, pane.height),
        zoom: fullZoom,
      },
    };
  }
  // Stay just below the threshold so the compact cards this fit is for show.
  const zoom = Math.max(
    FIT_MIN_ZOOM,
    Math.min(zoomToFit(compact, area), COMPACT_NODE_ZOOM_THRESHOLD - 0.01),
  );
  return {
    compact: true,
    viewport: {
      x: placeAxis(compact.x, compact.width, zoom, pane.width, CONTROL_RAIL_INSET_PX),
      y: placeAxis(compact.y, compact.height, zoom, pane.height),
      zoom,
    },
  };
};

/**
 * Moves the viewport so the Data Block nearest the centre of the pane stays
 * where it is on screen when the layout switches between full and compact.
 * Used by: the graph controls when zooming crosses the compact threshold.
 */
export const anchoredGraphViewport = (
  viewport: GraphViewport,
  pane: PaneSize,
  from: GraphLayout,
  to: GraphLayout,
): GraphViewport => {
  const centreX = (pane.width / 2 - viewport.x) / viewport.zoom;
  const centreY = (pane.height / 2 - viewport.y) / viewport.zoom;
  const centreOf = (layout: GraphLayout, id: string) => {
    const position = layout.positions.get(id);
    const size = layout.sizes.get(id);
    return position && size
      ? { x: position.x + size.width / 2, y: position.y + size.height / 2 }
      : null;
  };
  let anchor: string | null = null;
  let nearest = Infinity;
  for (const id of from.positions.keys()) {
    const centre = centreOf(from, id);
    if (!centre) continue;
    const distance = Math.hypot(centre.x - centreX, centre.y - centreY);
    if (distance < nearest) {
      nearest = distance;
      anchor = id;
    }
  }
  const before = anchor ? centreOf(from, anchor) : null;
  const after = anchor ? centreOf(to, anchor) : null;
  if (!before || !after) return viewport;
  return {
    x: viewport.x - (after.x - before.x) * viewport.zoom,
    y: viewport.y - (after.y - before.y) * viewport.zoom,
    zoom: viewport.zoom,
  };
};
