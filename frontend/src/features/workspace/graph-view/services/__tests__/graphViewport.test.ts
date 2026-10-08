import { describe, expect, it } from 'vitest';

import { buildGraphLayouts, COMPACT_NODE_ZOOM_THRESHOLD } from '../graphLayout';
import { anchoredGraphViewport, FIT_MIN_ZOOM, fitGraphViewport } from '../graphViewport';

/** A chain of `length` Data Blocks, the shape that made Fit view unreadable. */
const chain = (length: number) => {
  const nodes = Array.from({ length }, (_, index) => ({
    id: `n${String(index)}`,
    name: `Data Block ${String(index)}`,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    source: nodes[index].id,
    target: node.id,
  }));
  return buildGraphLayouts(nodes, edges);
};

describe('buildGraphLayouts (issue 345)', () => {
  it('gives every Data Block its own position in both layouts', () => {
    const layouts = chain(5);
    for (const layout of [layouts.full, layouts.compact]) {
      const xs = new Set([...layout.positions.values()].map((position) => position.x));
      expect(xs.size).toBe(5);
    }
  });

  it('packs the compact layout tighter than the full one', () => {
    const layouts = chain(5);
    const span = (layout: typeof layouts.full) => {
      const xs = [...layout.positions.values()].map((position) => position.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(span(layouts.compact)).toBeLessThan(span(layouts.full) / 1.5);
  });
});

describe('fitGraphViewport (issue 345)', () => {
  it('fits a small graph with full cards', () => {
    const fit = fitGraphViewport(chain(2), { width: 1200, height: 600 });
    expect(fit?.compact).toBe(false);
    expect(fit?.viewport.zoom).toBeGreaterThanOrEqual(COMPACT_NODE_ZOOM_THRESHOLD);
  });

  it('never zooms out past the readable minimum and starts at the first Data Block', () => {
    const layouts = chain(20);
    const fit = fitGraphViewport(layouts, { width: 380, height: 380 });
    expect(fit?.compact).toBe(true);
    expect(fit?.viewport.zoom).toBe(FIT_MIN_ZOOM);
    const first = layouts.compact.positions.get('n0');
    if (!fit || !first) throw new Error('expected a fit and a first block');
    // The first Data Block is on screen, to the right of the control rail.
    const screenX = first.x * fit.viewport.zoom + fit.viewport.x;
    expect(screenX).toBeGreaterThan(56);
    expect(screenX).toBeLessThan(380 / 2);
  });

  it('uses the compact layout below the full-card zoom when it fits', () => {
    const fit = fitGraphViewport(chain(6), { width: 900, height: 500 });
    expect(fit?.compact).toBe(true);
    expect(fit?.viewport.zoom).toBeGreaterThan(FIT_MIN_ZOOM);
    expect(fit?.viewport.zoom).toBeLessThan(COMPACT_NODE_ZOOM_THRESHOLD);
  });

  it('returns nothing before the pane has a size', () => {
    expect(fitGraphViewport(chain(3), { width: 0, height: 0 })).toBeNull();
  });
});

describe('anchoredGraphViewport (issue 345)', () => {
  it('keeps the Data Block nearest the centre in place when the layout switches', () => {
    const layouts = chain(6);
    const pane = { width: 800, height: 600 };
    const viewport = { x: 100, y: 50, zoom: 0.5 };
    const next = anchoredGraphViewport(viewport, pane, layouts.full, layouts.compact);
    const screen = (layout: typeof layouts.full, id: string, at: typeof viewport) => {
      const position = layout.positions.get(id);
      const size = layout.sizes.get(id);
      if (!position || !size) throw new Error(id);
      return {
        x: (position.x + size.width / 2) * at.zoom + at.x,
        y: (position.y + size.height / 2) * at.zoom + at.y,
      };
    };
    const ids = [...layouts.full.positions.keys()];
    const nearest = ids.reduce((best, id) => {
      const a = screen(layouts.full, id, viewport);
      const b = screen(layouts.full, best, viewport);
      return Math.hypot(a.x - 400, a.y - 300) < Math.hypot(b.x - 400, b.y - 300) ? id : best;
    });
    const before = screen(layouts.full, nearest, viewport);
    const after = screen(layouts.compact, nearest, next);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBe(viewport.zoom);
  });
});
