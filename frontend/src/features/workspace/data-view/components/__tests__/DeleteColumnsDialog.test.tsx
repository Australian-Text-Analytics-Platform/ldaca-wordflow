import type { ReactElement } from 'react';
import { render as baseRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getColumnExamples: vi.fn() }));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));

import { DeleteColumnsDialog } from '../DeleteColumnsDialog';

const render = (ui: ReactElement) =>
  baseRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

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

  it("shows each column's first value, or (empty) (#354)", async () => {
    api.getColumnExamples.mockResolvedValue({
      data: { examples: { text: 'Senate debate on housing', year: '2020', notes: null } },
    });
    render(
      <DeleteColumnsDialog
        open
        onOpenChange={vi.fn()}
        columns={['text', 'year', 'notes']}
        onConfirm={vi.fn()}
        workspaceId="ws-1"
        nodeId="node-1"
      />,
    );

    expect(await screen.findByTestId('delete-column-example-text')).toHaveTextContent(
      'Senate debate on housing',
    );
    expect(screen.getByTestId('delete-column-example-year')).toHaveTextContent('2020');
    expect(
      within(screen.getByTestId('delete-column-example-notes')).getByText('(empty)'),
    ).toHaveClass('italic');
    expect(api.getColumnExamples).toHaveBeenCalledWith(
      expect.objectContaining({ path: { workspace_id: 'ws-1', node_id: 'node-1' } }),
    );
  });
});
