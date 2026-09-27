import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInlineRename } from '@/lib/rename/useInlineRename';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toast: { error: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/toastError', () => ({ toastError: mocks.toastError }));

function Harness({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string) => unknown;
  onClose: () => void;
}) {
  const { inputProps } = useInlineRename({ original: 'speeches', onSubmit, onClose });
  return (
    <>
      <input {...inputProps} aria-label="Name" />
      <button type="button">Elsewhere</button>
    </>
  );
}

const setup = (onSubmit: (name: string) => unknown) => {
  const onClose = vi.fn();
  render(<Harness onSubmit={onSubmit} onClose={onClose} />);
  return { onClose, input: screen.getByRole('textbox', { name: 'Name' }), user: userEvent.setup() };
};

describe('useInlineRename (issue 210)', () => {
  beforeEach(() => {
    mocks.toastError.mockReset();
    mocks.toast.error.mockReset();
  });

  it('opens with the name selected', () => {
    const { input } = setup(vi.fn());
    expect(input).toHaveFocus();
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe('speeches'.length);
  });

  it('submits the trimmed name on Enter and closes after success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { input, onClose, user } = setup(onSubmit);
    await user.clear(input);
    await user.type(input, '  tweets {Enter}');
    expect(onSubmit).toHaveBeenCalledWith('tweets');
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes without a request when the name is unchanged', async () => {
    const onSubmit = vi.fn();
    const { onClose, user } = setup(onSubmit);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the box open with the text selected after a failure, then closes on an unchanged blur', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('A Data Block named tweets already exists.'));
    const { input, onClose, user } = setup(onSubmit);
    await user.clear(input);
    await user.type(input, 'tweets{Enter}');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    expect((input as HTMLInputElement).selectionEnd).toBe('tweets'.length);
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Blur with the same text: close, keep the original name, no second request.
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retries on Enter and submits edited text on blur after a failure', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('clash')).mockResolvedValue(undefined);
    const { input, onClose, user } = setup(onSubmit);
    await user.clear(input);
    await user.type(input, 'tweets{Enter}');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits edited text when the box loses focus after a failure', async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(undefined);
    const { input, onClose, user } = setup(onSubmit);
    await user.clear(input);
    await user.type(input, 'tweets{Enter}');
    // Wait for the failure to reselect the text before editing it.
    await waitFor(() => {
      expect((input as HTMLInputElement).selectionStart).toBe(0);
    });
    expect(mocks.toastError).not.toHaveBeenCalled();

    // The text is selected after a failure; move to the end to append.
    await user.type(input, '{End} 2020', { skipClick: true });
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenLastCalledWith('tweets 2020');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels on Escape without a request', async () => {
    const onSubmit = vi.fn();
    const { input, onClose, user } = setup(onSubmit);
    await user.type(input, 'x{Escape}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats an empty name as a failure', async () => {
    const onSubmit = vi.fn();
    const { input, onClose, user } = setup(onSubmit);
    await user.clear(input);
    await user.keyboard('{Enter}');
    expect(mocks.toast.error).toHaveBeenCalledWith('Enter a name.');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
