import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PaginationJump } from './Pagination';

describe('pagination jump popover', () => {
  it('focuses its input, validates range, jumps, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<PaginationJump totalPages={25} onPageChange={onPageChange} />);
    const trigger = screen.getByRole('button', { name: 'Jump to page' });
    await user.click(trigger);
    const input = screen.getByRole('textbox', { name: 'Page number' });
    expect(input).toHaveFocus();
    await user.type(input, '26{Enter}');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onPageChange).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '25{Enter}');
    expect(onPageChange).toHaveBeenCalledWith(25);
    await user.click(trigger);
    expect(screen.getByRole('textbox', { name: 'Page number' })).toHaveValue('');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
