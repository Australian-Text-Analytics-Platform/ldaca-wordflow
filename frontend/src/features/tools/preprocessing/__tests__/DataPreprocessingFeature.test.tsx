import { TooltipProvider } from '@/components/ui/tooltip';
import type { ProjectNode } from '@/features/project/api';
import { useProjectPreview } from '@/features/project/previewState';
import { useSelectionStore } from '@/stores/selectionStore';
import { ToolInputScope, useInputDestinations } from '@/features/tools/common/inputDestinations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Int64, Utf8, tableFromArrays } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import DataPreprocessingFeature from '../DataPreprocessingFeature';
import { usePreprocessingInputs } from '../inputState';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  preview: vi.fn(),
  schema: vi.fn(),
  report: vi.fn(),
  sql: vi.fn(),
  parse: vi.fn(),
}));
vi.mock('../sql/SqlEditor', () => ({
  SqlEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="DuckDB expression"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock('../projectPreprocessing', async (original) => ({
  ...(await original()),
  applyTransformation: mocks.apply,
  previewSql: mocks.preview,
}));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: mocks.report }));
vi.mock('@/features/project/api', async (original) => ({
  ...(await original()),
  querySql: mocks.sql,
  nodeSchema: mocks.schema,
  parseExpression: mocks.parse,
}));
const nodes: ProjectNode[] = [
  {
    table_name: 'Corpus',
    visible: true,
    color: null,
    document_column: 'Body',
    kind: 'view',
    column_count: 2,
    can_undo: false,
  },
];
const fields = [
  { name: 'Body', field: new Field('Body', new Utf8()) },
  { name: 'Count', field: new Field('Count', new Int64()) },
];
function mount(projectNodes = nodes) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ToolInputScope value={{ base: 'http://project', tool: 'filter', active: true }}>
          <DataPreprocessingFeature base="http://project" nodes={projectNodes} active />
        </ToolInputScope>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
const panel = (name: string) => within(screen.getByRole('tabpanel', { name, exact: true }));
async function tab(name: string) {
  await userEvent.click(screen.getByRole('tab', { name, exact: true }));
  return panel(name);
}

beforeEach(() => {
  vi.clearAllMocks();
  useProjectPreview.setState({ active: 'existing' });
  useSelectionStore.getState().replaceSelectedNodes(['Corpus']);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  usePreprocessingInputs.setState({
    activeTool: 'filter',
    byTool: Object.fromEntries(
      [
        'filter',
        'group',
        'slice',
        'join',
        'aggregate',
        'deduplicate',
        'concat',
        'build',
        'sql',
      ].map((tool) => [tool, [{ node_id: 'Corpus', column: 'Body' }]]),
    ),
  });
  mocks.schema.mockResolvedValue(fields);
  mocks.preview.mockResolvedValue({
    data: [{ Body: 'one two', Count: '9007199254740993' }],
    columns: ['Body', 'Count'],
    schema: fields,
    pagination: { page: 1, page_size: 10, has_next: true },
  });
  mocks.apply.mockResolvedValue({ table_name: 'result' });
  mocks.sql.mockResolvedValue(
    tableFromArrays({ missing_count: [0], minimum: ['1'], maximum: ['25'], median: ['13'] }),
  );
});

