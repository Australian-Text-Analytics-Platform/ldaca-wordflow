import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WorkspaceNodeInfo } from '@/api';

import { useTopicModelingParameters } from '../useTopicModelingParameters';

const nodeIds = (...counts: number[]) => counts.map((_, index) => `node-${String(index + 1)}`);

const nodeInfoById = (...counts: number[]): Record<string, WorkspaceNodeInfo> =>
  Object.fromEntries(
    counts.map((count, index) => {
      const id = `node-${String(index + 1)}`;
      return [
        id,
        {
          id,
          name: `Node ${String(index + 1)}`,
          shape: [count, 3] as WorkspaceNodeInfo['shape'],
        },
      ];
    }),
  );

describe('useTopicModelingParameters', () => {
  it('derives default corpus sampling from selected node sizes', async () => {
    const { result } = renderHook(() =>
      useTopicModelingParameters({
        panelNodeIds: nodeIds(8000, 80),
        nodeInfoById: nodeInfoById(8000, 80),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.nodeDocCounts).toEqual([8000, 80]);
    expect(result.current.corpusSamples).toEqual([{ percent: '100' }, { percent: '100' }]);
    expect(result.current.effectiveDocCounts).toEqual([8000, 80]);
    expect(result.current.sampleFractionsForRequest).toEqual([null, null]);
    expect(result.current.hasAnySampling).toBe(false);
    expect(result.current.minClusterSize).toBe(10);
    expect(result.current.randomSeed).toBe(0);
  });

  it('tracks user-set parameters', async () => {
    const { result } = renderHook(() =>
      useTopicModelingParameters({
        panelNodeIds: nodeIds(8000),
        nodeInfoById: nodeInfoById(8000),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateCorpusSample(0, { percent: '25' });
      result.current.setRandomSeedFromUser(99);
    });

    expect(result.current.corpusSamplesUserSet).toBe(true);
    expect(result.current.randomSeedUserSet).toBe(true);
    expect(result.current.sampleFractionsForRequest).toEqual([0.25]);
  });

  it('hydrates saved request parameters and sampling fractions', () => {
    const { result } = renderHook(() =>
      useTopicModelingParameters({
        panelNodeIds: nodeIds(10000, 5000),
        nodeInfoById: nodeInfoById(10000, 5000),
      }),
    );

    act(() => {
      result.current.hydrateParameters({
        node_ids: ['node-1', 'node-2'],
        node_columns: { 'node-1': 'text', 'node-2': 'text' },
        min_cluster_size: 25,
        random_seed: 7,
        sample_fractions: [0.2, null],
      });
    });

    expect(result.current.minClusterSize).toBe(25);
    expect(result.current.randomSeed).toBe(7);
    expect(result.current.randomSeedUserSet).toBe(true);
    expect(result.current.corpusSamples).toEqual([{ percent: '20' }, { percent: '100' }]);
    expect(result.current.corpusSamplesUserSet).toBe(true);
  });

  it('restores hydrated sampling fractions after selected node counts resolve', async () => {
    const { result, rerender } = renderHook(
      ({ panelNodeIdsKey }: { panelNodeIdsKey: string }) =>
        useTopicModelingParameters({
          panelNodeIds: panelNodeIdsKey ? panelNodeIdsKey.split('|') : [],
          nodeInfoById: panelNodeIdsKey === 'node-1' ? nodeInfoById(10000) : {},
        }),
      {
        initialProps: { panelNodeIdsKey: '' },
      },
    );

    act(() => {
      result.current.hydrateParameters({
        node_ids: ['node-1'],
        node_columns: { 'node-1': 'text' },
        random_seed: 7,
        sample_fractions: [0.2],
      });
    });

    rerender({ panelNodeIdsKey: 'node-1' });

    await waitFor(() => {
      expect(result.current.corpusSamples).toEqual([{ percent: '20' }]);
      expect(result.current.sampleFractionsForRequest).toEqual([0.2]);
    });
  });

  describe('embedding model (issue 413)', () => {
    const withTokenizer = (tokenizer: string | null): Record<string, WorkspaceNodeInfo> => ({
      'node-1': {
        ...(nodeInfoById(500)['node-1'] as WorkspaceNodeInfo),
        name: 'People’s Daily',
        tokenizer_model: tokenizer,
      },
    });

    it('defaults to English, with the cap as set', () => {
      const { result } = renderHook(() =>
        useTopicModelingParameters({
          panelNodeIds: nodeIds(500),
          nodeInfoById: withTokenizer('native:plain_words_en'),
        }),
      );

      expect(result.current.embeddingModel).toBe('sentence-transformers/all-MiniLM-L6-v2');
      expect(result.current.embeddingModelReason).toBeNull();
      expect(result.current.cjkTokenizer).toBeNull();
      expect(result.current.maxSegmentTokens).toBe(256);
    });

    it('picks Multilingual and a 128 cap for a CJK tokeniser; English restores the cap', () => {
      const { result } = renderHook(() =>
        useTopicModelingParameters({
          panelNodeIds: nodeIds(500),
          nodeInfoById: withTokenizer('lindera:jieba'),
        }),
      );

      expect(result.current.embeddingModel).toBe(
        'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
      );
      expect(result.current.embeddingModelReason).toEqual({
        name: 'People’s Daily',
        tokenizer: 'Jieba',
      });
      expect(result.current.maxSegmentTokens).toBe(128);

      act(() => {
        result.current.setEmbeddingModel('sentence-transformers/all-MiniLM-L6-v2');
      });

      expect(result.current.embeddingModel).toBe('sentence-transformers/all-MiniLM-L6-v2');
      expect(result.current.embeddingModelReason).toBeNull();
      expect(result.current.cjkTokenizer).toEqual({ name: 'People’s Daily', tokenizer: 'Jieba' });
      expect(result.current.maxSegmentTokens).toBe(256);
    });

    it('restores the model a saved run used, English when it names none', () => {
      const { result } = renderHook(() =>
        useTopicModelingParameters({
          panelNodeIds: nodeIds(500),
          nodeInfoById: withTokenizer('lindera:ko-dic'),
        }),
      );
      const saved = {
        kind: 'topic_modeling' as const,
        node_ids: ['node-1'],
        node_columns: { 'node-1': 'text' },
        max_segment_tokens: 200,
      };

      act(() => {
        result.current.hydrateParameters(saved);
      });
      expect(result.current.embeddingModel).toBe('sentence-transformers/all-MiniLM-L6-v2');
      expect(result.current.maxSegmentTokens).toBe(200);

      act(() => {
        result.current.hydrateParameters({
          ...saved,
          max_segment_tokens: 96,
          embedding_model: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
        });
      });
      expect(result.current.embeddingModel).toBe(
        'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
      );
      expect(result.current.embeddingModelReason).toBeNull();
      expect(result.current.maxSegmentTokens).toBe(96);
    });
  });
});
