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
  const positions = normalizeTopicPositions(visibleTopics);
  const maxSize = Math.max(1, ...visibleTopics.map((topic) => topic.total_size));
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

  return visibleTopics.map((topic) => {
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
      radius: 10 + 40 * Math.sqrt(topic.total_size / maxSize),
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
