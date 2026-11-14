import type { TopicColorGroups, TopicModelingTopic } from '@/api';
import { matchChecklistOption } from '@/features/views/common/checklistSearch';
import { GREY, RANDOMIZABLE_FG } from '@/features/views/common/vizPalette';
import {
  interpolateColor,
  matchedTopicWords,
  matchTopicWords,
  topicSearchTerms,
} from '../../topicModelingAdapters';
import { isUngrouped, UNGROUPED_BUBBLE_OPACITY } from '../../ungrouped';

const TOPIC_GRAPH_WIDTH = 1000;
const TOPIC_GRAPH_HEIGHT = 550;
/** The widest or tallest shape the bubble plane takes (issue 308). */
const TOPIC_PLANE_MAX_RATIO = 2.5;

export interface TopicGraphPoint {
  x: number;
  y: number;
}

/** The virtual area topics are laid out in, in graph pixels. */
export interface TopicGraphPlane {
  width: number;
  height: number;
}

/** The plane used before the canvas has been measured. */
export const DEFAULT_TOPIC_GRAPH_PLANE: TopicGraphPlane = {
  width: TOPIC_GRAPH_WIDTH,
  height: TOPIC_GRAPH_HEIGHT,
};

/**
 * A plane with the canvas's shape (width ÷ height), kept between 2.5:1 and
 * 1:2.5 and with the same area as the default, so bubble sizes stay
 * comparable while the map fills a wide, square or tall canvas (issue 308).
 */
export function topicGraphPlaneFor(aspect: number): TopicGraphPlane {
  if (!Number.isFinite(aspect) || aspect <= 0) return DEFAULT_TOPIC_GRAPH_PLANE;
  const ratio = Math.min(TOPIC_PLANE_MAX_RATIO, Math.max(1 / TOPIC_PLANE_MAX_RATIO, aspect));
  const area = TOPIC_GRAPH_WIDTH * TOPIC_GRAPH_HEIGHT;
  return {
    width: Math.round(Math.sqrt(area * ratio)),
    height: Math.round(Math.sqrt(area / ratio)),
  };
}

export interface TopicGraphViewport extends TopicGraphPoint {
  zoom: number;
}

export interface TopicBubbleModel {
  id: number;
  topic: TopicModelingTopic;
  position: TopicGraphPoint;
  radius: number;
  fill: string;
  /** Resting fill opacity; hover shows the bubble above this range (issue 188). */
  fillOpacity: number;
  selected: boolean;
  lassoed: boolean;
  hovered: boolean;
  /** Its examples are shown beside the list; the bubble carries an eye (issue 353). */
  shown: boolean;
  filteredOut: boolean;
  /**
   * Words matching the search, each with the index of the term it matches,
   * shown bold in that term's colour in the bubble's word cloud (issues 342, 434).
   */
  matchedWords: Record<string, number>;
}

/** One metadata value shown as a bubble colour, chip, and legend entry. */
interface TopicColorGroupPresentation {
  label: string;
  color: string;
  documentCount: number;
  missing: boolean;
}

/** Per-Topic document counts split by one metadata column (single corpus only). */
export interface TopicColorScheme {
  column: string;
  groups: TopicColorGroupPresentation[];
  /** `topicCounts[topicId][groupIndex]`, using the same Top N rule as sizes. */
  topicCounts: number[][];
}

/** Assigns palette colours in group order; the missing group is always grey. */
export function buildTopicColorScheme(data: TopicColorGroups): TopicColorScheme | null {
  if (data.column === null) return null;
  let paletteIndex = 0;
  return {
    column: data.column,
    groups: data.groups.map((group) => ({
      label: group.label,
      documentCount: group.document_count,
      missing: group.missing,
      color: group.missing
        ? GREY
        : (RANDOMIZABLE_FG[paletteIndex++ % RANDOMIZABLE_FG.length] ?? GREY),
    })),
    topicCounts: data.topic_counts,
  };
}

