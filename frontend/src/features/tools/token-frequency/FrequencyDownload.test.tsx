import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FrequencyDownload } from './FrequencyDownload';

it('waits for confirmation and retains options after a failed or cancelled export', async () => {
  const onExport = vi
    .fn()
    .mockRejectedValueOnce(new Error('Failed'))
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce('words.csv');
  const onOpenChange = vi.fn();
  const onError = vi.fn();
  render(
    <FrequencyDownload
      open
      onOpenChange={onOpenChange}
      label="Frequencies"
      kind="table"
      hasStopwords
      onExport={onExport}
      onError={onError}
    />,
  );
  expect(onExport).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'Include stopwords (.txt)' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include stopwords (.txt)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() => expect(onError).toHaveBeenCalledOnce());
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(onExport).toHaveBeenLastCalledWith('csv', false);
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Export', exact: true })).toBeEnabled(),
  );
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onError).toHaveBeenCalledOnce();
});

it('keeps a running download dismissible without cancelling accepted work or closing a later dialog', async () => {
  const operation = Promise.withResolvers<string | null>();
  const onExport = vi.fn(() => operation.promise);
  const onOpenChange = vi.fn();
  const props = {
    onOpenChange,
    label: 'Cloud',
    kind: 'chart' as const,
    hasStopwords: false,
    onExport,
    onError: vi.fn(),
  };
  const { rerender } = render(<FrequencyDownload open {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
  expect(onExport).toHaveBeenCalledWith('png', false);
  expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  const close = screen.getAllByRole('button', { name: 'Close', exact: true })[0];
  expect(close).toBeDefined();
  if (close) fireEvent.click(close);
  expect(onOpenChange).toHaveBeenCalledOnce();
  rerender(<FrequencyDownload open={false} {...props} />);
  rerender(<FrequencyDownload open {...props} label="Next cloud" />);
  await act(async () => operation.resolve('cloud.png'));
  expect(screen.getByRole('dialog', { name: 'Export Next cloud' })).toBeInTheDocument();
  expect(onOpenChange).toHaveBeenCalledOnce();
});
