import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useUIStore } from '@/stores/uiStore';

import { ErrorDetails, ErrorDetailsHost } from '../ErrorDetails';
import { ErrorNotice } from '../ErrorNotice';

describe('ErrorDetails (issue 205)', () => {
  it('expands in place and opens the feedback form', async () => {
    const user = userEvent.setup();
    useUIStore.getState().closeFeedback();
    render(<ErrorDetails technical="ValueError: boom" />);

    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('ValueError: boom')).toBeInTheDocument();
    expect(screen.getByText(/help the Wordflow developers/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(useUIStore.getState().feedbackOpen).toBe(true);
  });

  it('opens the shared dialog from a toast', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ErrorDetails technical="RuntimeError: boom" variant="dialog" />
        <ErrorDetailsHost />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Details' }));
    const dialog = screen.getByRole('dialog', { name: 'Error details' });
    expect(dialog).toHaveTextContent('RuntimeError: boom');
  });

  it('shows a Python diagnostic as plain words in ErrorNotice', () => {
    render(<ErrorNotice error="ComputeError: cannot cast" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong in Wordflow');
    expect(screen.queryByText('ComputeError: cannot cast')).not.toBeInTheDocument();
  });
});
