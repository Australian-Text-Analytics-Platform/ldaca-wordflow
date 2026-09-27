import { TooltipProvider } from '@/components/ui/tooltip';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChartDownload } from './DownloadControl';

it('defaults to PNG, blocks duplicate submissions and retains cancelled saves', async () => {
  const operation = Promise.withResolvers<string | null>();
  const onExport = vi.fn(() => operation.promise);
  render(<ChartDownload onExport={onExport} />, { wrapper: TooltipProvider });
  fireEvent.click(screen.getByRole('button', { name: 'Download chart' }));
  expect(screen.getByRole('combobox')).toHaveTextContent('PNG');
  const submit = screen.getByRole('button', { name: 'Download', exact: true });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(onExport).toHaveBeenCalledExactlyOnceWith('png');
  expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  await act(async () => operation.resolve(null));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
});

it('keeps the dialog after failure and blocks export when data becomes outdated', async () => {
  const onExport = vi.fn().mockRejectedValue(new Error('save failed'));
  const { rerender } = render(<ChartDownload onExport={onExport} />, { wrapper: TooltipProvider });
  fireEvent.click(screen.getByRole('button', { name: 'Download chart' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download', exact: true }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Download', exact: true })).toBeEnabled(),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  rerender(<ChartDownload disabled onExport={onExport} />);
  expect(screen.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
});
