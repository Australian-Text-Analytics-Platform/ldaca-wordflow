import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vite-plus/test';
import { useSessionErrors } from '@/features/diagnostics/sessionErrors';
import { OperationError } from './OperationError';

it('does not present or record a cancelled read while its owner is leaving', () => {
  useSessionErrors.getState().clear();
  render(
    <OperationError
      title="Couldn't load Data Block"
      error={new DOMException('Navigation cancelled', 'AbortError')}
    />,
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(useSessionErrors.getState().entries).toEqual([]);
});

it('retains original diagnostics, supports recovery and records a Strict Mode failure once', async () => {
  useSessionErrors.getState().clear();
  const user = userEvent.setup();
  const retry = vi.fn();
  const error = Object.assign(new Error('Engine: invalid value 你好'), {
    details: 'Original provider response\nLine 7: expected INTEGER',
  });
  render(
    <StrictMode>
      <OperationError title="Couldn't convert column" error={error} onRetry={retry} />
    </StrictMode>,
  );
  const alert = screen.getByRole('alert');
  expect(within(alert).getByText(error.message)).toBeVisible();
  expect(useSessionErrors.getState().entries).toHaveLength(1);
  await user.click(within(alert).getByText('Details', { exact: true }));
  expect(within(alert).getByText(/Original provider response/)).toBeVisible();
  await user.click(within(alert).getByRole('button', { name: 'Copy details' }));
  expect(await navigator.clipboard.readText()).toBe(`${error.message}\n\n${error.details}`);
  await user.click(within(alert).getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(within(alert).getByRole('button', { name: 'Feedback' })).toBeEnabled();
});