/**
 * Blends the two values most over-represented in a Topic. Each value's count
 * is divided by its document count so common values do not dominate, then
 * the top two are mixed exactly like the two-corpus colours.
 */
export function topicColorSchemeFill(
  scheme: TopicColorScheme,
  topicId: number,
  fallback: string,
): string {
  const counts = scheme.topicCounts[topicId] ?? [];
  const ranked = scheme.groups
    .map((group, index) => ({
      color: group.color,
      weight: group.documentCount > 0 ? (counts[index] ?? 0) / group.documentCount : 0,
    }))
    .filter((entry) => entry.weight > 0)
    .sort((left, right) => right.weight - left.weight);
  const [first, second] = ranked;
  if (!first) return fallback;
  if (!second) return first.color;
  return interpolateColor(
    first.color,
    second.color,
    second.weight / (first.weight + second.weight),
  );
}

/** Opacity range for bubbles coloured by a column: evenly spread to one value. */
export const TOPIC_OPACITY_MIN = 0.25;
export const TOPIC_OPACITY_MAX = 0.8;
/** Resting opacity when bubbles are not coloured by a column. */
export const TOPIC_OPACITY_DEFAULT = 0.6;
/** Hovered bubbles stand out above the range. */
export const TOPIC_OPACITY_HOVER = 0.92;

/**
 * How concentrated a Topic is across the colour-by values (issue 188):
 * C = 1 − Pielou's evenness J, with J = H / ln K, where H = −Σ pᵢ ln pᵢ over
 * the K values' shares pᵢ (each value's count divided by its document count,
 * then normalised to sum to 1). C is 1 for one value and 0 for an even spread.
 */
