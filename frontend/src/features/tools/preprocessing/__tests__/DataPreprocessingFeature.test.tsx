import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Int64, Utf8, tableFromArrays } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import DataPreprocessingFeature from '../DataPreprocessingFeature';
import { usePreprocessingInputs } from '../inputState';
import { useProjectPreview } from '@/features/project/previewState';
import { useSelectionStore } from '@/stores/selectionStore';
import type { ProjectNode } from '@/features/project/api';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  find: vi.fn(),
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
  applyFind: mocks.find,
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
        <DataPreprocessingFeature base="http://project" nodes={projectNodes} active />
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
      ['filter', 'slice', 'join', 'concat', 'find', 'build', 'sql'].map((tool) => [
        tool,
        [{ node_id: 'Corpus', column: 'Body' }],
      ]),
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
  mocks.find.mockResolvedValue({ table_name: 'Corpus' });
  mocks.sql.mockResolvedValue(
    tableFromArrays({ missing_count: [0], minimum: ['1'], maximum: ['25'], median: ['13'] }),
  );
});

describe('project preprocessing presentation', () => {
  it('shows the seven retained tools and native input schema without server providers', async () => {
    mount();
    for (const name of ['Filter', 'Sample', 'Join', 'Stack', 'Find', 'Build', 'SQL'])
      expect(screen.getByRole('tab', { name, exact: true })).toBeVisible();
    await waitFor(() =>
      expect(panel('Filter').getByRole('combobox', { name: 'Filter column' })).toBeEnabled(),
    );
    for (const title of ['Filter', 'Sample', 'Join', 'Stack', 'Find', 'Build']) {
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
  it('keeps Find drafts across tools and offers only First / All replacement', async () => {
    mount();
    await tab('Find');
    const find = within(screen.getByRole('tabpanel', { name: 'Find' }));
    await waitFor(() => expect(find.getByLabelText('Regex pattern')).toBeEnabled());
    fireEvent.change(find.getByLabelText('Regex pattern'), { target: { value: '\\w+' } });
    await tab('Sample');
    await tab('Find');
    expect(find.getByLabelText('Regex pattern')).toHaveValue('\\w+');
    await userEvent.click(find.getByLabelText('Matches'));
    expect(screen.getByRole('option', { name: 'First match' })).toBeVisible();
    await userEvent.click(screen.getByRole('option', { name: 'First match' }));
    await userEvent.click(find.getByRole('button', { name: 'Apply', exact: true }));
    await waitFor(() =>
      expect(mocks.find).toHaveBeenCalledWith(
        'http://project',
        { table_name: 'Corpus', kind: 'view' },
        expect.objectContaining({ source_column: 'Body', output_column: 'Body', count: 'first' }),
        ['Body', 'Count'],
      ),
    );
    expect(find.queryByLabelText('New Data Block name')).not.toBeInTheDocument();
    expect(find.getByText(/This View stays live/)).toBeVisible();
    expect(mocks.apply).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useProjectPreview.getState()).toMatchObject({
        active: 'existing',
      }),
    );
    expect(useSelectionStore.getState().selectedNodeIds).toEqual(['Corpus']);
  });
  it('retains drafts and reports an Apply failure once', async () => {
    mocks.find.mockRejectedValue(new Error('constraint failed'));
    mount();
    await tab('Find');
    const find = within(screen.getByRole('tabpanel', { name: 'Find' }));
    await waitFor(() => expect(find.getByLabelText('Regex pattern')).toBeEnabled());
    fireEvent.change(find.getByLabelText('Regex pattern'), { target: { value: '\\w+' } });
    await userEvent.click(find.getByRole('button', { name: 'Apply', exact: true }));
    await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
    expect(find.getByLabelText('Regex pattern')).toHaveValue('\\w+');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('creates a new sample and uses the shared lookahead pagination', async () => {
    mount();
    await tab('Sample');
    const sample = within(screen.getByRole('tabpanel', { name: 'Sample' }));
    await waitFor(() => expect(sample.getByRole('columnheader', { name: /Body/ })).toBeVisible());
    expect(sample.getByRole('link', { name: /next/i })).toBeVisible();
    const apply = sample.getByRole('button', { name: 'Create Data Block', exact: true });
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
    expect(sql.queryByText(/Preprocessing Inputs/)).not.toBeInTheDocument();
    expect(sql.queryByRole('button', { name: 'Create Data Block' })).not.toBeInTheDocument();
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
  await tab('Find');
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
  await userEvent.click(build.getByRole('button', { name: 'Create Data Block', exact: true }));
  await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
  expect(build.getByRole('button', { name: 'Count', exact: true })).toBeVisible();
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['Corpus']);
  await userEvent.click(build.getByRole('button', { name: 'Create Data Block', exact: true }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(build.queryByText('Applying…')).not.toBeInTheDocument());
  expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
});

it('Find captures targets while inputs change and keeps progress until overlapping requests settle', async () => {
  const releases: ((value: { table_name: string }) => void)[] = [];
  mocks.find.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
  mount([...nodes, { ...nodes[0]!, table_name: 'Other', kind: 'table' }]);
  await tab('Find');
  const find = panel('Find');
  await waitFor(() => expect(find.getByLabelText('Regex pattern')).toBeEnabled());
  fireEvent.change(find.getByLabelText('Regex pattern'), { target: { value: 'first' } });
  fireEvent.change(find.getByLabelText('Output column name'), {
    target: { value: 'first_result' },
  });
  fireEvent.click(find.getByRole('button', { name: 'Apply', exact: true }));
  await waitFor(() => expect(mocks.find).toHaveBeenCalledTimes(1));
  expect(find.getByLabelText('Regex pattern')).toBeEnabled();
  act(() => usePreprocessingInputs.getState().set('find', [{ node_id: 'Other', column: 'Body' }]));
  await waitFor(() => expect(find.getByText(/This Table stores the values/)).toBeVisible());
  fireEvent.change(find.getByLabelText('Regex pattern'), { target: { value: 'second' } });
  fireEvent.change(find.getByLabelText('Output column name'), {
    target: { value: 'second_result' },
  });
  fireEvent.click(find.getByRole('button', { name: 'Applying…', exact: true }));
  await waitFor(() => expect(mocks.find).toHaveBeenCalledTimes(2));
  expect(mocks.find.mock.calls[0]?.slice(1, 3)).toEqual([
    { table_name: 'Corpus', kind: 'view' },
    expect.objectContaining({ pattern: 'first', output_column: 'first_result' }),
  ]);
  expect(mocks.find.mock.calls[1]?.slice(1, 3)).toEqual([
    { table_name: 'Other', kind: 'table' },
    expect.objectContaining({ pattern: 'second', output_column: 'second_result' }),
  ]);
  await act(async () => releases[0]!({ table_name: 'Corpus' }));
  expect(find.getByRole('button', { name: 'Applying…', exact: true })).toBeEnabled();
  await act(async () => releases[1]!({ table_name: 'Other' }));
  await waitFor(() =>
    expect(find.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled(),
  );
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['Corpus']);
  expect(useProjectPreview.getState().active).toBe('existing');
});

it('Build keeps incomplete roots, combines bubbles and reconstructs edited SQL without restoration', async () => {
  mount();
  await tab('Build');
  const build = panel('Build');
  await userEvent.click(build.getByRole('button', { name: 'Add column Body' }));
  await userEvent.click(build.getByRole('button', { name: 'Add column Count' }));
  expect(build.getByRole('button', { name: 'Create Data Block', exact: true })).toBeDisabled();
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
  mocks.parse.mockResolvedValue({ kind: 'sql', sql: expression });
  await userEvent.click(build.getByRole('button', { name: 'Return to bubble builder' }));
  expect(await build.findByRole('button', { name: /SQL: CASE WHEN/ })).toBeVisible();
  expect(build.queryByLabelText('DuckDB expression')).not.toBeInTheDocument();
  expect(mocks.parse).toHaveBeenCalledWith('http://project', expression, expect.any(AbortSignal));
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

it('malformed SQL leaves the editor and last valid tree intact', async () => {
  mount();
  await tab('Build');
  const build = panel('Build');
  await userEvent.click(build.getByRole('button', { name: 'Add column Body' }));
  await userEvent.click(build.getByRole('button', { name: 'Edit SQL expression' }));
  fireEvent.change(build.getByLabelText('DuckDB expression'), { target: { value: 'lower(' } });
  mocks.parse.mockRejectedValue(new Error('Parser Error: incomplete expression'));
  await userEvent.click(build.getByRole('button', { name: 'Return to bubble builder' }));
  await waitFor(() => expect(build.getByRole('status')).toHaveTextContent('Parser Error'));
  expect(build.getByLabelText('DuckDB expression')).toHaveValue('lower(');
  expect(mocks.report).not.toHaveBeenCalled();
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
  expect(build.getByRole('button', { name: 'Create Data Block', exact: true })).toBeEnabled();
  expect(mocks.report).not.toHaveBeenCalled();
});

it('hands unfinished SQL to the editor, keeps the previous preview and parses a correction', async () => {
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
  expect(build.getByRole('button', { name: 'Create Data Block', exact: true })).toBeDisabled();
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
  await userEvent.click(build.getByRole('button', { name: 'Return to bubble builder' }));
  expect(await build.findByRole('button', { name: /SQL: lower/ })).toBeVisible();
});
