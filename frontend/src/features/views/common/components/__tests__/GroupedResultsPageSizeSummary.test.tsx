import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GroupedResultsPageSizeSummary } from '../GroupedResultsPageSizeSummary';

describe('GroupedResultsPageSizeSummary', () => {
  it('formats grouped result counts for multiple documents', () => {
    render(
      <GroupedResultsPageSizeSummary groups={[[{ id: 'a1' }, { id: 'a2' }], [{ id: 'b1' }]]} />,
    );

    expect(screen.getByText('(Found 3 matches in 2 documents).')).toBeInTheDocument();
  });

  it('formats grouped result counts for a single document', () => {
    render(<GroupedResultsPageSizeSummary groups={[[{ id: 'a1' }]]} />);

    expect(screen.getByText('(Found 1 match in 1 document).')).toBeInTheDocument();
  });

  it('includes total processed count when provided', () => {
    render(
      <GroupedResultsPageSizeSummary
        groups={[[{ id: 'a1' }, { id: 'a2' }], [{ id: 'b1' }]]}
        totalProcessed={100}
      />,
    );

    expect(
      screen.getByText('(Found 3 matches in 2 documents after checking 100 documents).'),
    ).toBeInTheDocument();
  });

  it('says how many of all documents a Preview checked and points to Run (issue 347)', () => {
    render(
      <GroupedResultsPageSizeSummary groups={[]} totalProcessed={20} totalDocuments={26163} />,
    );

    expect(
      screen.getByText(
        `(Found 0 matches in 0 documents after checking 20 of ${(26163).toLocaleString()} documents). Run searches them all.`,
      ),
    ).toBeInTheDocument();
  });
});
