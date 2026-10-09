import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicClustering, TopicModelingResponse } from '@/api';
import { useNudgeStore } from '@/features/nudges/nudgeStore';
import { ConcordancePreviewNudge } from '@/features/views/concordance/components/ConcordancePreviewNudge';
import {
  TopicLargeInputNudge,
  TopicResultNudge,
  TopicSlowStartNudge,
} from '../TopicModelingNudges';

beforeEach(() => {
  useNudgeStore.setState({ enabled: true });
  Element.prototype.scrollIntoView = vi.fn();
});

const clustering = (count: number, merged = count): TopicClustering => ({
  adjustable: true,
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
        clustering={clustering(6)}
        analysisId="a"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('One topic holds most segments');
  });

  it('suggests a lower Min topic size for a few topics, not after merging', () => {
    const view = render(
      <TopicResultNudge result={result([30, 30, 40])} clustering={clustering(3)} analysisId="a" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Only a few topics');
    view.rerender(
      <TopicResultNudge
        result={result([30, 30, 40])}
        clustering={clustering(12, 3)}
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
