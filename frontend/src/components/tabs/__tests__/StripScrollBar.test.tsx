import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StripScrollBar } from '../StripScrollBar';

describe('StripScrollBar', () => {
  it('is not shown when every tab fits', () => {
    render(
      <StripScrollBar
        scrollRef={createRef()}
        metrics={{ scrollLeft: 0, clientWidth: 500, scrollWidth: 500 }}
      />,
    );
    expect(screen.queryByTestId('tab-strip-scrollbar')).not.toBeInTheDocument();
  });

  it('sizes and places the thumb by the part of the strip in view', () => {
    render(
      <StripScrollBar
        scrollRef={createRef()}
        metrics={{ scrollLeft: 500, clientWidth: 516, scrollWidth: 1016 }}
      />,
    );
    const thumb = screen.getByTestId('tab-strip-scrollbar-thumb');
    // Rail 500px; half the strip in view; scrolled to the end.
    expect(Number.parseFloat(thumb.style.width)).toBeCloseTo((516 / 1016) * 500, 5);
    expect(Number.parseFloat(thumb.style.left)).toBeCloseTo(500 - (516 / 1016) * 500, 5);
  });
});
