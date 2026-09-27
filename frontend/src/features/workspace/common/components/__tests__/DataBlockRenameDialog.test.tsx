import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DataBlockRenameDialog } from '../DataBlockRenameDialog';

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('@/lib/toastError', () => ({ toastError: mocks.toastError }));

function Harness({ onRename }: { onRename: (name: string) => unknown }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('speeches');
  return (
    <>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <DataBlockRenameDialog
        open={open}
        onOpenChange={setOpen}
        currentName="speeches"
        value={value}
        onValueChange={setValue}
        onRename={onRename}
      />
    </>
  );
}

describe('DataBlockRenameDialog (issue 210)', () => {
  it('stays open with the text selected when the rename fails', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockRejectedValueOnce(new Error('clash')).mockResolvedValue(undefined);
    render(<Harness onRename={onRename} />);
    const input = screen.getByRole('textbox', { name: 'New Data Block name' });
    await user.clear(input);
    await user.type(input, 'tweets{Enter}');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    expect((input as HTMLInputElement).selectionEnd).toBe('tweets'.length);

    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('closed');
    });
    expect(onRename).toHaveBeenCalledTimes(2);
  });
});
