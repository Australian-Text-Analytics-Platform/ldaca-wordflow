import { describe, expect, it } from 'vitest';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import {
  buildTopicBubbleModels,
  findTopicIdsInsideLasso,
  normalizeTopicPositions,
} from './topicModelingGraph';
import type { TopicModelingTopic } from './topicPresentation';
import { topicDownload } from './topicExport';
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
  it('keeps sampling out of requests and restores independent valid settings', () => {
    const saved = {
      inputs: [{ source: { schema: 'data', name: 'source' }, column: 'text' }],
      tokenizer: 'future:preserved',
      embedding_model: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
      max_segment_tokens: 256,
      minimum_topic_size: 2,
      sampling: { count: 100 },
      seed: 42,
    };
    const { request, issues } = decodeAnalysisRequest('topic-modeling', saved);
    expect(request.tokenizer).toBe(saved.tokenizer);
    expect(request.max_segment_tokens).toBe(128);
    expect(request.seed).toBe(42);
    expect(issues.map((i) => i.path)).toEqual(['sampling', 'max_segment_tokens']);
    expect(matchesAnalysisRequest('topic-modeling', request, saved)).toBe(false);
    expect(matchesAnalysisRequest('topic-modeling', request, request)).toBe(true);
    expect(saved.max_segment_tokens).toBe(256);
    expect(
      decodeAnalysisRequest('topic-modeling', { embedding_model: saved.embedding_model }).issues,
    ).toEqual([]);
  });
  it('uses one scale for both axes and preserves coordinates when a topic has zero memberships', () => {
    const topics = [topic(0, 0, 0, [1, 0]), topic(1, 10, 5, [4, 0]), topic(2, 20, 10, [0, 0])];
    const positions = normalizeTopicPositions(topics);
    expect(
      (positions.get(1)!.x - positions.get(0)!.x) / (positions.get(1)!.y - positions.get(0)!.y),
    ).toBe(2);
    const bubbles = buildTopicBubbleModels({ ...options, topics });
    expect(bubbles).toHaveLength(2);
    expect(bubbles[1]!.radius ** 2 / bubbles[0]!.radius ** 2).toBe(4);
    expect(bubbles[1]!.position).toEqual(positions.get(1));
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
