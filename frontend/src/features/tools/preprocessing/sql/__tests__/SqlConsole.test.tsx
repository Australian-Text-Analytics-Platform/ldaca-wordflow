import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tableFromArrays } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SqlSubTab } from '../SqlSubTab';
import { ConsoleRunner, type SqlCellRecord } from '../sqlCells';
import type { Statement } from '@/features/project/api';

const mocks = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn(), run: vi.fn(), report: vi.fn() }));
vi.mock('../sqlCells', async (original) => ({ ...(await original()), loadSqlCells: mocks.load }));
vi.mock('@/features/project/api', async (original) => ({
  ...(await original()),
  executeSql: mocks.write,
  runSqlScript: mocks.run,
}));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: mocks.report }));
vi.mock('../SqlEditor', () => ({
  SqlEditor: ({
    value,
    onChange,
    onBlur,
    onRun,
  }: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onRun: () => void;
  }) => (
    <textarea
      aria-label="SQL source"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key === 'Enter') onRun();
      }}
    />
  ),
}));
let stored: SqlCellRecord[];
const cell = (
  id = 'first',
  sql = 'SELECT 1',
  mode: 'default' | 'live' = 'default',
): SqlCellRecord => ({ id, sql, mode, position: 0 });
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = (active = true) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SqlSubTab base="http://project" active={active} editing={false} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return { ...render(ui()), client, ui };
}
async function source() {
  return screen.findByRole('textbox', { name: 'SQL source' });
}
async function tick(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  stored = [cell()];
  mocks.load.mockImplementation(async () => stored.map((row) => ({ ...row })));
  mocks.write.mockImplementation(async (_base: string, statements: Statement[]) => {
    for (const statement of statements) {
      if (statement.sql.startsWith('UPDATE wordflow.sql_cells SET sql=')) {
        const [sql, mode, id] = statement.parameters!;
        stored = stored.map((row) =>
          row.id === id ? { ...row, sql: String(sql), mode: mode as 'default' | 'live' } : row,
        );
      } else if (statement.sql.startsWith('INSERT INTO wordflow.sql_cells SELECT')) {
        if (!stored.length) stored = [cell(String(statement.parameters![0]), '')];
      } else if (statement.sql.startsWith('INSERT INTO wordflow.sql_cells (')) {
        const [id, position, sql, mode] = statement.parameters!;
        stored.push({
          id: String(id),
          position: Number(position),
          sql: String(sql),
          mode: mode as 'default' | 'live',
        });
      } else if (statement.sql.startsWith('UPDATE wordflow.sql_cells SET position=')) {
        stored = stored.map((row) =>
          row.id === statement.parameters![1]
            ? { ...row, position: Number(statement.parameters![0]) }
            : row,
        );
      } else if (statement.sql.startsWith('DELETE FROM'))
        stored = stored.filter((row) => row.id !== statement.parameters![0]);
    }
    stored.sort((a, b) => a.position - b.position);
  });
  mocks.run.mockResolvedValue({
    table: tableFromArrays({ n: Array.from({ length: 45 }, (_, n) => n) }),
    statementsCompleted: 2,
    truncated: false,
  });
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
it('initializes a local draft once without writing or executing', async () => {
  stored = [];
  const view = mount();
  await source();
  expect(mocks.write).not.toHaveBeenCalled();
  view.rerender(view.ui(false));
  view.rerender(view.ui(true));
  await tick(50);
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('saves before execution, retains failed-run source, and reports once', async () => {
  mocks.run.mockRejectedValue(new Error('missing table'));
  mount();
  fireEvent.change(await source(), { target: { value: 'SELECT missing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
  expect(stored[0]?.sql).toBe('SELECT missing');
  expect(screen.getByRole('textbox')).toHaveValue('SELECT missing');
  expect(mocks.write.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.run.mock.invocationCallOrder[0]!,
  );
});
it('does not run when saving fails and preserves unsaved drafts', async () => {
  mocks.write.mockRejectedValue(new Error('disk full'));
  mount();
  fireEvent.change(await source(), { target: { value: 'SELECT 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
  expect(mocks.run).not.toHaveBeenCalled();
  expect(screen.getByText('Unsaved')).toBeVisible();
});
it('older save completion never marks newer text saved', async () => {
  let finish!: () => void;
  mocks.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          stored[0] = cell('first', 'SELECT 2');
          resolve();
        };
      }),
  );
  mount();
  const input = await source();
  fireEvent.change(input, { target: { value: 'SELECT 2' } });
  fireEvent.blur(input);
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'SELECT 3' } });
  await act(async () => finish());
  expect(input).toHaveValue('SELECT 3');
  expect(screen.getByText('Unsaved')).toBeVisible();
});
it('paginates a captured result without rerunning SQL and retains it across tab changes', async () => {
  const view = mount();
  await source();
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await screen.findByText('2 statements completed · 45 displayed rows');
  fireEvent.click(screen.getByRole('link', { name: /next page/i }));
  expect(screen.getByRole('cell', { name: '20', exact: true })).toBeVisible();
  expect(mocks.run).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SELECT 2' } });
  expect(screen.getByText(/Outdated result/)).toBeVisible();
  view.rerender(view.ui(false));
  view.rerender(view.ui(true));
  expect(screen.getByRole('textbox')).toHaveValue('SELECT 2');
  expect(screen.getByRole('cell', { name: '20', exact: true })).toBeVisible();
});
it('keeps persisted live cells inert, then previews edits once with no save loop', async () => {
  stored = [cell('first', 'SELECT 1', 'live')];
  mount();
  const input = await source();
  await tick(650);
  expect(mocks.run).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'SELECT 2' } });
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(mocks.run).toHaveBeenCalledWith('http://project', 'SELECT 2', 'preview', undefined);
  await tick(800);
  expect(mocks.run).toHaveBeenCalledTimes(1);
});
it('suppresses incomplete live syntax but reports explicit errors', async () => {
  stored = [cell('first', 'SELECT 1', 'live')];
  mocks.run.mockRejectedValue(Object.assign(new Error('incomplete'), { code: 'not_previewable' }));
  mount();
  fireEvent.change(await source(), { target: { value: 'SELECT (' } });
  await screen.findByText('Waiting for one complete query', {}, { timeout: 2000 });
  expect(mocks.report).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
});
it('duplicates source and mode without results or execution, and persists reordering/deletion', async () => {
  mount();
  await source();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cell 1 options' }));
  await user.click(screen.getByRole('menuitem', { name: 'Duplicate cell' }));
  await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
  expect(stored.map((row) => row.sql)).toEqual(['SELECT 1']);
  expect(mocks.run).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cell 2 options' }));
  await user.click(screen.getByRole('menuitem', { name: 'Move cell up' }));
  await waitFor(() => expect(stored[0]?.position).toBe(1));
  expect(stored).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Cell 1 options' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete cell' }));
  await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(1));
  expect(stored[0]?.id).toBe('first');
});
it('coalesces queued live drafts and never retries Default runs', async () => {
  const runner = new ConsoleRunner();
  let release!: () => void;
  const first = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const superseded = vi.fn();
  const latest = vi.fn();
  runner.enqueue({ id: 'a', live: true, valid: () => true, run: first });
  runner.enqueue({ id: 'a', live: true, valid: () => true, run: superseded });
  runner.enqueue({ id: 'a', live: true, valid: () => true, run: latest });
  const explicit = vi.fn(async () => undefined);
  runner.enqueue({ id: 'a', live: false, valid: () => true, run: explicit });
  expect(explicit).toHaveBeenCalledTimes(1);
  release();
  await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
  expect(superseded).not.toHaveBeenCalled();
  expect(first).toHaveBeenCalledTimes(1);
});

