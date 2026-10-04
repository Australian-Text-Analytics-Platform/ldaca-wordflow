import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChartImageDownloadDialog } from '../ChartImageDownloadDialog';

describe('ChartImageDownloadDialog interactive HTML (issue 278)', () => {
  it('offers Interactive HTML only to charts that can make it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onConfirmHtml = vi.fn();
    const { rerender } = render(
      <ChartImageDownloadDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    );
    expect(screen.queryByText('Interactive HTML')).not.toBeInTheDocument();

    rerender(
      <ChartImageDownloadDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        onConfirmHtml={onConfirmHtml}
      />,
    );
    await user.click(screen.getByText('Interactive HTML'));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(onConfirmHtml).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
