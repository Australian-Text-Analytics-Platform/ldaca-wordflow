import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { TopicResultSummary } from '../TopicResultSummary';

const base = {
  corpusSizes: [26_163],
  segmentCount: 107_551,
  ungroupedDocuments: [9_650],
  clusterCount: 782,
  defaultClusterCount: 782,
  clusteredSegments: null,
  sampleFractions: null,
  nodeNames: ['Obesity'],
};

describe('TopicResultSummary (issue 362)', () => {
  it('gives documents, segments, topics and the in-topic and Ungrouped split', () => {
    render(<TopicResultSummary {...base} />);
    expect(screen.getByTestId('topic-result-summary')).toHaveTextContent(
      '26,163 documents · 107,551 segments · 782 topics · 16,513 (63%) in a topic · 9,650 (37%) Ungrouped',
    );
  });

  it('notes a sample, merged topics and Topic sampling', () => {
    render(
      <TopicResultSummary
        {...base}
        sampleFractions={[0.1]}
        clusterCount={60}
        clusteredSegments={20_000}
      />,
    );
    expect(screen.getByTestId('topic-result-summary')).toHaveTextContent(
      '26,163 documents (10% sample) · 107,551 segments · 60 topics (merged from 782) · topics found from 20,000 sampled segments',
    );
  });

  it('asks for a new run when the result has no Ungrouped count', () => {
    render(
      <TooltipProvider>
        <TopicResultSummary {...base} ungroupedDocuments={null} />
      </TooltipProvider>,
    );
    expect(screen.getByTestId('topic-result-summary')).toHaveTextContent(
      '782 topics · Run again to see Ungrouped documents',
    );
  });
});