export function topicValueConcentration(scheme: TopicColorScheme, topicId: number): number | null {
  const counts = scheme.topicCounts[topicId] ?? [];
  const weights = scheme.groups.map((group, index) =>
    group.documentCount > 0 ? (counts[index] ?? 0) / group.documentCount : 0,
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const valueCount = weights.length;
  if (total <= 0) return null;
  if (valueCount < 2) return 1;
  let entropy = 0;
  for (const weight of weights) {
    const share = weight / total;
    if (share > 0) entropy -= share * Math.log(share);
  }
  const evenness = entropy / Math.log(valueCount);
  return Math.min(1, Math.max(0, 1 - evenness));
}

/** Resting opacity: min + (max − min) × √C, so typical topics spread out. */
export function topicColorSchemeOpacity(scheme: TopicColorScheme, topicId: number): number {
  const concentration = topicValueConcentration(scheme, topicId);
  if (concentration === null) return TOPIC_OPACITY_DEFAULT;
  return TOPIC_OPACITY_MIN + (TOPIC_OPACITY_MAX - TOPIC_OPACITY_MIN) * Math.sqrt(concentration);
}

interface BuildTopicBubbleModelsOptions {
  topics: TopicModelingTopic[];
  corpusSizes: number[];
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
  selectedTopicIds: Set<number>;
  lassoTopicIds: Set<number>;
  hoveredTopicId: number | null;
  shownTopicId?: number | null;
  topicSearchQuery: string;
  colorScheme?: TopicColorScheme | null;
  /** The canvas-shaped plane to lay topics out in (issue 308). */
  plane?: TopicGraphPlane;
}

/** Resolves one corpus colour from persisted node metadata, then palette fallback. */
export function resolveTopicCorpusColor(
  index: number,
  fallback: string,
  panelNodeIds: string[],
  nodeColors: Record<string, string>,
  defaultPalette: string[],
): string {
  const nodeId = panelNodeIds[index];
  if (nodeId) {
    // An empty persisted colour deliberately falls through to the palette.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return nodeColors[nodeId] || defaultPalette[index] || fallback;
  }
  return defaultPalette[index] ?? fallback;
}

/**
 * Legend for two Data Blocks (issue 281): each Data Block's colour, and the
 * blend between them, which shows a topic's share of each Data Block (sizes
 * relative to each Data Block, as the bubble fill uses). Shown under the
 * graph and in every download, so the colours keep their meaning outside
 * Wordflow. Null for one Data Block.
 */
/** Each Data Block's colour, in run order, as the bubbles use it (issue 353). */
export function topicCorpusColors(presentation: {
  corpusCount: number;
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
}): string[] {
  const { panelNodeIds, nodeColors, defaultPalette } = presentation;
  return Array.from({ length: presentation.corpusCount }, (_, index) =>
    resolveTopicCorpusColor(
      index,
      defaultPalette[index] ?? (index === 0 ? '#2563eb' : '#dc2626'),
      panelNodeIds,
      nodeColors,
      defaultPalette,
    ),
  );
}

export function topicCorpusLegend(
  presentation: {
    corpusCount: number;
    panelNodeIds: string[];
    nodeColors: Record<string, string>;
    defaultPalette: string[];
  },
  nodeNames: readonly string[],
): { label: string; color: string }[] | null {
  if (presentation.corpusCount !== 2) return null;
  const { panelNodeIds, nodeColors, defaultPalette } = presentation;
  const colorA = resolveTopicCorpusColor(
    0,
    defaultPalette[0] ?? '#2563eb',
    panelNodeIds,
    nodeColors,
    defaultPalette,
  );
  const colorB = resolveTopicCorpusColor(
    1,
    defaultPalette[1] ?? '#dc2626',
    panelNodeIds,
    nodeColors,
    defaultPalette,
  );
  return [
    { label: nodeNames[0] ?? 'First Data Block', color: colorA },
    {
      label: 'In between: shared by both, by share of each',
      color: interpolateColor(colorA, colorB, 0.5),
    },
    { label: nodeNames[1] ?? 'Second Data Block', color: colorB },
  ];
}

/**
 * Maps backend topic coordinates (PaCMAP, whose axes carry no meaning) into
 * the renderer's virtual plane, stretching each axis to fill it.
 */
export function normalizeTopicPositions(
  topics: TopicModelingTopic[],
  plane: TopicGraphPlane = DEFAULT_TOPIC_GRAPH_PLANE,
): Map<number, TopicGraphPoint> {
  if (topics.length === 0) return new Map();
  const xs = topics.map((topic) => topic.x);
  const ys = topics.map((topic) => topic.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  return new Map(
    topics.map((topic) => [
      topic.id,
      {
        x: xSpan === 0 ? plane.width / 2 : ((topic.x - xMin) / xSpan) * plane.width,
        y: ySpan === 0 ? plane.height / 2 : ((topic.y - yMin) / ySpan) * plane.height,
      },
    ]),
  );
}

/** The smaller bubble's centre stays this share of its radius outside the larger one. */
const OVERLAP_CENTRE_MARGIN = 0.35;
/** Two topic labels never sit closer than this, in graph pixels. */
const MIN_LABEL_DISTANCE = 26;
const RELAX_ITERATIONS = 240;
/** Upper bound on separation-only passes after the anchored rounds. */
const RELAX_MAX_FINAL_PASSES = 3000;
/**
 * Most steps one layout takes, where a step compares one pair of bubbles,
 * looks in one grid cell, or files one bubble. The layout runs on the main
 * thread: 2,238 Topics once took 46 s to lay out and froze the app. With the
 * budget the same Topics take about 0.6 s (Node on an M-series Mac), leaving
 * a handful of near-hidden pairs; 1,500 or fewer settle before reaching it.
 */
const RELAX_WORK_BUDGET = 60_000_000;
/** The grid has at most this many cells per bubble (and at least the floor), however far bubbles spread. */
const GRID_CELLS_PER_BUBBLE = 16;
const GRID_MIN_CELLS = 4096;
/**
 * Each round, bubbles drift this share of the way back to their projected
 * spot; the pull fades to zero over the rounds so separation can finish.
 */
const RELAX_ANCHOR = 0.04;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Area of a hexagonal-packing cell per unit of squared spacing: √3 ÷ 2. */
const HEXAGON_CELL_SHARE = Math.sqrt(3) / 2;

interface RelaxItem {
  id: number;
  x: number;
  y: number;
  radius: number;
}

interface RelaxBubble extends RelaxItem {
  originX: number;
  originY: number;
}

/** Moves a pair apart if one hides the other's centre; returns the shortfall it found. */
function pushApart(a: RelaxBubble, b: RelaxBubble): number {
  const large = Math.max(a.radius, b.radius);
  const small = Math.min(a.radius, b.radius);
  const required = Math.max(large + OVERLAP_CENTRE_MARGIN * small, MIN_LABEL_DISTANCE);
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= required) return 0;
  if (distance < 1e-6) {
    // Same spot: split in a fixed direction so the layout is repeatable.
    const angle = GOLDEN_ANGLE * (a.id * 31 + b.id);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  } else {
    dx /= distance;
    dy /= distance;
  }
  const deficit = required - distance;
  // Area weights: the smaller bubble takes most of the move.
  const shareA = (b.radius * b.radius) / (a.radius * a.radius + b.radius * b.radius);
  const shareB = 1 - shareA;
  a.x -= dx * deficit * shareA;
  a.y -= dy * deficit * shareA;
  b.x += dx * deficit * shareB;
  b.y += dy * deficit * shareB;
  return deficit;
}

/**
 * When the bubbles need more room than the area they start in, as with
 * thousands of small Topics, spreads their starting spots out from the middle
 * until they fit, keeping the map's shape. Separation alone would push the
 * crowd outwards a little per pass and run out of budget first. Each bubble
 * needs its own disc, or for a small one the hexagonal cell that keeps
 * labels 26 px apart.
 */
function spreadCrowdedBubbles(bubbles: RelaxBubble[]): void {
  if (bubbles.length < 2) return;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let needed = 0;
  for (const bubble of bubbles) {
    left = Math.min(left, bubble.x);
    right = Math.max(right, bubble.x);
    top = Math.min(top, bubble.y);
    bottom = Math.max(bottom, bubble.y);
    needed += Math.max(Math.PI * bubble.radius ** 2, HEXAGON_CELL_SHARE * MIN_LABEL_DISTANCE ** 2);
  }
  const available =
    Math.max(right - left, MIN_LABEL_DISTANCE) * Math.max(bottom - top, MIN_LABEL_DISTANCE);
  if (needed <= available) return;
  const scale = Math.sqrt(needed / available);
  const middleX = (left + right) / 2;
  const middleY = (top + bottom) / 2;
  for (const bubble of bubbles) {
    bubble.x = middleX + (bubble.x - middleX) * scale;
    bubble.y = middleY + (bubble.y - middleY) * scale;
    bubble.originX = bubble.x;
    bubble.originY = bubble.y;
  }
}

/**
 * Nudges bubbles apart so none is hidden behind another (issue 189). Partial
 * overlap is allowed, since nearby topics are similar, but for every pair the
 * smaller bubble's centre, where its label is, stays outside the larger one:
 * distance ≥ max(r_large + 0.35 r_small, 26 px). The smaller bubble moves more,
 * a weak pull keeps bubbles near their projected positions, and the result is
 * deterministic.
 *
 * Each pass compares only bubbles close enough to matter, found through a
 * grid, and the layout stops after a fixed amount of work, so thousands of
 * Topics lay out in well under a second instead of freezing the app.
 * Called by: buildTopicBubbleModels.
 */
export function relaxTopicPositions(items: readonly RelaxItem[]): Map<number, TopicGraphPoint> {
  const count = items.length;
  const bubbles: RelaxBubble[] = items.map((item) => ({
    ...item,
    originX: item.x,
    originY: item.y,
  }));
  spreadCrowdedBubbles(bubbles);
  // A pair never needs more room than its larger bubble's reach, so each pair
  // is compared by that bubble (the lower index when the reaches are equal),
  // searching the grid cells within its reach. Most bubbles are small and
  // search only the cells next to their own.
  const reach = Float64Array.from(bubbles, (bubble) =>
    Math.max(bubble.radius * (1 + OVERLAP_CENTRE_MARGIN), MIN_LABEL_DISTANCE),
  );
  const cellOf = new Int32Array(count);
  const cellColumn = new Int32Array(count);
  const cellRow = new Int32Array(count);
  /** Bubble indices grouped by cell, in index order within a cell. */
  const filed = new Int32Array(count);
  let cellStart = new Int32Array(0);
  let cellCursor = new Int32Array(0);
  let work = 0;

  /** One pass over every pair of nearby bubbles; returns the largest remaining shortfall. */
  const separate = (): number => {
    // File bubbles by where they stand at the start of the pass, so each
    // nearby pair is compared once and always in the same order.
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const bubble of bubbles) {
      left = Math.min(left, bubble.x);
      right = Math.max(right, bubble.x);
      top = Math.min(top, bubble.y);
      bottom = Math.max(bottom, bubble.y);
    }
    let cellSize = MIN_LABEL_DISTANCE;
    const cellLimit = Math.max(GRID_MIN_CELLS, GRID_CELLS_PER_BUBBLE * count);
    const wanted = ((right - left) / cellSize + 1) * ((bottom - top) / cellSize + 1);
    if (wanted > cellLimit) cellSize *= Math.sqrt(wanted / cellLimit);
    const columns = Math.floor((right - left) / cellSize) + 1;
    const rows = Math.floor((bottom - top) / cellSize) + 1;
    const cellCount = columns * rows;
    if (cellStart.length < cellCount + 1) {
      cellStart = new Int32Array(cellCount + 1);
      cellCursor = new Int32Array(cellCount + 1);
    } else {
      cellStart.fill(0, 0, cellCount + 1);
    }
    bubbles.forEach((bubble, index) => {
      const column = Math.floor((bubble.x - left) / cellSize);
      const row = Math.floor((bubble.y - top) / cellSize);
      const cell = column * rows + row;
      cellColumn[index] = column;
      cellRow[index] = row;
      cellOf[index] = cell;
      cellStart[cell + 1] = (cellStart[cell + 1] ?? 0) + 1;
    });
    for (let cell = 0; cell < cellCount; cell += 1) {
      cellStart[cell + 1] = (cellStart[cell + 1] ?? 0) + (cellStart[cell] ?? 0);
    }
    cellCursor.set(cellStart.subarray(0, cellCount));
    for (let index = 0; index < count; index += 1) {
      const cell = cellOf[index] ?? 0;
      const slot = cellCursor[cell] ?? 0;
      filed[slot] = index;
      cellCursor[cell] = slot + 1;
    }
    work += count + cellCount;

    let worst = 0;
    bubbles.forEach((a, i) => {
      const reachA = reach[i] ?? MIN_LABEL_DISTANCE;
      const span = Math.ceil(reachA / cellSize);
      const column = cellColumn[i] ?? 0;
      const row = cellRow[i] ?? 0;
      const lastColumn = Math.min(columns - 1, column + span);
      const lastRow = Math.min(rows - 1, row + span);
      for (let c = Math.max(0, column - span); c <= lastColumn; c += 1) {
        for (let r = Math.max(0, row - span); r <= lastRow; r += 1) {
          const cell = c * rows + r;
          const end = cellStart[cell + 1] ?? 0;
          work += 1;
          for (let slot = cellStart[cell] ?? 0; slot < end; slot += 1) {
            const j = filed[slot] ?? 0;
            const reachB = reach[j] ?? MIN_LABEL_DISTANCE;
            // The other bubble compares this pair.
            if (reachB > reachA || (reachB === reachA && j <= i)) continue;
            const b = bubbles[j];
            if (!b) continue;
            work += 1;
            worst = Math.max(worst, pushApart(a, b));
          }
        }
      }
    });
    return worst;
  };
  const withinBudget = () => work < RELAX_WORK_BUDGET;
  // When passes are costly, the anchored rounds use at most half the budget,
  // leaving the rest for separation alone; small layouts get every round.
  let anchoredRounds = RELAX_ITERATIONS;
  for (let round = 0; round < anchoredRounds && withinBudget(); round += 1) {
    separate();
    if (round === 0 && work > 0) {
      anchoredRounds = Math.max(
        1,
        Math.min(RELAX_ITERATIONS, Math.floor(RELAX_WORK_BUDGET / 2 / work)),
      );
    }
    const pull = RELAX_ANCHOR * (1 - round / anchoredRounds);
    for (const bubble of bubbles) {
      bubble.x += (bubble.originX - bubble.x) * pull;
      bubble.y += (bubble.originY - bubble.y) * pull;
    }
  }
  for (let pass = 0; pass < RELAX_MAX_FINAL_PASSES && withinBudget(); pass += 1) {
    if (separate() < 0.1) break;
  }
  return new Map(bubbles.map((bubble) => [bubble.id, { x: bubble.x, y: bubble.y }]));
}

