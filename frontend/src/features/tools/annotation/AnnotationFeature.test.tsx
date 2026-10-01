import { TooltipProvider } from '@/components/ui/tooltip';
import * as projectApi from '@/features/project/api';
import { createProjectQueryClient } from '@/features/project/projectErrors';
import * as editingApi from '@/features/table-editing/api';
import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import * as annotationApi from '@/features/tools/annotation/api';
import * as analysesApi from '@/features/tools/common/analysisApi';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Utf8 } from 'apache-arrow';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import AnnotationFeature from './AnnotationFeature';
import { useAnnotationState } from './annotationState';

vi.mock('@/features/tools/annotation/api', async (original) => ({
  ...(await original<object>()),
  beginAnnotationEdit: vi.fn(),
}));
vi.mock('@/features/tools/common/analysisApi', async (original) => ({
  ...(await original<object>()),
  listTabs: vi.fn(),
  updateTab: vi.fn(),
}));
vi.mock('@/features/table-editing/api', async (original) => ({
  ...(await original<object>()),
  cellEditPage: vi.fn(),
  saveCellEdit: vi.fn(),
  cancelCellEdit: vi.fn(),
}));
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<object>()),
  nodeSchema: vi.fn(),
}));
const setup: annotationApi.AnnotationSetup = {
  source: { schema: 'data', name: 'docs' },
  document: 'text',
  annotation: 'label',
  correction: 'correction',
  codebook: null,
};
const tab: analysesApi.Tab = {
  id: 'tab',
  kind: 'annotation',
  name: 'Annotation 1',
  position: 0,
  analysis: null,
  settings: { manual: { setup } },
  setup_status: { status: 'supported', request: setup },
};
const names = ['rowid', 'text', 'label', 'correction', 'reference'];
const session: editingApi.CellEditSession = {
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
  vi.mocked(analysesApi.listTabs).mockResolvedValue([tab]);
  vi.mocked(projectApi.nodeSchema).mockResolvedValue(
    names.map((name) => ({ name, field: new Field(name, new Utf8()) })),
  );
  vi.mocked(annotationApi.beginAnnotationEdit).mockResolvedValue(session);
  vi.mocked(editingApi.cellEditPage).mockImplementation(
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
  vi.mocked(editingApi.saveCellEdit).mockResolvedValue(undefined);
  vi.mocked(editingApi.cancelCellEdit).mockResolvedValue(undefined);
});
const nodes: projectApi.ProjectNode[] = [
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
it('restores supported Manual settings without starting an editing session automatically', async () => {
  const user = mount();
  const start = await screen.findByRole('button', { name: 'Start', exact: true });
  expect(
    screen.queryByRole('button', { name: 'Start with current defaults' }),
  ).not.toBeInTheDocument();
  expect(annotationApi.beginAnnotationEdit).not.toHaveBeenCalled();
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  await user.click(start);
  await screen.findAllByRole('textbox', { name: 'Edit label' });
  expect(annotationApi.beginAnnotationEdit).toHaveBeenCalledExactlyOnceWith(
    'http://annotation',
    'tab',
    {
      mode: 'manual',
      setup,
    },
  );
  expect(editingApi.cellEditPage).toHaveBeenCalledWith(
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
  vi.mocked(editingApi.saveCellEdit).mockRejectedValueOnce(new Error('Codebook changed'));
  await user.click(screen.getByRole('button', { name: 'Leave tool' }));
  dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(editingApi.saveCellEdit).toHaveBeenCalledOnce());
  expect(screen.queryByText('Another tool')).not.toBeInTheDocument();
  expect(screen.getByRole('alertdialog')).toBeVisible();
  await user.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  await screen.findByText('Another tool');
  expect(editingApi.saveCellEdit).toHaveBeenLastCalledWith('http://annotation', 'edit', {
    changes: [{ row_ref: '01', column: 'label', value: 'B' }],
    deletions: [],
    insertions: [],
  });
  expect(editingApi.cancelCellEdit).not.toHaveBeenCalled();
});
it('sends None as SQL NULL and Discard never saves labels', async () => {
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Start', exact: true }));
  await screen.findAllByRole('textbox', { name: 'Edit label' });
  await user.click(screen.getAllByRole('button', { name: 'None', exact: true })[0]!);
  await waitFor(() =>
    expect(vi.mocked(editingApi.cellEditPage).mock.calls.at(-1)?.[6]?.changes).toEqual([
      { row_ref: '01', column: 'label', value: null },
    ]),
  );
  await user.click(screen.getByRole('button', { name: 'Leave tool' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
  );
  await screen.findByText('Another tool');
  expect(editingApi.saveCellEdit).not.toHaveBeenCalled();
  expect(editingApi.cancelCellEdit).toHaveBeenCalledExactlyOnceWith('http://annotation', 'edit');
});

it('blocks unknown manual setup until explicit local reset without saving a preference', async () => {
  const original = { ...setup, future: 'retained' };
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      settings: { manual: { setup: original } },
      setup_status: { status: 'unsupported', reason: 'Unknown field future' },
    },
  ]);
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Start with current defaults' }));
  expect(screen.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  expect(annotationApi.beginAnnotationEdit).not.toHaveBeenCalled();
  expect(original.future).toBe('retained');
});
