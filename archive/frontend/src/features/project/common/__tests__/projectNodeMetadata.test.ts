import { describe, expect, it } from 'vitest';
import type { ProjectGraphNode } from '@/api';
import { projectProjectNodeMetadata } from '../projectNodeMetadata';

describe('projectProjectNodeMetadata', () => {
  it('projects every selector preference from the complete graph resource', () => {
    const graphNode: ProjectGraphNode = {
      id: 'node-1',
      name: 'Renamed graph node',
      color: '#2563eb',
      document: 'document',
      shape: [12, 2],
      tokenizer_model: 'native:plain_words_en',
    };

    expect(projectProjectNodeMetadata(graphNode)).toEqual({
      id: 'node-1',
      name: 'Renamed graph node',
      color: '#2563eb',
      document: 'document',
      shape: [12, 2],
      tokenizerModel: 'native:plain_words_en',
    });
  });

  it('projects a graph-only node without legacy nested aliases', () => {
    expect(
      projectProjectNodeMetadata({
        id: 'node-2',
        name: 'Graph only',
      }),
    ).toEqual({
      id: 'node-2',
      name: 'Graph only',
      color: null,
      document: null,
      shape: undefined,
      tokenizerModel: null,
    });
  });
});