// Hover and selection rebuild the bubble models; the layout only depends on
// positions and sizes, so keep the last relaxed layout.
let relaxCache: { key: string; positions: Map<number, TopicGraphPoint> } | null = null;

const relaxedPositionsFor = (items: RelaxItem[]): Map<number, TopicGraphPoint> => {
  const key = items
    .map((item) => `${String(item.id)}:${String(item.x)}:${String(item.y)}:${String(item.radius)}`)
    .join('|');
  if (relaxCache?.key !== key) relaxCache = { key, positions: relaxTopicPositions(items) };
  return relaxCache.positions;
};

/** How far outside the plane's corner the Ungrouped bubble's centre starts, in radii. */
const UNGROUPED_CORNER_GAP = 1.5;

/** Builds the shared graph/export presentation model for projected Topics with rows. */
export function buildTopicBubbleModels({
  topics,
  corpusSizes,
  panelNodeIds,
  nodeColors,
  defaultPalette,
  selectedTopicIds,
  lassoTopicIds,
  hoveredTopicId,
  shownTopicId = null,
  topicSearchQuery,
  colorScheme = null,
  plane = DEFAULT_TOPIC_GRAPH_PLANE,
}: BuildTopicBubbleModelsOptions): TopicBubbleModel[] {
  const corpusCount = corpusSizes.length;
  const visibleTopics = topics.filter((topic) => topic.total_size > 0);
  // Ungrouped has no place on the map: it sits in the bottom-left corner, a
  // little apart, and the layout keeps the Topics clear of it (issue 362).
  const projected = normalizeTopicPositions(
    visibleTopics.filter((topic) => !isUngrouped(topic.id)),
    plane,
  );
  const maxSize = Math.max(1, ...visibleTopics.map((topic) => topic.total_size));
  const radiusFor = (topic: TopicModelingTopic) => 10 + 40 * Math.sqrt(topic.total_size / maxSize);
  const positions = relaxedPositionsFor(
    visibleTopics.map((topic) => {
      const radius = radiusFor(topic);
      const point = isUngrouped(topic.id)
        ? { x: -radius * UNGROUPED_CORNER_GAP, y: plane.height + radius * UNGROUPED_CORNER_GAP }
        : (projected.get(topic.id) ?? { x: plane.width / 2, y: plane.height / 2 });
      return { id: topic.id, x: point.x, y: point.y, radius };
    }),
  );
  const fallbackPrimaryColor = defaultPalette[0] ?? '#2563eb';
  const fallbackSecondaryColor = defaultPalette[1] ?? '#dc2626';
  const colorA = resolveTopicCorpusColor(
    0,
    fallbackPrimaryColor,
    panelNodeIds,
    nodeColors,
    defaultPalette,
  );
  const colorB = resolveTopicCorpusColor(
    1,
    fallbackSecondaryColor,
    panelNodeIds,
    nodeColors,
    defaultPalette,
  );
  const hasSearchFilter = topicSearchQuery.trim().length > 0;
  const hasLassoFilter = lassoTopicIds.size > 0;

  // Larger bubbles first, so smaller ones are drawn on top (issue 189).
  const drawOrder = [...visibleTopics].sort(
    (left, right) => right.total_size - left.total_size || left.id - right.id,
  );
  return drawOrder.map((topic) => {
    const corpusSizeA = corpusSizes[0] ?? 0;
    const corpusSizeB = corpusSizes[1] ?? 0;
    const shareA = corpusSizeA > 0 ? (topic.size[0] ?? 0) / corpusSizeA : 0;
    const shareB = corpusSizeB > 0 ? (topic.size[1] ?? 0) / corpusSizeB : 0;
    const combinedShare = shareA + shareB;
    const proportion = corpusCount === 2 && combinedShare > 0 ? shareB / combinedShare : 0.5;
    return {
      id: topic.id,
      topic,
      position: positions.get(topic.id) ?? { x: plane.width / 2, y: plane.height / 2 },
      radius: radiusFor(topic),
      // Ungrouped stays Wordflow's not-analysed grey at a constant light fill.
      fill: isUngrouped(topic.id)
        ? GREY
        : corpusCount <= 1
          ? colorScheme
            ? topicColorSchemeFill(colorScheme, topic.id, colorA)
            : colorA
          : interpolateColor(colorA, colorB, proportion),
      fillOpacity: isUngrouped(topic.id)
        ? UNGROUPED_BUBBLE_OPACITY
        : corpusCount <= 1 && colorScheme
          ? topicColorSchemeOpacity(colorScheme, topic.id)
          : TOPIC_OPACITY_DEFAULT,
      selected: selectedTopicIds.has(topic.id),
      lassoed: lassoTopicIds.has(topic.id),
      hovered: hoveredTopicId === topic.id,
      shown: shownTopicId === topic.id,
      matchedWords: Object.fromEntries(
        matchedTopicWords(
          topic.representative_words.map((term) => term.word),
          topicSearchQuery,
          matchChecklistOption,
        ),
      ),
      // Faded exactly when the Topic list leaves it out: outside the lasso, or
      // not matching the search (Chao, 2026-10-08: the chart lit search
      // matches outside the lasso while the list showed only lassoed ones).
      filteredOut:
        (hasLassoFilter && !lassoTopicIds.has(topic.id)) ||
        (hasSearchFilter &&
          !matchTopicWords(
            topic.representative_words.map((term) => term.word),
            topicSearchQuery,
            matchChecklistOption,
            topicSearchTerms,
          )),
    };
  });
}

/** Returns whether a screen-space point lies inside a closed freehand polygon. */
function isPointInsidePolygon(point: TopicGraphPoint, polygon: TopicGraphPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Finds Topic centers inside a lasso after applying the current React Flow viewport. */
export function findTopicIdsInsideLasso(
  bubbles: TopicBubbleModel[],
  polygon: TopicGraphPoint[],
  viewport: TopicGraphViewport,
): Set<number> {
  return new Set(
    bubbles
      .filter((bubble) =>
        isPointInsidePolygon(
          {
            x: bubble.position.x * viewport.zoom + viewport.x,
            y: bubble.position.y * viewport.zoom + viewport.y,
          },
          polygon,
        ),
      )
      .map((bubble) => bubble.id),
  );
}
