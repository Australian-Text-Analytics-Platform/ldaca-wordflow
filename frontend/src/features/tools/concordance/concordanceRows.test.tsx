import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HighlightedDocument } from './ConcordanceResults';
import { interleave, type Match } from './concordanceRows';
it('highlights Unicode character offsets rather than UTF-16 positions', () => {
  const hit = { start_idx: 2, end_idx: 3 } as Match;
  render(<HighlightedDocument text="😀 猫 test" matches={[hit]} />);
  expect(screen.getByText('猫').tagName).toBe('MARK');
});
it('interleaves source pages without losing a longer tail', () => {
  expect(
    interleave([
      [1, 3, 5],
      [2, 4],
    ]),
  ).toEqual([1, 2, 3, 4, 5]);
});
