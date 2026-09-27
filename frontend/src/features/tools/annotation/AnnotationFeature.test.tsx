import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Utf8 } from 'apache-arrow';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import * as api from '@/features/project/api';
import { createProjectQueryClient } from '@/features/project/projectErrors';
import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import AnnotationFeature from './AnnotationFeature';
import { useAnnotationState } from './annotationState';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  listTabs: vi.fn(),
  nodeSchema: vi.fn(),
  beginAnnotationEdit: vi.fn(),
  cellEditPage: vi.fn(),
  saveCellEdit: vi.fn(),
  cancelCellEdit: vi.fn(),
  updateTab: vi.fn(),
}));
const setup: api.AnnotationSetup = {
  source: { schema: 'data', name: 'docs' },
  document: 'text',
  annotation: 'label',
  correction: 'correction',
  codebook: null,
};
const tab: api.Tab = {
  id: 'tab',
  kind: 'annotation',
  name: 'Annotation 1',
  position: 0,
  analysis: null,
  settings: { manual: { setup: { ...setup, future: 'retained' } } },
};
const names = ['rowid', 'text', 'label', 'correction', 'reference'];
const session: api.CellEditSession = {
  session_id: 'edit',
  schema: 'data',
  table_name: 'docs',
  row_count: 2,
  columns: names.map((name) => ({
    name,
    data_type: 'VARCHAR',
    editable: name === 'label' || name === 'correction',
    identifier: name === 'rowid',
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  useAnnotationState.setState({ active: {}, drafts: {}, previews: {} });
  vi.mocked(api.listTabs).mockResolvedValue([tab]);
  vi.mocked(api.nodeSchema).mockResolvedValue(
    names.map((name) => ({ name, field: new Field(name, new Utf8()) })),
  );
  vi.mocked(api.beginAnnotationEdit).mockResolvedValue(session);
  vi.mocked(api.cellEditPage).mockImplementation(
    async (_base, _id, _page, _size, _sort, _signal, review) => ({
      schema: names.map((name) => ({ name, field: new Field(name, new Utf8()) })),
      columns: names,
      rows: [
        { rowid: '01', text: 'First document', label: 'A', correction: null, reference: 'B' },
        { rowid: '1', text: 'Second document', label: 'A', correction: null, reference: 'A' },
      ],
      editableValues: [
        { label: 'A', correction: null },
        { label: 'A', correction: null },
      ],
      rowRefs: ['01', '1'],
      hasNext: false,
      options: {},
      review: {
        total_rows: 2,
        filtered_rows: 2,
        includes_unsaved_changes: Boolean(review?.changes.length),
        comparisons: [],
      },
    }),
  );
  vi.mocked(api.saveCellEdit).mockResolvedValue(undefined);
  vi.mocked(api.cancelCellEdit).mockResolvedValue(undefined);
});
const nodes: api.ProjectNode[] = [
  {
    table_name: 'docs',
    visible: true,
    color: null,
    document_column: 'text',
    kind: 'table',
    column_count: 5,
    can_undo: false,
  },
];
function Host() {
  const navigate = useEditingNavigation();
  const [left, setLeft] = useState(false);
  return (
    <>
      <button onClick={() => navigate(() => setLeft(true))}>Leave tool</button>
      {left ? (
        <p>Another tool</p>
      ) : (
        <AnnotationFeature base="http://annotation" nodes={nodes} active />
      )}
    </>
  );
}
function mount() {
  render(
    <QueryClientProvider client={createProjectQueryClient()}>
      <TooltipProvider>
        <EditingNavigation>
          <Host />
        </EditingNavigation>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it('restores supported Manual settings without editing or rewriting unknown JSON', async () => {
  const user = mount();
  const start = await screen.findByRole('button', { name: 'Start', exact: true });
  expect(await screen.findByText('These saved settings are not recognized:')).toBeVisible();
  expect(api.beginAnnotationEdit).not.toHaveBeenCalled();
  expect(api.updateTab).not.toHaveBeenCalled();
  await user.click(start);
  await screen.findAllByRole('textbox', { name: 'Edit label' });
  expect(api.beginAnnotationEdit).toHaveBeenCalledExactlyOnceWith('http://annotation', 'tab', {
    mode: 'manual',
    setup,
  });
  expect(api.cellEditPage).toHaveBeenCalledWith(
    'http://annotation',
    'edit',
    1,
    10,
    [],
    expect.any(AbortSignal),
    { compare: [], filter: null, changes: [] },
  );
});
it('keeps failed saves and Stay drafts, then saves once before leaving', async () => {
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Start', exact: true }));
  const first = (await screen.findAllByRole('textbox', { name: 'Edit label' }))[0]!;
  await user.clear(first);
  await user.type(first, 'B');
  await user.click(screen.getByRole('button', { name: 'Leave tool' }));
  let dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
  expect(screen.getByDisplayValue('B')).toBeVisible();
  vi.mocked(api.saveCellEdit).mockRejectedValueOnce(new Error('Codebook changed'));
  await user.click(screen.getByRole('button', { name: 'Leave tool' }));
  dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(api.saveCellEdit).toHaveBeenCalledOnce());
  expect(screen.queryByText('Another tool')).not.toBeInTheDocument();
  expect(screen.getByRole('alertdialog')).toBeVisible();
  await user.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  await screen.findByText('Another tool');
  expect(api.saveCellEdit).toHaveBeenLastCalledWith('http://annotation', 'edit', {
    changes: [{ row_ref: '01', column: 'label', value: 'B' }],
    deletions: [],
    insertions: [],
  });
  expect(api.cancelCellEdit).not.toHaveBeenCalled();
});
it('sends None as SQL NULL and Discard never saves labels', async () => {
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Start', exact: true }));
  await screen.findAllByRole('textbox', { name: 'Edit label' });
  await user.click(screen.getAllByRole('button', { name: 'None', exact: true })[0]!);
  await waitFor(() =>
    expect(vi.mocked(api.cellEditPage).mock.calls.at(-1)?.[6]?.changes).toEqual([
      { row_ref: '01', column: 'label', value: null },
    ]),
  );
  await user.click(screen.getByRole('button', { name: 'Leave tool' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
  );
  await screen.findByText('Another tool');
  expect(api.saveCellEdit).not.toHaveBeenCalled();
  expect(api.cancelCellEdit).toHaveBeenCalledExactlyOnceWith('http://annotation', 'edit');
});
