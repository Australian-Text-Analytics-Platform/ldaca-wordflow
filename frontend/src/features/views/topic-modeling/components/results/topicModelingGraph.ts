import type { TopicColorGroups, TopicModelingTopic } from '@/api';
import { matchChecklistOption } from '@/features/views/common/checklistSearch';
import { GREY, RANDOMIZABLE_FG } from '@/features/views/common/vizPalette';
import { interpolateColor } from '../../topicModelingAdapters';

export const TOPIC_GRAPH_WIDTH = 1000;
export const TOPIC_GRAPH_HEIGHT = 550;

export interface TopicGraphPoint {
  x: number;
  y: number;
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
  filteredOut: boolean;
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
  topicSearchQuery: string;
  colorScheme?: TopicColorScheme | null;
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

/** Maps backend topic coordinates into the renderer's stable virtual plane. */
export function normalizeTopicPositions(
  topics: TopicModelingTopic[],
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
        x: xSpan === 0 ? TOPIC_GRAPH_WIDTH / 2 : ((topic.x - xMin) / xSpan) * TOPIC_GRAPH_WIDTH,
        y: ySpan === 0 ? TOPIC_GRAPH_HEIGHT / 2 : ((topic.y - yMin) / ySpan) * TOPIC_GRAPH_HEIGHT,
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
 * Each round, bubbles drift this share of the way back to their projected
 * spot; the pull fades to zero over the rounds so separation can finish.
 */
const RELAX_ANCHOR = 0.04;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface RelaxItem {
  id: number;
  x: number;
  y: number;
  radius: number;
}

/**
 * Nudges bubbles apart so none is hidden behind another (issue 189). Partial
 * overlap is allowed, since nearby topics are similar, but for every pair the
 * smaller bubble's centre, where its label is, stays outside the larger one:
 * distance ≥ max(r_large + 0.35 r_small, 26 px). The smaller bubble moves more,
 * a weak pull keeps bubbles near their projected positions, and the result is
 * deterministic. Called by: buildTopicBubbleModels.
 */
export function relaxTopicPositions(items: readonly RelaxItem[]): Map<number, TopicGraphPoint> {
  const bubbles = items.map((item) => ({ ...item, originX: item.x, originY: item.y }));
  /** One pass over every pair; returns the largest remaining shortfall. */
  const separate = (): number => {
    let worst = 0;
    bubbles.forEach((a, i) => {
      for (const b of bubbles.slice(i + 1)) {
        const large = Math.max(a.radius, b.radius);
        const small = Math.min(a.radius, b.radius);
        const required = Math.max(large + OVERLAP_CENTRE_MARGIN * small, MIN_LABEL_DISTANCE);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= required) continue;
        worst = Math.max(worst, required - distance);
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
      }
    });
    return worst;
  };
  for (let round = 0; round < RELAX_ITERATIONS; round += 1) {
    separate();
    const pull = RELAX_ANCHOR * (1 - round / RELAX_ITERATIONS);
    for (const bubble of bubbles) {
      bubble.x += (bubble.originX - bubble.x) * pull;
      bubble.y += (bubble.originY - bubble.y) * pull;
    }
  }
  for (let pass = 0; pass < RELAX_MAX_FINAL_PASSES; pass += 1) {
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
  topicSearchQuery,
  colorScheme = null,
}: BuildTopicBubbleModelsOptions): TopicBubbleModel[] {
  const corpusCount = corpusSizes.length;
  const visibleTopics = topics.filter((topic) => topic.total_size > 0);
  const projected = normalizeTopicPositions(visibleTopics);
  const maxSize = Math.max(1, ...visibleTopics.map((topic) => topic.total_size));
  const radiusFor = (topic: TopicModelingTopic) => 10 + 40 * Math.sqrt(topic.total_size / maxSize);
  const positions = relaxedPositionsFor(
    visibleTopics.map((topic) => {
      const point = projected.get(topic.id) ?? {
        x: TOPIC_GRAPH_WIDTH / 2,
        y: TOPIC_GRAPH_HEIGHT / 2,
      };
      return { id: topic.id, x: point.x, y: point.y, radius: radiusFor(topic) };
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
      position: positions.get(topic.id) ?? {
        x: TOPIC_GRAPH_WIDTH / 2,
        y: TOPIC_GRAPH_HEIGHT / 2,
      },
      radius: radiusFor(topic),
      fill:
        corpusCount <= 1
          ? colorScheme
            ? topicColorSchemeFill(colorScheme, topic.id, colorA)
            : colorA
          : interpolateColor(colorA, colorB, proportion),
      fillOpacity:
        corpusCount <= 1 && colorScheme
          ? topicColorSchemeOpacity(colorScheme, topic.id)
          : TOPIC_OPACITY_DEFAULT,
      selected: selectedTopicIds.has(topic.id),
      lassoed: lassoTopicIds.has(topic.id),
      hovered: hoveredTopicId === topic.id,
      filteredOut:
        hasSearchFilter &&
        !matchChecklistOption(
          topic.representative_words.map((term) => term.word).join(', '),
          topicSearchQuery,
        ),
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