describe('project preprocessing presentation', () => {
  it('registers only active destinations while retaining visited subtab drafts', async () => {
    mount();
    const labels = () =>
      useInputDestinations.getState().destinations.map((destination) => destination.label);
    await waitFor(() => expect(labels()).toEqual(['Data Builder inputs']));
    await tab('Join');
    await waitFor(() => expect(labels()).toEqual(['Left input', 'Right input']));
    await tab('Build');
    await waitFor(() => expect(labels()).toEqual(['Data Builder inputs']));
    await tab('Join');
    await waitFor(() => expect(labels()).toEqual(['Left input', 'Right input']));
  });
  it('shows the nine approved tools and native input schema without server providers', async () => {
    mount();
    for (const name of [
      'Filter',
      'Group',
      'Join',
      'Aggregate',
      'Sample',
      'Deduplicate',
      'Stack',
      'Build',
      'SQL',
    ])
      expect(screen.getByRole('tab', { name, exact: true })).toBeVisible();
    await waitFor(() =>
      expect(panel('Filter').getByRole('combobox', { name: 'Filter column' })).toBeEnabled(),
    );
    for (const title of [
      'Filter',
      'Group',
      'Join',
      'Aggregate',
      'Sample',
      'Deduplicate',
      'Stack',
      'Build',
    ]) {
      await tab(title);
      const pane = within(screen.getByRole('tabpanel', { name: title, exact: true }));
      expect(pane.queryByRole('combobox', { name: 'Result type' })).not.toBeInTheDocument();
      expect(pane.queryByRole('combobox', { name: 'Apply result as' })).not.toBeInTheDocument();
      expect(pane.queryByRole('button', { name: 'Update Data Block' })).not.toBeInTheDocument();
    }
    expect(mocks.schema).toHaveBeenCalledWith(
      'http://project',
      { schema: 'data', name: 'Corpus' },
      expect.any(AbortSignal),
    );
  });
  it('creates a new sample and uses the shared lookahead pagination', async () => {
    mount();
    await tab('Sample');
    const sample = within(screen.getByRole('tabpanel', { name: 'Sample' }));
    await waitFor(() => expect(sample.getByRole('columnheader', { name: /Body/ })).toBeVisible());
    expect(sample.getByRole('link', { name: /next/i })).toBeVisible();
    const apply = sample.getByRole('button', { name: 'Add to Project', exact: true });
    await waitFor(() => expect(apply).toBeEnabled());
    {
      await userEvent.click(apply);
      await waitFor(() => expect(mocks.apply).toHaveBeenCalled());
      expect(mocks.apply.mock.calls[0]?.[2]).toMatch(/^Corpus_/);
    }
  });
  it('opens the independent SQL console without transformation inputs or outputs', async () => {
    mocks.sql.mockResolvedValue(
      tableFromArrays({ id: ['cell'], position: [0], sql: ['SELECT 1'], mode: ['default'] }),
    );
    mount();
    await tab('SQL');
    const sql = within(screen.getByRole('tabpanel', { name: 'SQL', exact: true }));
    expect(await sql.findByRole('button', { name: 'Run cell 1' })).toBeVisible();
    expect(sql.queryByText(/Data Builder inputs/)).not.toBeInTheDocument();
    expect(sql.queryByRole('button', { name: 'Add to Project' })).not.toBeInTheDocument();
    expect(sql.queryByRole('combobox', { name: 'Result type' })).not.toBeInTheDocument();
    expect(sql.getByRole('button', { name: 'Add Cell' })).toBeVisible();
  });
  it('reconciles per-tool selections without project UUIDs', () => {
    usePreprocessingInputs.getState().rename('Corpus', 'Renamed');
    expect(usePreprocessingInputs.getState().byTool.filter).toEqual([
      { node_id: 'Renamed', column: 'Body' },
    ]);
    usePreprocessingInputs.getState().retain(new Set());
    expect(usePreprocessingInputs.getState().byTool.filter).toEqual([]);
  });
});

