import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Field, Int64, Utf8 } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { EditTableDialog } from './EditTableDialog';
import { createProjectQueryClient } from './projectErrors';
import { EditableTable } from '@/features/table-editing/EditableTable';
import { useTableEditing } from '@/features/table-editing/useTableEditing';
import * as api from './api';

vi.mock('./api', () => ({ cellEditPage: vi.fn(), saveCellEdit: vi.fn(), cancelCellEdit: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const session: api.CellEditSession = {
  session_id: 'session',
  table_name: 'documents',
  row_count: 45,
  columns: [
    { name: 'key', data_type: 'BIGINT', editable: true },
    { name: 'text', data_type: 'VARCHAR', editable: true },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.cellEditPage).mockImplementation(async (_base, _session, page, size, sorting) => {
    const source = Array.from({ length: 45 }, (_, i) => i);
    if (sorting[0]?.desc) source.reverse();
    const values = source.slice((page - 1) * size, page * size);
    return {
      schema: [
        { name: 'key', field: new Field('key', new Int64()) },
        { name: 'text', field: new Field('text', new Utf8()) },
      ],
      columns: ['key', 'text'],
      rows: values.map((i) => ({ key: String(i), text: `Row ${String(i)}` })),
      editableValues: values.map((i) => ({ key: String(i), text: `Row ${String(i)}` })),
      rowRefs: values.map(String),
      hasNext: page * size < 45,
      options: {},
    };
  });
  vi.mocked(api.saveCellEdit).mockResolvedValue(undefined);
  vi.mocked(api.cancelCellEdit).mockResolvedValue(undefined);
});
function setup(info = session) {
  const finished = vi.fn();
  const client = createProjectQueryClient();
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <EditTableDialog base="http://native" session={info} onFinished={finished} />
      </QueryClientProvider>
    </StrictMode>,
  );
  return { ...view, finished, client, user: userEvent.setup() };
}
it('keeps drafts across pages and sorting, drops reverted patches and commits once', async () => {
  const { user, finished } = setup();
  const first = (await screen.findAllByRole('textbox', { name: 'Edit text' }))[0]!;
  await user.clear(first);
  await user.type(first, 'changed zero');
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  const next = await screen.findByDisplayValue('Row 20');
  await user.clear(next);
  await user.type(next, 'changed twenty');
  expect(api.saveCellEdit).not.toHaveBeenCalled();
  await user.click(screen.getByRole('link', { name: 'Go to previous page' }));
  const original = await screen.findByDisplayValue('changed zero');
  await user.clear(original);
  await user.type(original, 'Row 0');
  expect(screen.getByText('1 changed cells')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Sort by key' }));
  await user.click(screen.getByRole('button', { name: 'Sort by key' }));
  await screen.findByDisplayValue('Row 44');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(finished).toHaveBeenCalledWith(true));
  expect(api.saveCellEdit).toHaveBeenCalledExactlyOnceWith('http://native', 'session', {
    changes: [{ row_ref: '20', column: 'text', value: 'changed twenty' }],
    deletions: [],
    insertions: [],
  });
  expect(api.cancelCellEdit).not.toHaveBeenCalled();
  expect(vi.mocked(api.cellEditPage).mock.calls[0]?.[5]).toBeInstanceOf(AbortSignal);
});
it('confirms discard through Escape and preserves the editor when discarded Save fails', async () => {
  const { user, finished } = setup();
  const input = await screen.findByDisplayValue('Row 0');
  await user.clear(input);
  await user.type(input, 'draft');
  await user.keyboard('{Escape}');
  const confirm = screen.getByRole('alertdialog');
  await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByDisplayValue('draft')).toBeVisible();
  vi.mocked(api.saveCellEdit).mockRejectedValueOnce(new Error('Constraint failed'));
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
  expect(screen.getByDisplayValue('draft')).toBeEnabled();
  expect(finished).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(finished).toHaveBeenCalledWith(false));
  expect(api.cancelCellEdit).toHaveBeenCalledOnce();
});
it('releases a session on real unmount, but not Strict Mode effect reattachment', async () => {
  const { unmount } = setup();
  await screen.findByDisplayValue('Row 0');
  expect(api.cancelCellEdit).not.toHaveBeenCalled();
  unmount();
  await waitFor(() =>
    expect(api.cancelCellEdit).toHaveBeenCalledExactlyOnceWith('http://native', 'session'),
  );
});
it('shares editing with a column-restricted labeling panel without a dialog', async () => {
  function Labels() {
    const editor = useTableEditing({
      base: 'http://native',
      session,
      editableColumns: ['text'],
      onFinished: vi.fn(),
    });
    return (
      <>
        <EditableTable
          editor={editor}
          renderEditor={(cell) => (
            <button
              onClick={() => {
                cell.onChange('positive');
              }}
            >
              {cell.value}
            </button>
          )}
        />
        <button onClick={editor.save}>Apply labels</button>
      </>
    );
  }
  render(
    <QueryClientProvider client={createProjectQueryClient()}>
      <Labels />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Row 0', exact: true }));
  expect(screen.getByRole('button', { name: 'positive' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Edit key' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Apply labels' }));
  await waitFor(() =>
    expect(api.saveCellEdit).toHaveBeenCalledWith('http://native', 'session', {
      changes: [{ row_ref: '0', column: 'text', value: 'positive' }],
      deletions: [],
      insertions: [],
    }),
  );
  expect(screen.queryByRole('button', { name: 'Delete row' })).not.toBeInTheDocument();
});

it('retains inserted and deleted rows across pages and sorting and discards deleted cell patches', async () => {
  const { user, finished } = setup();
  const original = await screen.findByDisplayValue('Row 0');
  await user.clear(original);
  await user.type(original, 'discard this patch');
  await user.click(screen.getAllByRole('button', { name: 'Add row above' })[0]!);
  const added = screen.getAllByRole('row')[1]!;
  await user.click(within(added).getByRole('button', { name: 'Set value for text' }));
  await user.type(within(added).getByRole('textbox', { name: 'Edit text' }), 'inserted');
  await user.click(within(added).getByRole('button', { name: 'Set value for key' }));
  await user.type(within(added).getByRole('textbox', { name: 'Edit key' }), '9007199254740993');
  // Inserting above an inserted row also retains its position.
  await user.click(within(added).getByRole('button', { name: 'Add row above' }));
  expect(screen.getAllByRole('textbox', { name: 'Edit text' })[0]).toHaveAttribute(
    'placeholder',
    'NULL',
  );
  await user.click(screen.getAllByRole('button', { name: 'Delete row' })[2]!);
  expect(screen.queryByDisplayValue('discard this patch')).not.toBeInTheDocument();
  expect(screen.getByText('0 changed cells · 2 added rows · 1 deleted row')).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  const twenty = await screen.findByDisplayValue('Row 20');
  await user.clear(twenty);
  await user.type(twenty, 'changed twenty');
  await user.click(screen.getByRole('link', { name: 'Go to previous page' }));
  await screen.findByDisplayValue('inserted');
  await user.click(screen.getByRole('button', { name: 'Sort by key' }));
  await user.click(screen.getByRole('button', { name: 'Sort by key' }));
  await screen.findByDisplayValue('Row 44');
  expect(screen.queryByDisplayValue('inserted')).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  await screen.findByDisplayValue('Row 24');
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  await screen.findByDisplayValue('inserted');
  expect(screen.queryByDisplayValue('Row 0')).not.toBeInTheDocument();
  expect(api.saveCellEdit).not.toHaveBeenCalled();
  vi.mocked(api.saveCellEdit).mockRejectedValueOnce(new Error('Required key is missing'));
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
  expect(screen.getByDisplayValue('inserted')).toBeEnabled();
  // Remove just the blank draft row and retry, without losing other changes.
  const blankRow = screen
    .getAllByRole('row')
    .find((row) => within(row).queryByRole('button', { name: 'Set value for key' }))!;
  await user.click(within(blankRow).getByRole('button', { name: 'Delete row' }));
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(finished).toHaveBeenCalledWith(true));
  expect(api.saveCellEdit).toHaveBeenLastCalledWith('http://native', 'session', {
    changes: [{ row_ref: '20', column: 'text', value: 'changed twenty' }],
    deletions: ['0'],
    insertions: [{ values: { key: '9007199254740993', text: 'inserted' } }],
  });
}, 15_000);

