import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConcordanceDispersionCell } from '../ConcordanceDispersionCell';

describe('ConcordanceDispersionCell', () => {
  const hits = [
    {
      CONC_start_idx: 0,
      CONC_end_idx: 5,
      CONC_matched_text: 'alpha',
      __source_node: 'Corpus',
    },
    {
      CONC_start_idx: 11,
      CONC_end_idx: 16,
      CONC_matched_text: 'beta',
      __source_node: 'Corpus',
    },
  ];

  it('uses the full available width by default', () => {
    const { unmount } = render(<ConcordanceDispersionCell hits={hits} textLength={16} />);

    expect(screen.getByTestId('concordance-dispersion-bar')).toHaveStyle({ width: '100%' });

    unmount();
  });

  it('supports proportional bar widths', () => {
    const { unmount } = render(
      <ConcordanceDispersionCell hits={hits} textLength={16} barWidthPercent={50} />,
    );

    expect(screen.getByTestId('concordance-dispersion-bar')).toHaveStyle({ width: '50%' });

    unmount();
  });

  it('uses matched-term colors independently of the source Data Block', () => {
    render(
      <ConcordanceDispersionCell
        hits={hits}
        textLength={16}
        termColors={{ alpha: '#123456', beta: '#abcdef' }}
      />,
    );

    const markers = screen.getAllByTestId('concordance-match-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveStyle({ backgroundColor: '#123456' });
    expect(markers[1]).toHaveStyle({ backgroundColor: '#abcdef' });
  });

  it('uses the stable match fallback when no term color is assigned', () => {
    render(<ConcordanceDispersionCell hits={hits} textLength={16} />);

    for (const marker of screen.getAllByTestId('concordance-match-marker')) {
      expect(marker).toHaveStyle({ backgroundColor: '#0284c7' });
    }
  });

  it('shades the selected bins behind the markers (issue 96)', () => {
    render(
      <ConcordanceDispersionCell
        hits={hits}
        textLength={16}
        selectedBins={new Set([6, 7, 8, 13])}
        binCount={20}
      />,
    );

    const ranges = screen.getAllByTestId('concordance-dispersion-selected-range');
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toHaveStyle({ left: '30%', width: '15%' });
    expect(ranges[1]).toHaveStyle({ left: '65%', width: '5%' });
  });
});