it('Build chains use type-sensitive menus, edit parameters, and retain invalidated drafts', async () => {
  mount();
  await tab('Build');
  const build = within(screen.getByRole('tabpanel', { name: 'Build', exact: true }));
  await userEvent.click(build.getByRole('button', { name: 'Add column Body', exact: true }));
  const openOperations = async () =>
    userEvent.click(build.getByRole('button', { name: 'Body', exact: true }));
  await openOperations();
  expect(
    screen.queryByRole('button', { name: 'Square root', exact: true }),
  ).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Search operations' }), 'Split');
  await userEvent.click(screen.getByRole('button', { name: 'Split', exact: true }));
  expect(build.queryByRole('button', { name: 'Edit Split' })).not.toBeInTheDocument();
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Add operation', exact: true }),
  );
  await openOperations();
  await userEvent.click(screen.getByRole('button', { name: 'List length', exact: true }));
  await openOperations();
  await userEvent.click(screen.getByRole('button', { name: 'Mean', exact: true }));
  await openOperations();
  expect(screen.getByRole('button', { name: 'Sum', exact: true })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Round', exact: true }));
  await userEvent.clear(screen.getByLabelText('Decimal places'));
  await userEvent.type(screen.getByLabelText('Decimal places'), '2');
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Add operation', exact: true }),
  );
  await userEvent.click(build.getByRole('button', { name: 'Edit Round', exact: true }));
  expect(screen.getByLabelText('Decimal places')).toHaveValue('2');
  await userEvent.clear(screen.getByLabelText('Decimal places'));
  await userEvent.type(screen.getByLabelText('Decimal places'), '3');
  await userEvent.click(screen.getByRole('button', { name: 'Save operation' }));
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenCalledWith(
      'http://project',
      expect.stringContaining('round('),
      1,
      10,
      expect.any(AbortSignal),
    ),
  );
  await tab('Filter');
  await tab('Build');
  expect(build.getByRole('button', { name: 'Edit Round' })).toHaveTextContent('3');
  expect(build.queryByRole('button', { name: 'Remove Split' })).not.toBeInTheDocument();
  await userEvent.click(build.getByRole('button', { name: 'Edit Split' }));
  await userEvent.clear(screen.getByLabelText('Delimiter'));
  await userEvent.type(screen.getByLabelText('Delimiter'), ',');
  await userEvent.click(screen.getByRole('button', { name: 'Save operation' }));
  expect(build.getByRole('button', { name: 'Edit Split' })).toHaveTextContent(',');
  for (const operation of ['Round', 'Mean', 'List length', 'Split']) {
    await userEvent.click(build.getByRole('button', { name: `Remove ${operation}` }));
  }
  expect(build.queryByRole('button', { name: 'Edit Split' })).not.toBeInTheDocument();
  expect(mocks.report).not.toHaveBeenCalled();
}, 15_000);

it('Build failures keep drafts and report once without changing graph selection', async () => {
  mount();
  await tab('Build');
  const build = within(screen.getByRole('tabpanel', { name: 'Build', exact: true }));
  await userEvent.click(build.getByRole('button', { name: 'Add column Count', exact: true }));
  mocks.apply.mockRejectedValueOnce(new Error('constraint failure'));
  await userEvent.click(build.getByRole('button', { name: 'Add to Project', exact: true }));
  await waitFor(() => expect(build.getByRole('alert')).toHaveTextContent('constraint failure'));
  expect(mocks.report).not.toHaveBeenCalled();
  expect(build.getByRole('button', { name: 'Count', exact: true })).toBeVisible();
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['Corpus']);
  await userEvent.click(build.getByRole('button', { name: 'Add to Project', exact: true }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(build.queryByText('Applying…')).not.toBeInTheDocument());
  expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
});

