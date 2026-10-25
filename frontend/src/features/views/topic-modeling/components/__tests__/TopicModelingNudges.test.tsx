import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicClustering, TopicModelingResponse } from '@/api';
import { GuidanceContext } from '@/features/guidance/GuidanceContext';
import { shouldSuggestRemoteGpu } from '@/features/nudges/nudges';
import { useNudgeStore } from '@/features/nudges/nudgeStore';
import { ConcordancePreviewNudge } from '@/features/views/concordance/components/ConcordancePreviewNudge';
import {
  TopicLargeInputNudge,
  TopicRemoteGpuNudge,
  TopicResultNudge,
  TopicSlowStartNudge,
} from '../TopicModelingNudges';

beforeEach(() => {
  useNudgeStore.setState({ enabled: true });
  Element.prototype.scrollIntoView = vi.fn();
});

const clustering = (count: number, merged = count, largest = 0): TopicClustering => ({
  adjustable: true,
  largest_topic_size: largest,
  cluster_count: merged,
  default_cluster_count: count,
  min_cluster_count: 1,
  max_cluster_count: count,
});

const result = (sizes: number[]) =>
  ({
    data: {
      topics: sizes.map((total_size, id) => ({ id, total_size })),
      segment_count: sizes.reduce((sum, size) => sum + size, 0),
    },
  }) as unknown as TopicModelingResponse;

describe('Topic Modelling suggestions (issue 360)', () => {
  it('suggests a lower Max topic size for one giant topic', () => {
    render(
      <TopicResultNudge
        result={result([80, 5, 5, 5, 5, 5])}
        clustering={clustering(6, 6, 80)}
        analysisId="a"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('One topic holds most passages');
  });

  it('judges a giant topic by segments, not by the documents a topic counts', () => {
    // total_size counts documents: one topic in most documents is normal.
    render(
      <TopicResultNudge
        result={result([90, 5, 5, 5, 5, 5])}
        clustering={clustering(6, 6, 20)}
        analysisId="a"
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suggests a lower Min topic size for a few topics, not after merging', () => {
    const view = render(
      <TopicResultNudge
        result={result([30, 30, 40])}
        clustering={clustering(3, 3, 40)}
        analysisId="a"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Only a few topics');
    view.rerender(
      <TopicResultNudge
        result={result([30, 30, 40])}
        clustering={clustering(12, 3, 40)}
        analysisId="a"
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suggests a smaller Min topic size when many documents are Ungrouped (issue 362)', () => {
    const withUngrouped = (ungrouped: number) =>
      ({
        data: {
          topics: [10, 10, 10, 10, 10, 10].map((total_size, id) => ({ id, total_size })),
          segment_count: 600,
          corpus_sizes: [100],
          ungrouped_documents: [ungrouped],
        },
      }) as unknown as TopicModelingResponse;
    const view = render(
      <TopicResultNudge
        result={withUngrouped(37)}
        clustering={clustering(6, 6, 20)}
        analysisId="a"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Many (37%) documents are Ungrouped');
    view.rerender(
      <TopicResultNudge
        result={withUngrouped(20)}
        clustering={clustering(6, 6, 20)}
        analysisId="a"
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suggests faster settings when the first steps pass five minutes', () => {
    const detail = { step: 2, steps: 5, step_label: 'Reading the text into the model' };
    const longAgo = new Date(Date.now() - 6 * 60_000).toISOString();
    const view = render(<TopicSlowStartNudge taskId="t" startedAt={longAgo} detail={detail} />);
    expect(screen.getByRole('status')).toHaveTextContent('This run is taking a while');

    view.rerender(
      <TopicSlowStartNudge taskId="t" startedAt={new Date().toISOString()} detail={detail} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.rerender(
      <TopicSlowStartNudge taskId="t" startedAt={longAgo} detail={{ ...detail, step: 4 }} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suggests a sample before a run on a large input', () => {
    render(
      <TopicLargeInputNudge
        documents={26_163}
        segments={109_800}
        topicSampling={false}
        occurrence="n"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('A large input');
    // The notes give the numbers; the card keeps to its advice.
    expect(screen.getByRole('status')).not.toHaveTextContent('26,163');
  });
});

describe('Concordance Preview suggestion (issue 360)', () => {
  it('appears only when a partial Preview found nothing', () => {
    const view = render(
      <ConcordancePreviewNudge
        groups={[]}
        pagination={{ page_size: 50, total_source_rows: 1000 }}
        occurrence="q"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No matches yet');

    view.rerender(
      <ConcordancePreviewNudge
        groups={[]}
        pagination={{ page_size: 50, total_source_rows: 40 }}
        occurrence="q"
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.rerender(
      <ConcordancePreviewNudge
        groups={[[{}]]}
        pagination={{ page_size: 50, total_source_rows: 1000 }}
        occurrence="q"
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('the Remote GPU suggestion', () => {
  const run = {
    state: 'succeeded',
    startedAt: '2026-10-22T01:00:00Z',
    finishedAt: '2026-10-22T01:12:00Z',
    usedEndpoint: false,
    canAdd: true,
    anyEndpoints: false,
    localEmbedding: 'cpu' as const,
  };

  it('appears only after a slow run on the processor, where a server can be added', () => {
    expect(shouldSuggestRemoteGpu(run)).toBe(true);
    // Quick runs, Mac GPUs, remote runs, a shared server, or a server already set up: no.
    expect(shouldSuggestRemoteGpu({ ...run, finishedAt: '2026-10-22T01:02:00Z' })).toBe(false);
    expect(shouldSuggestRemoteGpu({ ...run, localEmbedding: 'gpu' })).toBe(false);
    expect(shouldSuggestRemoteGpu({ ...run, usedEndpoint: true })).toBe(false);
    expect(shouldSuggestRemoteGpu({ ...run, canAdd: false })).toBe(false);
    expect(shouldSuggestRemoteGpu({ ...run, anyEndpoints: true })).toBe(false);
    expect(shouldSuggestRemoteGpu({ ...run, state: 'failed' })).toBe(false);
    expect(shouldSuggestRemoteGpu({ ...run, localEmbedding: undefined })).toBe(false);
  });

  it('says most people have no such server and walks to Settings on request', async () => {
    const startSettingsWalk = vi.fn();
    render(
      <GuidanceContext.Provider
        value={{
          dispatchContextualHintVisit: vi.fn(),
          startGuidedTour: vi.fn(),
          startSettingsWalk,
        }}
      >
        <TopicRemoteGpuNudge show analysisId="run-1" />
      </GuidanceContext.Provider>,
    );

    const card = screen.getByRole('status');
    expect(card).toHaveTextContent('Reading the text took a while');
    expect(card).toHaveTextContent('Most people don’t have one');
    fireEvent.click(screen.getByRole('button', { name: 'Show me in Settings' }));
    await vi.waitFor(() => {
      expect(startSettingsWalk).toHaveBeenCalledWith('remote-gpu');
    });
  });

  it('shows nothing when not asked to', () => {
    render(<TopicRemoteGpuNudge show={false} analysisId="run-1" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
