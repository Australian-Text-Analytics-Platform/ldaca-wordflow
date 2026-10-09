import { describe, expect, it } from 'vite-plus/test';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { topicDownload } from './topicExport';
import {
  buildTopicBubbleModels,
  findTopicIdsInsideLasso,
  normalizeTopicPositions,
} from './topicModelingGraph';
import type { TopicModelingTopic } from './topicPresentation';
const topic = (id: number, x: number, y: number, size: number[]): TopicModelingTopic => ({
  id,
  x,
  y,
  size,
  total_size: size.reduce((a, b) => a + b, 0),
  representative_words: [{ word: `term ${String(id)}`, occurrence_count: 1 }],
});
const options = {
  corpusSizes: [100, 10],
  panelNodeIds: ['a', 'b'],
  nodeColors: { a: '#000000', b: '#ffffff' },
  defaultPalette: [],
  selectedTopicIds: new Set<number>(),
  lassoTopicIds: new Set<number>(),
  hoveredTopicId: null,
  topicSearchQuery: '',
};
describe('Topic Modelling presentation contracts', () => {
  it('keeps sampling out of submitted requests and leaves unknown provenance unsupported', () => {
    const saved = { inputs: [], sampling: { count: 100 }, seed: 42 };
    const status = { status: 'unsupported' as const, reason: 'Unknown field sampling' };
    const restored = decodeAnalysisRequest('topic-modeling', status, saved);
    expect(restored.request).not.toHaveProperty('sampling');
    expect(restored.issues[0]?.value).toBe(saved);
    expect(matchesAnalysisRequest('topic-modeling', restored.request, status)).toBe(false);
  });
  it('uses one scale for both axes and preserves coordinates when a topic has zero memberships', () => {
    const topics = [topic(0, 0, 0, [1, 0]), topic(1, 10, 5, [4, 0]), topic(2, 20, 10, [0, 0])];
    const positions = normalizeTopicPositions(topics);
    expect(
      (positions.get(1)!.x - positions.get(0)!.x) / (positions.get(1)!.y - positions.get(0)!.y),
    ).toBe(2);
    const bubbles = buildTopicBubbleModels({ ...options, topics });
    expect(bubbles).toHaveLength(2);
    expect(bubbles.map((bubble) => bubble.id)).toEqual([1, 0]);
    expect(bubbles[0]!.radius ** 2 / bubbles[1]!.radius ** 2).toBe(4);
    expect(bubbles[0]!.position).toEqual(positions.get(1));
    topics[0]!.total_size = 0;
    expect(buildTopicBubbleModels({ ...options, topics })[0]!.position).toEqual(positions.get(1));
  });
  it('blends corpus-relative shares and transforms lasso coordinates under zoom', () => {
    const bubbles = buildTopicBubbleModels({ ...options, topics: [topic(0, 0, 0, [10, 1])] });
    expect(bubbles[0]!.fill).toBe('rgb(128, 128, 128)');
    const { x, y } = bubbles[0]!.position;
    const polygon = [
      { x: x * 2 - 11, y: y * 2 + 19 },
      { x: x * 2 - 9, y: y * 2 + 19 },
      { x: x * 2 - 9, y: y * 2 + 21 },
      { x: x * 2 - 11, y: y * 2 + 21 },
    ];
    expect([...findTopicIdsInsideLasso(bubbles, polygon, { zoom: 2, x: -10, y: 20 })]).toEqual([0]);
    expect(findTopicIdsInsideLasso(bubbles, polygon, { zoom: 1, x: 0, y: 0 }).size).toBe(0);
  });
  it('exports all topics with selection-first ordering, full candidates and escaped labels', () => {
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('width', '800');
    chart.setAttribute('height', '440');
    const topics = [topic(0, 0, 0, [4]), topic(1, 1, 1, [0])];
    topics[1]!.representative_words = Array.from({ length: 100 }, (_, i) => ({
      word: `word${String(i)}`,
      occurrence_count: 1,
    }));
    const output = topicDownload(chart, {
      scope: 'Sampled Preview',
      sources: ['<source>'],
      model: 'model',
      count: 2,
      topN: 1,
      seed: 0,
      wordLimit: 3,
      search: '',
      lasso: [0],
      documentCounts: [20],
      topics,
      selected: new Set([1]),
      colors: ['#000000'],
    });
    expect(output.csv.split('\r\n')[1]).toContain('"1","true"');
    expect(output.csv).toContain('word99');
    expect(output.svg.outerHTML).toContain('&lt;source&gt;');
    expect(output.svg.textContent).toContain('20 documents');
    expect(output.svg.querySelector('source')).toBeNull();
  });
});
