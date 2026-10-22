/* eslint-disable testing-library/no-node-access -- checks the marks the renderer produces. */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderConcordanceDetailText, type ConcordanceDetailHit } from '../concordanceDetailText';

const parts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-concordance-part]')).map((element) => [
    element.getAttribute('data-concordance-part'),
    element.textContent,
  ]);

const hitAt = (
  start: number,
  end: number,
  leftLength: number,
  rightLength: number,
  current = true,
): ConcordanceDetailHit => ({ start, end, leftLength, rightLength, color: 'red', current });

describe('renderConcordanceDetailText (issue 429)', () => {
  it('marks the match and its contexts without changing the text', () => {
    const text = '坡塘村党委副书记劳卓娜说';
    const { container } = render(<p>{renderConcordanceDetailText(text, [hitAt(6, 8, 2, 3)])}</p>);
    expect(container.textContent).toBe(text);
    expect(parts(container)).toEqual([
      ['context', '委副'],
      ['match', '书记'],
      ['context', '劳卓娜'],
    ]);
  });

  it('turns code-point offsets into string positions after emoji', () => {
    const text = '😀 note: alpha beta';
    // Code points: 😀=0, space=1, "note:"=2..6, space=7, "alpha"=8..12.
    const { container } = render(<p>{renderConcordanceDetailText(text, [hitAt(8, 13, 6, 5)])}</p>);
    expect(parts(container)).toEqual([
      ['context', 'note: '],
      ['match', 'alpha'],
      ['context', ' beta'],
    ]);
  });

  it('lets a match win over a context that runs into it', () => {
    const text = 'what what';
    const { container } = render(
      <p>{renderConcordanceDetailText(text, [hitAt(0, 4, 0, 5), hitAt(5, 9, 5, 0, false)])}</p>,
    );
    expect(parts(container)).toEqual([
      ['match', 'what'],
      ['context', ' '],
      ['other-match', 'what'],
    ]);
  });
});
