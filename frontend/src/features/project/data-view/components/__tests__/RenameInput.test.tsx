import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vite-plus/test';
import { RenameInput } from '../RenameInput';

it('submits once across Enter and blur while awaiting confirmation', async () => {
  let finish!: () => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<RenameInput column="original" onSubmit={submit} onCancel={vi.fn()} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '  New name  ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(submit).toHaveBeenCalledExactlyOnceWith('original', 'New name');
  expect(input).toHaveAttribute('readonly');
  finish();
  await waitFor(() => expect(input).not.toHaveAttribute('readonly'));
});

it('retains a failed draft and original diagnostic, then retries and supports Escape', async () => {
  const cancel = vi.fn();
  const submit = vi
    .fn()
    .mockRejectedValueOnce(new Error('Catalog Error: column already exists'))
    .mockResolvedValue(undefined);
  render(<RenameInput column="original" onSubmit={submit} onCancel={cancel} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'taken' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('alert');
  expect(input).toHaveValue('taken');
  expect(screen.getAllByText('Catalog Error: column already exists').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
});