it('adds to an empty table and treats row-only changes as modified for Cancel', async () => {
  const page = await api.cellEditPage('http://native', 'session', 1, 20, []);
  vi.mocked(api.cellEditPage).mockResolvedValue({
    ...page,
    rows: [],
    rowRefs: [],
    editableValues: [],
    hasNext: false,
  });
  const { user, finished } = setup({ ...session, row_count: 0 });
  await user.click(await screen.findByRole('button', { name: 'Add row', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Edit text' })).toHaveAttribute('placeholder', 'NULL');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByText('0 changed cells · 1 added row')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Delete row' }));
  expect(screen.getByText('0 changed cells')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add row', exact: true })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await waitFor(() => expect(finished).toHaveBeenCalledWith(false));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(api.saveCellEdit).not.toHaveBeenCalled();
});

it('confirms discard when only existing rows have been deleted', async () => {
  const { user, finished } = setup();
  await screen.findByDisplayValue('Row 0');
  await user.click(screen.getAllByRole('button', { name: 'Delete row' })[0]!);
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(finished).toHaveBeenCalledWith(false));
  expect(api.saveCellEdit).not.toHaveBeenCalled();
});

it('edits NULL text and number cells directly while preserving NULL versus empty text', async () => {
  const page = await api.cellEditPage('http://native', 'session', 1, 20, []);
  page.editableValues[0] = { key: null, text: null };
  page.rows[0] = { key: null, text: null };
  vi.mocked(api.cellEditPage).mockResolvedValue(page);
  const { user, finished } = setup();
  const text = (await screen.findAllByRole('textbox', { name: 'Edit text' }))[0]!;
  const key = screen.getAllByRole('textbox', { name: 'Edit key' })[0]!;
  expect(text).toBeEnabled();
  expect(key).toBeEnabled();
  await user.click(text);
  expect(screen.getByText('0 changed cells')).toBeVisible();
  await user.type(text, 'filled');
  await user.clear(text);
  expect(screen.getByText('1 changed cells')).toBeVisible();
  // Setting NULL again discards the patch; merely focusing never changed it.
  await user.click(screen.getAllByRole('button', { name: 'Set NULL for text' })[0]!);
  expect(screen.getByText('0 changed cells')).toBeVisible();
  await user.type(text, 'again');
  await user.clear(text);
  await user.type(key, '9007199254740993');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(finished).toHaveBeenCalledWith(true));
  expect(api.saveCellEdit).toHaveBeenCalledWith('http://native', 'session', {
    changes: [
      { row_ref: '0', column: 'text', value: '' },
      { row_ref: '0', column: 'key', value: '9007199254740993' },
    ],
    deletions: [],
    insertions: [],
  });
});

