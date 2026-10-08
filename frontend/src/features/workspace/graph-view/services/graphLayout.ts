import dagre from '@dagrejs/dagre';

export interface GraphLayoutOptions {
  rankdir?: 'LR' | 'TB';
  ranksep?: number;
  nodesep?: number;
  /** Box dagre reserves for each node; defaults to the full card's slot. */
  nodeSize?: (id: string) => GraphNodeSize;
}

interface GraphNodeSize {
  width: number;
  height: number;
}

interface GraphNode {
  id: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 140;
const FULL_NODE_SIZE: GraphNodeSize = { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };

// Synthetic node id only used inside this function. We add it to dagre's
// local graph as the parent of every real root so dagre's ranker treats
// all roots as rank-1 (one over from the super source), giving them a
// shared leftmost column. The id is then stripped from the output so no
// caller — and not the workspaceGraph React Query payload — ever sees
// it. The double-underscore prefix and uuid-like tail make a collision
// with a real workspace node id effectively impossible.
const SUPER_SOURCE_ID = '__dagre_super_source_2f7c3a__';

/**
 * Computes React Flow node positions from workspace graph nodes and edges.
 * Used by `useWorkspaceGraph` to derive stable React Flow node positions.
 * Why: because the graph hook needs deterministic Dagre positions before React Flow receives node coordinates.
 * Flow: build a Dagre graph, add nodes and edges, run layout, then map positions back onto React Flow nodes.
 */
export const computeDagreLayout = (
  nodes: GraphNode[] = [],
  edges: GraphEdge[] = [],
  options: GraphLayoutOptions = {},
) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: options.rankdir ?? 'LR',
    ranksep: options.ranksep ?? 140,
    nodesep: options.nodesep ?? 100,
    // ``network-simplex`` (the default) minimises total edge length, so
    // the super-source → root edges pull every root to the rank
    // directly after the super-source — a shared leftmost column.
    // The previously-used ``longest-path`` ranker greedily pushes each
    // node as far right as the longest descendant chain allows, which
    // is precisely why short-chain roots used to drift rightward.
    ranker: 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Pin every real root to a shared leftmost column by wiring them all
  // under a virtual super-source. Dagre 0.8.5 doesn't honour any
  // user-facing rank-constraint directive; with ``longest-path``, the
  // ranker normalises ranks so short-chain roots end up at the *right*
  // edge of the canvas — exactly the bug we're working around. Adding
  // a single artificial parent gives every root an incoming edge, so
  // they all share rank 1 in the layout pass. The super-source is then
  // stripped from the position output so the rest of the app never
  // learns it existed.
  const incomingTargets = new Set(edges.map((edge) => edge.target));
  const rootIds = nodes.filter((node) => !incomingTargets.has(node.id)).map((node) => node.id);
  const useSuperSource = rootIds.length > 0;

  if (useSuperSource) {
    g.setNode(SUPER_SOURCE_ID, { width: 0, height: 0 });
    rootIds.forEach((rootId) => g.setEdge(SUPER_SOURCE_ID, rootId));
  }

  const sizeOf = options.nodeSize ?? (() => FULL_NODE_SIZE);
  nodes.forEach((node) => {
    // Dagre writes x/y into the label it is given, so each node needs its own.
    g.setNode(node.id, { ...sizeOf(node.id) });
  });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  dagre.layout(g as Parameters<typeof dagre.layout>[0]);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, index) => {
    const layoutNode = g.node(node.id) as { x: number; y: number } | undefined;
    if (layoutNode) {
      const size = sizeOf(node.id);
      positions.set(node.id, {
        x: layoutNode.x - size.width / 2,
        y: layoutNode.y - size.height / 2,
      });
    } else {
      positions.set(node.id, {
        x: index * DEFAULT_NODE_WIDTH,
        y: 50,
      });
    }
  });

  return positions;
};

/** Below this zoom each Data Block shows as a compact name-only card. */
export const COMPACT_NODE_ZOOM_THRESHOLD = 0.6;

// Compact card geometry (CustomNode): 220-360px wide, 12px padding, the name
// in the heading-1 size (about 26px, leading-snug) on up to three lines.
const COMPACT_MIN_WIDTH = 220;
const COMPACT_MAX_WIDTH = 360;
const COMPACT_PADDING = 12;
const COMPACT_FONT_PX = 26;
const COMPACT_LINE_PX = COMPACT_FONT_PX * 1.375;
const COMPACT_MAX_LINES = 3;
/** Average glyph width in em, slightly generous so estimates rarely undershoot. */
const GLYPH_EM = 0.58;

/**
 * Estimates the compact card's box from the Data Block name, so the compact
 * layout can pack cards by their real size (issue 345).
 * Used by: buildGraphLayouts.
 */
const compactNodeSize = (name: string): GraphNodeSize => {
  const textWidth = Array.from(name).length * GLYPH_EM * COMPACT_FONT_PX;
  const contentMax = COMPACT_MAX_WIDTH - 2 * COMPACT_PADDING;
  const content = Math.min(
    contentMax,
    Math.max(COMPACT_MIN_WIDTH - 2 * COMPACT_PADDING, textWidth),
  );
  const lines = Math.min(COMPACT_MAX_LINES, Math.max(1, Math.ceil(textWidth / content)));
  return {
    width: Math.ceil(content + 2 * COMPACT_PADDING),
    height: Math.ceil(lines * COMPACT_LINE_PX + 2 * COMPACT_PADDING),
  };
};

export interface GraphLayout {
  positions: Map<string, { x: number; y: number }>;
  sizes: Map<string, GraphNodeSize>;
}

/**
 * Lays the graph out twice: with full cards (wide gaps for the metadata
 * cards) and with compact cards (each card's own size, narrow gaps), so the
 * graph stays compact when it is zoomed out far enough to show compact cards
 * (issue 345).
 * Used by: useWorkspaceGraph for node positions and the graph controls for
 * Fit view and for keeping the view steady when the layout switches.
 */
export const buildGraphLayouts = (
  nodes: { id: string; name: string }[],
  edges: GraphEdge[],
): { full: GraphLayout; compact: GraphLayout } => {
  const fullSizes = new Map(nodes.map((node) => [node.id, FULL_NODE_SIZE]));
  const compactSizes = new Map(nodes.map((node) => [node.id, compactNodeSize(node.name)]));
  return {
    full: {
      positions: computeDagreLayout(nodes, edges, { rankdir: 'LR', ranksep: 140, nodesep: 100 }),
      sizes: fullSizes,
    },
    compact: {
      positions: computeDagreLayout(nodes, edges, {
        rankdir: 'LR',
        ranksep: 64,
        nodesep: 20,
        nodeSize: (id) => compactSizes.get(id) ?? FULL_NODE_SIZE,
      }),
      sizes: compactSizes,
    },
  };
};
