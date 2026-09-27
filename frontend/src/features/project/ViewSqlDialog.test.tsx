import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ViewSqlDialog } from './ViewSqlDialog';
import { createProjectQueryClient } from './projectErrors';
import * as api from './api';

vi.mock('./api', async (original) => ({
  ...(await original()),
  viewDefinition: vi.fn(),
  replaceViewDefinition: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.viewDefinition).mockResolvedValue({ sql: 'SELECT * FROM test_raw' });
  vi.mocked(api.replaceViewDefinition).mockResolvedValue(undefined);
});
function setup() {
  const close = vi.fn();
  const saved = vi.fn().mockResolvedValue(undefined);
  const client = createProjectQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <ViewSqlDialog base="http://native" name="test" onClose={close} />
    </QueryClientProvider>,
  );
  return { ...view, close, saved, client, user: userEvent.setup() };
}
it('loads the current SQL with cancellation support and discards a cancelled draft', async () => {
  const { close, saved, user, unmount } = setup();
  const input = await screen.findByRole('textbox', { name: 'SQL definition' });
  expect(input).toHaveValue('SELECT * FROM test_raw');
  const signal = vi.mocked(api.viewDefinition).mock.calls[0][2];
  expect(signal).toBeInstanceOf(AbortSignal);
  await user.clear(input);
  await user.type(input, 'SELECT 2');
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(close).toHaveBeenCalledOnce();
  expect(saved).not.toHaveBeenCalled();
  expect(api.replaceViewDefinition).not.toHaveBeenCalled();
  unmount();
});
it('saves the edited SQL and closes without a second refresh owner', async () => {
  const { close, saved, user } = setup();
  const input = await screen.findByRole('textbox', { name: 'SQL definition' });
  await user.clear(input);
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await user.type(input, 'SELECT 2 AS x');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(api.replaceViewDefinition).toHaveBeenCalledWith('http://native', 'test', 'SELECT 2 AS x');
  expect(saved).not.toHaveBeenCalled();
});
it('keeps a failed draft editable and reports one expandable Sonner error', async () => {
  vi.mocked(api.replaceViewDefinition).mockRejectedValue(new Error('Unknown column'));
  const { close, saved, user } = setup();
  const input = await screen.findByRole('textbox', { name: 'SQL definition' });
  await user.clear(input);
  await user.type(input, 'SELECT missing FROM test_raw');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
  expect(input).toHaveValue('SELECT missing FROM test_raw');
  expect(input).toBeEnabled();
  expect(close).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeVisible();
});