it('allows different cells to run concurrently while keeping their own results', async () => {
  stored = [cell('first', 'SELECT 1'), { ...cell('second', 'SELECT 2'), position: 1 }];
  let finish!: () => void;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            table: tableFromArrays({ value: [1] }),
            statementsCompleted: 1,
            truncated: false,
          });
      }),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Run cell 1' }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 2' }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Completed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Run cell 1' })).toBeEnabled();
  await act(async () => finish());
  await waitFor(() => expect(screen.getAllByText('Completed')).toHaveLength(2));
});

it('allows deleting the final previously saved cell without silently recreating it', async () => {
  mount();
  await source();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cell 1 options' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete cell' }));
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  expect(stored).toEqual([]);
});

it('queues a blur save while an earlier cell save is pending', async () => {
  let finish!: () => void;
  mocks.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          stored[0] = cell('first', 'SELECT 2');
          resolve();
        };
      }),
  );
  mount();
  const input = await source();
  fireEvent.change(input, { target: { value: 'SELECT 2' } });
  fireEvent.blur(input);
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'SELECT 3' } });
  fireEvent.blur(input);
  expect(mocks.write).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
  expect(stored[0]?.sql).toBe('SELECT 3');
});

it('labels Default runs and retains results and drafts after cancellation', async () => {
  mount();
  await source();
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await screen.findByText('Completed');
  expect(mocks.run).toHaveBeenCalledWith('http://project', 'SELECT 1', 'execute', 'SQL cell 1');
  mocks.run.mockRejectedValue(
    Object.assign(new Error('Interrupted'), { code: 'interrupted', taskId: 'task-1' }),
  );
  fireEvent.change(await source(), { target: { value: 'SELECT 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await screen.findByText('Cancelled');
  expect(screen.getByRole('textbox')).toHaveValue('SELECT 2');
  expect(screen.getByText(/Outdated result/)).toBeVisible();
  expect(mocks.run).toHaveBeenCalledTimes(2);
});

it('updates saved source in cache without rereading cells or project information', async () => {
  const view = mount();
  const input = await source();
  const invalidate = vi.spyOn(view.client, 'invalidateQueries');
  fireEvent.change(input, { target: { value: 'SELECT 42' } });
  fireEvent.blur(input);
  await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(view.client.getQueryData(['native', 'http://project', 'sql-cells'])).toEqual([
    cell('first', 'SELECT 42'),
  ]);
  expect(invalidate).not.toHaveBeenCalled();
});

it('keeps new, inserted and duplicated cells local until first execution, including blur', async () => {
  stored = [];
  mount();
  const input = await source();
  fireEvent.change(input, { target: { value: 'SELECT 7' } });
  fireEvent.blur(input);
  expect(mocks.write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add Cell' }));
  await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
  expect(mocks.write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await screen.findByText('Completed');
  expect(stored).toHaveLength(1);
  expect(stored[0]?.sql).toBe('SELECT 7');
  fireEvent.change(input, { target: { value: 'SELECT 8' } });
  fireEvent.blur(input);
  await waitFor(() => expect(stored[0]?.sql).toBe('SELECT 8'));
  expect(stored).toHaveLength(1);
});

it('shows the latest successful completion even when it was submitted first in the same cell', async () => {
  let completeFirst!: () => void;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        completeFirst = () =>
          resolve({
            table: tableFromArrays({ n: [111] }),
            statementsCompleted: 1,
            truncated: false,
          });
      }),
  );
  mocks.run.mockResolvedValueOnce({
    table: tableFromArrays({ n: [222] }),
    statementsCompleted: 1,
    truncated: false,
  });
  mount();
  const input = await source();
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'SELECT 222' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await screen.findByRole('cell', { name: '222' });
  expect(screen.getByRole('status')).toHaveTextContent('1 execution pending');
  expect(screen.queryByText(/Outdated result/)).not.toBeInTheDocument();
  await act(async () => completeFirst());
  expect(screen.getByRole('cell', { name: '111' })).toBeVisible();
  expect(screen.getByText(/Outdated result/)).toBeVisible();
  expect(mocks.run).toHaveBeenCalledTimes(2);
  expect(mocks.run.mock.calls.map((call) => call[1])).toEqual(['SELECT 1', 'SELECT 222']);
});

it('does not resurrect a local cell deleted while its first persistence is pending', async () => {
  stored = [];
  let complete!: () => void;
  mocks.write.mockImplementationOnce(
    async (_base: string, statements: Statement[]) =>
      new Promise<void>((resolve) => {
        complete = () => {
          const [id, position, sql, mode] = statements[0]!.parameters!;
          stored.push({
            id: String(id),
            position: Number(position),
            sql: String(sql),
            mode: mode as 'default',
          });
          resolve();
        };
      }),
  );
  mount();
  fireEvent.change(await source(), { target: { value: 'SELECT 1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run cell 1' }));
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cell 1 options' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete cell' }));
  await act(async () => complete());
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  expect(stored).toEqual([]);
});
