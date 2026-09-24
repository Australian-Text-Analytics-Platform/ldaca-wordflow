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

  it('bounds the cell width and clamps it to three lines', () => {
    render(<QuotationClampedCell>Alice said hello.</QuotationClampedCell>);

    const cell = screen.getByTestId('quotation-clamped-cell');
    expect(cell).toHaveClass('w-[32rem]', 'line-clamp-3', 'whitespace-normal');
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
