import { describe, expect, it } from 'vitest';

import {
  createTopicModelingParameterState,
  sanitizeMaxClusterSize,
  topicModelingParameterReducer,
} from '../topicModelingParameterState';

describe('topicModelingParameterReducer', () => {
  it('marks corpus sampling as user-set when a row changes', () => {
    const updated = topicModelingParameterReducer(createTopicModelingParameterState(), {
      type: 'updateCorpusSample',
      nodeId: 'node-1',
      update: { percent: '25' },
    });

    expect(updated.corpusSamplesByNodeId).toEqual({ 'node-1': { percent: '25' } });
    expect(updated.userSetSampleNodeIds).toEqual({ 'node-1': true });
  });

  it('hydrates saved request parameters and sample fractions together', () => {
    const state = topicModelingParameterReducer(createTopicModelingParameterState(), {
      type: 'hydrateRequest',
      request: {
        node_ids: ['node-1', 'node-2'],
        node_columns: { 'node-1': 'text', 'node-2': 'text' },
        min_cluster_size: 25,
        random_seed: 7,
        segmentation_method: 'line',
        max_segment_tokens: 64,
        sample_fractions: [0.2, null],
      },
    });

    expect(state).toMatchObject({
      minClusterSize: 25,
      randomSeed: 7,
      randomSeedUserSet: true,
      segmentationMethod: 'line',
      maxSegmentTokens: 64,
      corpusSamplesByNodeId: {
        'node-1': { percent: '20' },
        'node-2': { percent: '100' },
      },
      userSetSampleNodeIds: { 'node-1': true, 'node-2': true },
    });
  });

  it('keeps topic sampling off by default and restores a saved sample size', () => {
    const initial = createTopicModelingParameterState();
    expect(initial).toMatchObject({ clusterSample: false, clusterSampleSize: null });

    const ticked = topicModelingParameterReducer(initial, {
      type: 'setClusterSample',
      value: true,
    });
    expect(
      topicModelingParameterReducer(ticked, { type: 'setClusterSampleSize', value: 50_000 }),
    ).toMatchObject({ clusterSample: true, clusterSampleSize: 50_000 });

    const hydrate = (cluster_sample_size?: number | null) =>
      topicModelingParameterReducer(initial, {
        type: 'hydrateRequest',
        request: {
          node_ids: ['node-1'],
          node_columns: { 'node-1': 'text' },
          ...(cluster_sample_size === undefined ? {} : { cluster_sample_size }),
        },
      });
    expect(hydrate(80_000)).toMatchObject({ clusterSample: true, clusterSampleSize: 80_000 });
    // Runs without sampling, including those saved before it existed.
    expect(hydrate(null)).toMatchObject({ clusterSample: false, clusterSampleSize: null });
    expect(hydrate()).toMatchObject({ clusterSample: false, clusterSampleSize: null });
  });

  it('defaults Max topic size to Auto and restores it from a saved request', () => {
    const initial = createTopicModelingParameterState();
    expect(initial.maxClusterSize).toBeNull();

    const fixed = topicModelingParameterReducer(initial, { type: 'setMaxClusterSize', value: 300 });
    expect(fixed.maxClusterSize).toBe(300);

    const hydrated = topicModelingParameterReducer(fixed, {
      type: 'hydrateRequest',
      request: {
        kind: 'topic_modeling',
        node_ids: ['node-1'],
        node_columns: { 'node-1': 'text' },
        max_cluster_size: null,
      },
    });
    expect(hydrated.maxClusterSize).toBeNull();
  });

  it('sanitizes Max topic size, treating empty or invalid input as Auto', () => {
    expect(sanitizeMaxClusterSize('')).toBeNull();
    expect(sanitizeMaxClusterSize(undefined)).toBeNull();
    expect(sanitizeMaxClusterSize('abc')).toBeNull();
    expect(sanitizeMaxClusterSize('300.4')).toBe(300);
    expect(sanitizeMaxClusterSize(1)).toBe(3);
  });
});
