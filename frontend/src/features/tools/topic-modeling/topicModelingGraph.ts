import type { TopicModelingTopic } from './topicPresentation';
import { topicEligibility, type TopicEligibility } from './topicSearch';
import { GREY, VIZ_PALETTE, interpolateVizColor } from '../common/vizPalette';

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
  fillOpacity: number;
  selected: boolean;
  lassoed: boolean;
  hovered: boolean;
  filteredOut: boolean;
  highlightedWords: Set<string>;
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
  eligibility?: TopicEligibility;
}

export interface TopicColorScheme {
  groups: { color: string; count: number }[];
  topicCounts: number[][];
}

/** Group-size adjusted top-two blending and Pielou concentration opacity. */
export function topicGroupStyle(scheme: TopicColorScheme, topic: number, fallback: string) {
  const weights = scheme.groups.map((group, index) => ({
    color: group.color,
    weight: group.count > 0 ? (scheme.topicCounts[topic]?.[index] ?? 0) / group.count : 0,
  }));
  const ranked = weights
    .filter((group) => group.weight > 0)
    .toSorted((a, b) => b.weight - a.weight);
  const [first, second] = ranked;
  const fill = first
    ? second
      ? interpolateVizColor(
          first.color,
          second.color,
          second.weight / (first.weight + second.weight),
        )
      : first.color
    : fallback;
  const total = weights.reduce((sum, group) => sum + group.weight, 0);
  if (total === 0) return { fill, fillOpacity: 0.6 };
  const entropy = weights.reduce((sum, group) => {
    const share = group.weight / total;
    return share > 0 ? sum - share * Math.log(share) : sum;
  }, 0);
  const concentration =
    weights.length < 2 ? 1 : Math.min(1, Math.max(0, 1 - entropy / Math.log(weights.length)));
  return { fill, fillOpacity: 0.25 + 0.55 * Math.sqrt(concentration) };
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

  const scale = Math.min(TOPIC_GRAPH_WIDTH / (xSpan || 1), TOPIC_GRAPH_HEIGHT / (ySpan || 1));
  return new Map(
    topics.map((topic) => [
      topic.id,
      {
        x: TOPIC_GRAPH_WIDTH / 2 + (topic.x - (xMin + xMax) / 2) * scale,
        y: TOPIC_GRAPH_HEIGHT / 2 + (topic.y - (yMin + yMax) / 2) * scale,
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
  colorScheme,
  eligibility,
}: BuildTopicBubbleModelsOptions): TopicBubbleModel[] {
  const corpusCount = corpusSizes.length;
  const visibleTopics = topics.filter((topic) => topic.total_size > 0);
  const positions = normalizeTopicPositions(topics);
  const maxSize = Math.max(1, ...visibleTopics.map((topic) => topic.total_size));
  const fallbackPrimaryColor = defaultPalette[0] ?? VIZ_PALETTE[0] ?? GREY;
  const fallbackSecondaryColor = defaultPalette[1] ?? VIZ_PALETTE[1] ?? GREY;
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
  const projection = eligibility ?? topicEligibility(topics, topicSearchQuery, lassoTopicIds);

  return visibleTopics
    .toSorted((a, b) => b.total_size - a.total_size || a.id - b.id)
    .map((topic) => {
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
        radius: 50 * Math.sqrt(topic.total_size / maxSize),
        ...(corpusCount <= 1 && colorScheme
          ? topicGroupStyle(colorScheme, topic.id, colorA)
          : {
              fill: corpusCount <= 1 ? colorA : interpolateVizColor(colorA, colorB, proportion),
              fillOpacity: 0.6,
            }),
        selected: selectedTopicIds.has(topic.id),
        lassoed: lassoTopicIds.has(topic.id),
        hovered: hoveredTopicId === topic.id,
        filteredOut: !projection.eligible.has(topic.id),
        highlightedWords: projection.highlights.get(topic.id) ?? new Set<string>(),
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

/** Place readable IDs in screen space without moving bubbles or changing their area. */
export function topicLabelOffsets(bubbles: TopicBubbleModel[], zoom: number): Map<number, number> {
  const placed: { x: number; y: number; width: number }[] = [];
  const offsets = new Map<number, number>();
  const ordered = bubbles.toSorted(
    (a, b) =>
      Number(b.hovered) - Number(a.hovered) ||
      Number(b.selected) - Number(a.selected) ||
      b.radius - a.radius ||
      a.id - b.id,
  );
  for (const bubble of ordered) {
    const priority = bubble.hovered || bubble.selected;
    const x = bubble.position.x * zoom;
    const width = `T${String(bubble.id)}`.length * 7 + 6;
    for (let attempt = 0; attempt < (priority ? bubbles.length * 2 + 1 : 1); attempt++) {
      const offset = attempt === 0 ? 0 : Math.ceil(attempt / 2) * 18 * (attempt % 2 ? -1 : 1);
      const y = bubble.position.y * zoom + offset;
      if (
        placed.some(
          (label) =>
            Math.abs(label.x - x) < (label.width + width) / 2 && Math.abs(label.y - y) < 16,
        )
      )
        continue;
      placed.push({ x, y, width });
      offsets.set(bubble.id, offset / zoom);
      break;
    }
  }
  return offsets;
}