it('uses the shared exact-total pagination to jump to the last page and back', async () => {
  const { user } = setup();
  const first = await screen.findByDisplayValue('Row 0');
  await user.clear(first);
  await user.type(first, 'first-page draft');
  await user.click(screen.getByRole('link', { name: '3', exact: true }));
  await screen.findByDisplayValue('Row 44');
  expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await user.click(screen.getByRole('link', { name: '1', exact: true }));
  await screen.findByDisplayValue('first-page draft');
  expect(api.saveCellEdit).not.toHaveBeenCalled();
});

it('protects existing identifiers but requires users to supply identifiers for inserted rows', async () => {
  const { user } = setup({
    ...session,
    columns: [
      { name: 'key', data_type: 'VARCHAR', editable: false, identifier: true },
      session.columns[1]!,
    ],
  });
  await screen.findByDisplayValue('Row 0');
  expect(screen.queryByRole('textbox', { name: 'Edit key' })).not.toBeInTheDocument();
  await user.click(screen.getAllByRole('button', { name: /Add row above/ })[0]!);
  const key = screen.getByRole('textbox', { name: 'Edit key' });
  await user.type(key, '01');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(api.saveCellEdit).toHaveBeenCalledWith(
      'http://native',
      'session',
      expect.objectContaining({ insertions: [{ values: { key: '01', text: null } }] }),
    ),
  );
});
