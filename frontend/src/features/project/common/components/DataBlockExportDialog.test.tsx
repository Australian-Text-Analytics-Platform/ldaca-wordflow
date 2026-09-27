import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { DataBlockExportDialog } from './DataBlockExportDialog';

it('dismisses a running export while its completion and error owner stay alive', async () => {
  let fail!: (error: Error) => void;
  const onExport = vi.fn(
    () =>
      new Promise<string>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const onError = vi.fn();
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <DataBlockExportDialog
        open={open}
        onOpenChange={setOpen}
        dataBlock={{ id: 'a', name: 'a' }}
        onExport={onExport}
        onError={onError}
      />
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
  expect(screen.getByText(/Export continues after closing/)).toBeVisible();
  // The dialog close icon and footer both remain usable.
  fireEvent.click(screen.getAllByRole('button', { name: 'Close', exact: true })[0]!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onExport).toHaveBeenCalledTimes(1);
  const error = new Error('installation failed');
  await act(async () => {
    fail(error);
  });
  expect(onError).toHaveBeenCalledExactlyOnceWith(error);
});