it('Build keeps incomplete roots, combines bubbles and requires confirmation before discarding edited SQL', async () => {
  mount();
  await tab('Build');
  const build = panel('Build');
  await userEvent.click(build.getByRole('button', { name: 'Add column Body' }));
  await userEvent.click(build.getByRole('button', { name: 'Add column Count' }));
  expect(build.getByRole('button', { name: 'Add to Project', exact: true })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(build.getAllByTestId('build-bubble')).toHaveLength(2);
  await userEvent.click(build.getByRole('button', { name: 'Choose how to combine' }));
  fireEvent.change(screen.getByLabelText('Separator'), { target: { value: ' · ' } });
  await userEvent.click(screen.getByRole('button', { name: 'Join text', exact: true }));
  await userEvent.click(build.getByRole('button', { name: 'Join text', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Add operation', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Lowercase', exact: true }));
  await userEvent.keyboard('{Escape}');
  expect(build.getByText(/lower\(concat_ws/)).toBeVisible();
  await userEvent.click(build.getByRole('button', { name: 'Edit SQL expression' }));
  const expression = 'CASE WHEN "Count" > 0 THEN upper("Body") ELSE NULL END';
  fireEvent.change(build.getByLabelText('DuckDB expression'), { target: { value: expression } });
  await tab('Filter');
  await tab('Build');
  expect(build.getByLabelText('DuckDB expression')).toHaveValue(expression);
  await userEvent.click(build.getByRole('button', { name: 'New visual expression' }));
  let dialog = within(await screen.findByRole('alertdialog'));
  await userEvent.click(dialog.getByRole('button', { name: 'Keep SQL' }));
  expect(build.getByLabelText('DuckDB expression')).toHaveValue(expression);
  await userEvent.click(build.getByRole('button', { name: 'New visual expression' }));
  dialog = within(await screen.findByRole('alertdialog'));
  await userEvent.click(dialog.getByRole('button', { name: 'Start new expression' }));
  expect(build.queryByLabelText('DuckDB expression')).not.toBeInTheDocument();
  expect(build.queryAllByTestId('build-bubble')).toHaveLength(0);
  expect(mocks.parse).not.toHaveBeenCalled();
});

it('Build preserves typed values and keyboard subtree moves', async () => {
  mount();
  await tab('Build');
  const build = panel('Build');
  await userEvent.click(build.getByRole('button', { name: 'Add column Body' }));
  await userEvent.click(build.getByRole('button', { name: 'Add value', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Literal value' }), {
    target: { value: '00123 “text”' },
  });
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Add value', exact: true }),
  );
  await userEvent.keyboard('{Escape}');
  await userEvent.click(build.getByRole('button', { name: 'Drag “00123 “text””' }));
  await userEvent.keyboard(' {ArrowLeft}{Enter}');
  expect(build.getAllByTestId('build-bubble')[0]).toHaveTextContent('00123 “text”');
  await userEvent.click(build.getByRole('button', { name: 'Remove expression Body' }));
  expect(build.getByText("'00123 “text”'")).toBeVisible();
});

it('SQL preview errors retain the previous output and leave Apply advisory', async () => {
  mount();
  await tab('Build');
  const build = panel('Build');
  await userEvent.click(build.getByRole('button', { name: 'Add column Body' }));
  await userEvent.click(build.getByRole('button', { name: 'Edit SQL expression' }));
  fireEvent.change(build.getByLabelText('DuckDB expression'), { target: { value: '42' } });
  await waitFor(() => expect(build.getByRole('columnheader', { name: /Body/ })).toBeVisible());
  mocks.preview.mockRejectedValue(new Error('Parser Error: incomplete expression'));
  fireEvent.change(build.getByLabelText('DuckDB expression'), { target: { value: 'upper(' } });
  await waitFor(() => expect(build.getByRole('status')).toHaveTextContent('Parser Error'));
  expect(build.getByRole('columnheader', { name: /Body/ })).toBeVisible();
  expect(build.getByText(/Outdated preview/)).toBeVisible();
  expect(build.getByRole('button', { name: 'Add to Project', exact: true })).toBeEnabled();
  expect(mocks.report).not.toHaveBeenCalled();
});

it('hands unfinished SQL to the editor and previews a corrected expression', async () => {
  mount();
  await tab('Build');
  const build = panel('Build');
  await userEvent.click(build.getByRole('button', { name: 'Add column Body' }));
  await waitFor(() => expect(build.getByRole('columnheader', { name: /Body/ })).toBeVisible());
  const previousCalls = mocks.preview.mock.calls.length;
  await userEvent.click(build.getByRole('button', { name: 'Add function', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Join text', exact: true }));
  await userEvent.keyboard('{Escape}');
  expect(build.getByText('Needs input')).toBeVisible();
  expect(build.getByText('Draft SQL', { exact: true })).toBeVisible();
  expect(build.getByRole('button', { name: 'Add to Project', exact: true })).toBeDisabled();
  expect(build.getByRole('columnheader', { name: /Body/ })).toBeVisible();
  expect(build.getByText(/Outdated preview/)).toBeVisible();
  await userEvent.click(build.getByRole('button', { name: 'Edit SQL expression' }));
  expect((build.getByLabelText('DuckDB expression') as HTMLTextAreaElement).value).toContain(
    '/* add input */',
  );
  expect(mocks.preview).toHaveBeenCalledTimes(previousCalls);
  fireEvent.change(build.getByLabelText('DuckDB expression'), {
    target: { value: 'lower("Body")' },
  });
  mocks.parse.mockResolvedValue({ kind: 'sql', sql: 'lower("Body")' });
  expect(build.getByLabelText('DuckDB expression')).toHaveValue('lower("Body")');
  expect(mocks.parse).not.toHaveBeenCalled();
});
