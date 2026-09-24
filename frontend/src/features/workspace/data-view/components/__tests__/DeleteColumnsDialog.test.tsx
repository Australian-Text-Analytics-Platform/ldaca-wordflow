import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteColumnsDialog } from '../DeleteColumnsDialog';

describe('DeleteColumnsDialog (#141)', () => {
  it('deletes the picked columns in one call and closes', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <DeleteColumnsDialog
        open
        onOpenChange={onOpenChange}
        columns={['text', 'year', 'party', 'notes']}
        onConfirm={onConfirm}
      />,
    );

    await user.type(screen.getByLabelText('Filter columns'), 'a');
    // Only names containing "a" remain visible.
    expect(screen.getByLabelText('year')).toBeInTheDocument();
    expect(screen.queryByLabelText('text')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 of 4 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete 2 columns' }));
    expect(onConfirm).toHaveBeenCalledWith(['year', 'party']);
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('refuses to delete every column', async () => {
    const user = userEvent.setup();
    render(
      <DeleteColumnsDialog
        open
        onOpenChange={vi.fn()}
        columns={['text', 'year']}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Keep at least one column.');
    expect(screen.getByRole('button', { name: 'Delete 2 columns' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    await user.click(screen.getByLabelText('year'));
    expect(screen.getByRole('button', { name: 'Delete 1 column' })).toBeEnabled();
  });
});
