import { describe, expect, it } from 'vitest';

import type { EmbeddingEndpoint } from '@/features/embedding-endpoints/embeddingEndpoints';
import { endpointsServing } from '@/features/embedding-endpoints/embeddingEndpoints';
import { remoteEmbeddingChoice } from '../remoteEmbedding';

const ENGLISH = 'sentence-transformers/all-MiniLM-L6-v2' as const;
const MULTILINGUAL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2' as const;

const endpoint = (id: string, overrides: Partial<EmbeddingEndpoint> = {}): EmbeddingEndpoint => ({
  id,
  name: id,
  base_url: `https://${id}.example/v1`,
  source: 'user',
  has_api_key: false,
  models: { [ENGLISH]: ENGLISH },
  default: false,
  ...overrides,
});

describe('remoteEmbeddingChoice (Remote GPU)', () => {
  it('embeds on this computer without an endpoint for the model', () => {
    expect(remoteEmbeddingChoice({ ticked: true, endpointId: 'a', serving: [] })).toEqual({
      ticked: false,
      endpointId: null,
      serving: [],
    });
  });

  it('starts unticked unless a server endpoint is the default', () => {
    expect(
      remoteEmbeddingChoice({ ticked: null, endpointId: null, serving: [endpoint('a')] }),
    ).toMatchObject({ ticked: false, endpointId: null });
    expect(
      remoteEmbeddingChoice({
        ticked: null,
        endpointId: null,
        serving: [endpoint('a'), endpoint('gpu', { source: 'server', default: true })],
      }),
    ).toMatchObject({ ticked: true, endpointId: 'gpu' });
  });

  it('keeps the chosen endpoint while it serves the model, else the first', () => {
    const serving = [endpoint('a'), endpoint('b')];
    expect(remoteEmbeddingChoice({ ticked: true, endpointId: 'b', serving })).toMatchObject({
      ticked: true,
      endpointId: 'b',
    });
    expect(remoteEmbeddingChoice({ ticked: true, endpointId: 'gone', serving })).toMatchObject({
      endpointId: 'a',
    });
    expect(remoteEmbeddingChoice({ ticked: false, endpointId: 'b', serving })).toMatchObject({
      ticked: false,
      endpointId: null,
    });
  });

  it('offers only endpoints that serve the selected model', () => {
    const endpoints = [
      endpoint('english'),
      endpoint('multilingual', { models: { [MULTILINGUAL]: 'multi' } }),
    ];
    expect(endpointsServing(endpoints, MULTILINGUAL).map((item) => item.id)).toEqual([
      'multilingual',
    ]);
    expect(endpointsServing(undefined, ENGLISH)).toEqual([]);
  });
});
