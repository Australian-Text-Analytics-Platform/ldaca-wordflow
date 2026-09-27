import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { sqlTypes } from '../../../api';
import { SqlTypeDialog } from '../SqlTypeDialog';

vi.mock('../../../api', () => ({ sqlTypes: vi.fn() }));
beforeEach(() => {
  vi.mocked(sqlTypes)
    .mockReset()
    .mockResolvedValue([
      { name: 'BOOLEAN', logical_type: 'BOOLEAN', comment: null, builtin: true },
      { name: 'DECIMAL', logical_type: 'DECIMAL', comment: null, builtin: true },
      { name: 'NUMERIC', logical_type: 'DECIMAL', comment: null, builtin: true },
      { name: 'TIMETZ', logical_type: 'TIME WITH TIME ZONE', comment: null, builtin: true },
      {
        name: '"wordflow"."mood"',
        logical_type: 'ENUM',
        comment: 'Mood categories',
        builtin: false,
      },
    ]);
});
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

it('filters names and aliases, selects without casting, and requires the Cast button', async () => {
  const user = userEvent.setup();
  const onCast = vi.fn().mockResolvedValue(undefined);
  render(
    <SqlTypeDialog
      base="http://project"
      column="amount"
      nodeName="orders"
      applying={false}
      onClose={vi.fn()}
      onCast={onCast}
    />,
    { wrapper },
  );
  const input = screen.getByRole('textbox', { name: 'SQL type' });
  expect(input).toHaveFocus();
  expect(screen.getByText('orders · amount')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cast', exact: true })).toBeDisabled();
  const recommended = await screen.findByRole('region', { name: 'Recommended types' });
  expect(within(recommended).getByRole('button', { name: 'Use BOOLEAN' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use INTEGER' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use TIMETZ' })).toBeInTheDocument();
  expect(sqlTypes).toHaveBeenCalledWith('http://project', expect.any(AbortSignal));
  await user.type(input, 'numeric');
  expect(screen.getByRole('button', { name: 'Use NUMERIC' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use BOOLEAN' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Use NUMERIC' }));
  expect(input).toHaveValue('NUMERIC');
  await user.clear(input);
  await user.type(input, 'DECIMAL(18,4)');
  expect(onCast).not.toHaveBeenCalled();
  await user.click(input);
  await user.keyboard('{Enter}');
  expect(onCast).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cast', exact: true }));
  expect(onCast).toHaveBeenCalledWith('DECIMAL(18,4)');
});

it('accepts types outside suggestions and closes without submitting', async () => {
  const user = userEvent.setup();
  const onCast = vi.fn();
  const onClose = vi.fn();
  render(
    <SqlTypeDialog
      base="http://project"
      column="category"
      nodeName="orders"
      applying={false}
      onClose={onClose}
      onCast={onCast}
    />,
    { wrapper },
  );
  await user.type(screen.getByRole('textbox', { name: 'SQL type' }), 'wordflow.my_type');
  expect(screen.getByText(/No matching suggestions/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cast', exact: true })).toBeEnabled();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  expect(onCast).not.toHaveBeenCalled();
});

it('finds project types by catalogue comments and inserts their qualified name', async () => {
  const user = userEvent.setup();
  const onCast = vi.fn();
  render(
    <SqlTypeDialog
      base="http://project"
      column="value"
      nodeName="data"
      applying={false}
      onClose={vi.fn()}
      onCast={onCast}
    />,
    { wrapper },
  );
  const input = screen.getByRole('textbox', { name: 'SQL type' });
  await user.type(input, 'categories');
  await user.click(await screen.findByRole('button', { name: 'Use "wordflow"."mood"' }));
  expect(input).toHaveValue('"wordflow"."mood"');
  expect(onCast).not.toHaveBeenCalled();
});

it('retains typed input after catalogue failure, permits manual casting, and can retry', async () => {
  vi.mocked(sqlTypes).mockRejectedValueOnce(new Error('Catalogue unavailable'));
  const user = userEvent.setup();
  const onCast = vi.fn().mockResolvedValue(undefined);
  render(
    <SqlTypeDialog
      base="http://project"
      column="value"
      nodeName="data"
      applying={false}
      onClose={vi.fn()}
      onCast={onCast}
    />,
    { wrapper },
  );
  const input = screen.getByRole('textbox', { name: 'SQL type' });
  await user.type(input, 'INTEGER[[]');
  await user.click(await screen.findByRole('button', { name: 'Retry loading types' }));
  await screen.findByText(/No matching suggestions/);
  expect(input).toHaveValue('INTEGER[]');
  await user.click(screen.getByRole('button', { name: 'Cast', exact: true }));
  expect(onCast).toHaveBeenCalledWith('INTEGER[]');
});

it('cancels the catalogue request when dismissed while loading', () => {
  vi.mocked(sqlTypes).mockImplementation(
    () =>
      new Promise(() => {
        // Keep the response pending while the dialog is dismissed.
      }),
  );
  const { unmount } = render(
    <SqlTypeDialog
      base="http://project"
      column="value"
      nodeName="data"
      applying={false}
      onClose={vi.fn()}
      onCast={vi.fn()}
    />,
    { wrapper },
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading SQL types');
  const signal = vi.mocked(sqlTypes).mock.calls[0]?.[1];
  unmount();
  expect(signal?.aborted).toBe(true);
});
