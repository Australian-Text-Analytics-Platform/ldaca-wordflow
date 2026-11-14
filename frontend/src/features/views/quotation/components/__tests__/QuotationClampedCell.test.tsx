import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuotationClampedCell } from '../QuotationClampedCell';

const mockBoxHeights = (scrollHeight: number, clientHeight: number) => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
};

describe('QuotationClampedCell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a 42rem minimum, fills spare width, and clamps to three lines', () => {
    render(<QuotationClampedCell>Alice said hello.</QuotationClampedCell>);

    // jsdom lays nothing out, so the classes are the contract: the text
    // reports no width of its own (issue 111) and fills a box that is at
    // least 42rem and as wide as the column (issue 449).
    const cell = screen.getByTestId('quotation-clamped-cell');
    expect(cell).toHaveClass('w-0', 'min-w-full', 'line-clamp-3', 'whitespace-normal');
    expect(screen.getByTestId('quotation-clamped-cell-box')).toHaveClass('min-w-[42rem]');
  });

  it('shows the full content on hover when the clamp hides some of it', async () => {
    const user = userEvent.setup();
    mockBoxHeights(120, 60);
    render(<QuotationClampedCell>Alice said a very long hello.</QuotationClampedCell>);

    await user.hover(screen.getByTestId('quotation-clamped-cell'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Alice said a very long hello.');
  });

  it('does not show a tooltip when the whole content already fits', async () => {
    const user = userEvent.setup();
    mockBoxHeights(60, 60);
    render(<QuotationClampedCell>Alice said hello.</QuotationClampedCell>);

    await user.hover(screen.getByTestId('quotation-clamped-cell'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
