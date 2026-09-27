import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Utf8, Float64, Struct, List, vectorFromArray, tableFromArrays } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import ConcordanceFeature from './ConcordanceFeature';
import { concordanceKey, emptyConcordance, useConcordanceState } from './concordanceState';
import { refreshProjectQueries } from '@/features/project/projectChanges';
vi.mock('./ConcordanceDispersion', () => ({
  ConcordanceDispersion: () => <p>Dispersion chart</p>,
}));
vi.mock('../common/language/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ data: 'en', isFetching: false, isError: false }),
}));
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  listTabs: vi.fn(),
  createTab: vi.fn(),
  deleteTab: vi.fn(),
  getTokenizers: vi.fn(),
  nodeSchema: vi.fn(),
  previewConcordance: vi.fn(),
  updateTab: vi.fn(),
  runConcordance: vi.fn(),
  getConcordanceResult: vi.fn(),
  queryConcordance: vi.fn(),
  clearTab: vi.fn(),
}));
const base = 'http://concordance';
const tab: api.Tab = {
  id: 'tab',
  kind: 'concordance',
  name: 'Concordance 1',
  position: 0,
  settings: {},
  analysis: null,
};
const request: api.ConcordanceRequest = {
  ...emptyConcordance,
  inputs: [{ source: { schema: 'data', name: 'Corpus' }, column: 'text', tokenizer: null }],
  search: { ...emptyConcordance.search, query: 'cat' },
};
const nodes: api.ProjectNode[] = [
  {
    table_name: 'Corpus',
    visible: true,
    color: null,
    document_column: 'text',
    kind: 'table',
    column_count: 1,
    can_undo: false,
  },
];
const hit = {
  match_order: 0,
  left_context: '😀 ',
  matched_text: 'cat',
  right_context: ' dog',
  start_idx: 2,
  end_idx: 5,
  l1: '😀',
  r1: 'dog',
  l1_frequency: 1,
  r1_frequency: 1,
  extraction: '😀 cat dog',
};
const matchType = new Struct(
  Object.entries(hit).map(
    ([name, value]) => new Field(name, typeof value === 'number' ? new Float64() : new Utf8()),
  ),
);
const page = {
  table: tableFromArrays({
    document_id: [1],
    source: vectorFromArray([{ text: '😀 cat dog' }], new Struct([new Field('text', new Utf8())])),
    matches: vectorFromArray([[hit]], new List(new Field('item', matchType))),
  }),
  totalRows: 1,
  documentCount: 1,
  matchCount: 1,
  hasNext: true,
};
const previewButton = () =>
  within(screen.getByRole('region', { name: 'Concordance request' })).getByRole('button', {
    name: 'Preview',
    exact: true,
  });

const completed: api.ConcordanceAnalysisResult = {
  id: 'result',
  tab_id: tab.id,
  kind: 'concordance',
  created_at: '',
  request,
  result: {
    version: 1,
    payload: {
      corpora: [
        {
          input: request.inputs[0]!,
          columns: [['text', 'VARCHAR']],
          documents: 'd',
          matches: 'm',
          projection: 'p',
          document_count: 1,
          matching_documents: 1,
          match_count: 1,
        },
      ],
    },
    finished_at: '',
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  useConcordanceState.setState({ active: {}, drafts: {}, previews: {} });
  vi.mocked(api.listTabs).mockResolvedValue([tab]);
  vi.mocked(api.createTab).mockResolvedValue(tab);
  vi.mocked(api.getTokenizers).mockResolvedValue([]);
  vi.mocked(api.nodeSchema).mockResolvedValue([
    { name: 'text', field: new Field('text', new Utf8()) },
  ]);
  vi.mocked(api.previewConcordance).mockResolvedValue(page);
  vi.mocked(api.updateTab).mockImplementation(async (_base, _id, change) => ({
    ...tab,
    ...change,
  }));
});
function mount(active = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (active = true) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ConcordanceFeature
          base={base}
          nodes={nodes}
          tasks={[]}
          active={active}
          onCancel={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(tree(active));
  return { client, ...view, show: (active: boolean) => view.rerender(tree(active)) };
}
it('calculates only after Preview and reuses pages for presentation and unrelated changes', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  const { client } = mount();
  await screen.findByRole('textbox', { name: 'Concordance query' });
  expect(api.previewConcordance).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Concordance query' }), {
    target: { value: 'dog' },
  });
  expect(api.previewConcordance).not.toHaveBeenCalled();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(api.previewConcordance).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('tab', { name: 'Dispersion', exact: true }));
  await screen.findByText('Dispersion chart');
  expect(api.previewConcordance).toHaveBeenCalledTimes(1);
  await act(() =>
    refreshProjectQueries(client, base, {
      objects: [{ schema: 'data', name: 'Unrelated' }],
    }),
  );
  expect(api.previewConcordance).toHaveBeenCalledTimes(1);
  await act(() =>
    refreshProjectQueries(client, base, { objects: [{ schema: 'data', name: 'Corpus' }] }),
  );
  await waitFor(() => expect(api.previewConcordance).toHaveBeenCalledTimes(2));
  expect(useConcordanceState.getState().drafts[concordanceKey(base, tab.id)]?.search.query).toBe(
    'dog',
  );
});
it('retains a failed preview and explicit Preview can refresh unchanged settings', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  mount();
  await screen.findByRole('textbox', { name: 'Concordance query' });
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  vi.mocked(api.previewConcordance).mockRejectedValueOnce(new Error('Source unavailable'));
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByText(/Refresh failed/);
  expect(screen.getByRole('button', { name: 'cat', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toBeInTheDocument();
});

it('offers Rerun for a broken saved projection and returns to Run after Retry succeeds', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: completed.id, request, has_result: true } },
  ]);
  vi.mocked(api.getConcordanceResult).mockResolvedValue(completed);
  vi.mocked(api.queryConcordance).mockRejectedValue(new Error('Missing artifact table'));
  mount();
  const rerun = await screen.findByRole('button', { name: 'Rerun', exact: true });
  await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
  vi.mocked(api.queryConcordance).mockResolvedValue(page);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(api.runConcordance).not.toHaveBeenCalled();
});
it('creates once on tool entry and does not recreate a closed last tab', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([]);
  const { client } = mount();
  await screen.findByRole('tab', { name: /Concordance 1/ });
  expect(api.createTab).toHaveBeenCalledTimes(1);
  await act(() => {
    client.setQueryData(['native', base, 'tabs', 'concordance'], []);
  });
  await screen.findByRole('button', { name: 'New Concordance analysis' });
  expect(api.createTab).toHaveBeenCalledTimes(1);
});

it('Stop aborts only the pending Preview and ignores its late response', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  let signal: AbortSignal | undefined;
  let resolve: ((value: typeof page) => void) | undefined;
  vi.mocked(api.previewConcordance).mockImplementation((_base, _id, _request, abort) => {
    signal = abort;
    return new Promise((done) => {
      resolve = done;
    });
  });
  mount();
  await screen.findByRole('textbox', { name: 'Concordance query' });
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await waitFor(() => expect(api.previewConcordance).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => {
    resolve?.(page);
    await Promise.resolve();
  });
  expect(screen.queryByRole('button', { name: 'cat', exact: true })).not.toBeInTheDocument();
  expect(api.runConcordance).not.toHaveBeenCalled();
});

it('discards Preview on leaving, keeps the draft, and ignores legacy persisted Preview', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  const session = mount();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  expect(screen.queryByRole('region', { name: 'Concordance results' })).not.toBeInTheDocument();
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(api.updateTab).not.toHaveBeenCalled();
  session.show(false);
  await waitFor(() => expect(useConcordanceState.getState().previews).toEqual({}));
  session.show(true);
  expect(screen.queryByRole('region', { name: 'Concordance results' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(api.previewConcordance).toHaveBeenCalledOnce();
  session.unmount();
  useConcordanceState.setState({ active: {}, drafts: {}, previews: {} });
  vi.mocked(api.listTabs).mockResolvedValue([
    {
      ...tab,
      settings: { preview: { request, analysisId: null } },
      analysis: { id: 'submitted-analysis', request, has_result: false },
    },
  ]);
  mount();
  await screen.findByRole('textbox', { name: 'Concordance query' });
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(api.previewConcordance).toHaveBeenCalledOnce();
});

it('clears Preview without changing its draft or writing settings', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  const { client } = mount();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.queryByRole('region', { name: 'Concordance results' })).not.toBeInTheDocument();
  expect(client.getQueriesData({ queryKey: ['native', base, 'analysis-preview', tab.id] })).toEqual(
    [],
  );
  expect(api.updateTab).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
});

it('keeps Text options when changing modes and restores Preview fields and document-page counts', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  vi.mocked(api.previewConcordance).mockResolvedValue({ ...page, documentCount: 20 });
  mount();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Regex', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Tokens', exact: true }));
  expect(screen.getByText(/Match exact tokens/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Text', exact: true }));
  expect(screen.getByRole('checkbox', { name: 'Regex', exact: true })).toBeChecked();
  fireEvent.click(previewButton());
  await screen.findByText('1 matches in 1 of 20 inspected documents');
  const results = within(screen.getByRole('region', { name: 'Concordance results' }));
  for (const name of ['L1', 'R1', 'Start', 'End'])
    expect(results.getByRole('columnheader', { name, exact: true })).toBeInTheDocument();
  expect(results.queryByRole('columnheader', { name: 'L1 frequency' })).not.toBeInTheDocument();
});
it('moves from Preview to saved results once, protects newer drafts, and re-enables Preview after clearing', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  const pending = Promise.withResolvers<api.ConcordanceAnalysisResult>();
  vi.mocked(api.runConcordance).mockReturnValueOnce(pending.promise);
  vi.mocked(api.getConcordanceResult).mockResolvedValue(completed);
  vi.mocked(api.queryConcordance).mockResolvedValue(page);
  const { client } = mount();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  await waitFor(() => expect(api.runConcordance).toHaveBeenCalledOnce());
  expect(previewButton()).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(previewButton());
  expect(api.previewConcordance).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByRole('textbox', { name: 'Concordance query' }), {
    target: { value: 'dog' },
  });
  await act(async () => {
    pending.resolve(completed);
  });
  await act(() => {
    client.setQueryData(
      ['native', base, 'tabs', 'concordance'],
      [{ ...tab, analysis: { id: 'result', request, has_result: true } }],
    );
  });
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('dog');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
      'aria-disabled',
      'false',
    ),
  );
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Concordance query' }), {
    target: { value: 'cat' },
  });
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'true'));
  expect(
    within(screen.getByRole('region', { name: 'Concordance results' })).queryByRole('button', {
      name: 'Preview',
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  await waitFor(() => expect(api.clearTab).toHaveBeenCalledOnce());
  await act(() => {
    client.setQueryData(['native', base, 'tabs', 'concordance'], [tab]);
  });
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
});

it.each([0, 1])(
  'blocks matching completed requests, including %i matches, and tracks changes without a dirty flag',
  async (count) => {
    vi.mocked(api.listTabs).mockResolvedValue([
      { ...tab, analysis: { id: completed.id, request, has_result: true } },
    ]);
    vi.mocked(api.getConcordanceResult).mockResolvedValue({
      ...completed,
      result: {
        version: 1,
        finished_at: '',
        payload: {
          corpora: completed.result.payload.corpora.map((corpus) => ({
            ...corpus,
            matching_documents: count,
            match_count: count,
          })),
        },
      },
    });
    vi.mocked(api.queryConcordance).mockResolvedValue({
      ...page,
      totalRows: count,
      matchCount: count,
    });
    mount();
    const query = await screen.findByRole('textbox', { name: 'Concordance query' });
    const run = screen.getByRole('button', { name: 'Run', exact: true });
    await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(run);
    expect(api.runConcordance).not.toHaveBeenCalled();
    fireEvent.change(query, { target: { value: 'dog' } });
    expect(run).toHaveAttribute('aria-disabled', 'false');
    fireEvent.change(query, { target: { value: request.search.query } });
    expect(run).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Highlight L1 / R1' }));
    expect(run).toHaveAttribute('aria-disabled', 'true');
  },
);

it('restores supported saved fields and enables compatibility Rerun without rewriting JSON', async () => {
  const incompatible = { ...request, future_option: { value: '<b>future</b>' } };
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'result', request: incompatible, has_result: true } },
  ]);
  vi.mocked(api.getConcordanceResult).mockResolvedValue(completed);
  mount();
  expect(await screen.findByText('These saved settings are not recognized:')).toBeInTheDocument();
  const rerun = await screen.findByRole('button', { name: 'Rerun', exact: true });
  await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
  expect(api.updateTab).not.toHaveBeenCalled();
  expect(incompatible.future_option.value).toBe('<b>future</b>');
});

it('keeps original compatibility issues through edits, Preview, Clear and refreshed saved requests', async () => {
  const original = { ...request, search: { ...request.search, future: { value: 7 } } };
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'submitted-analysis', request: original, has_result: false } },
  ]);
  const { client } = mount();
  const query = await screen.findByRole('textbox', { name: 'Concordance query' });
  fireEvent.change(query, { target: { value: 'dog' } });
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(vi.mocked(api.previewConcordance).mock.calls[0]?.[2]).toMatchObject({
    search: { query: 'dog' },
  });
  expect(vi.mocked(api.previewConcordance).mock.calls[0]?.[2]).not.toHaveProperty('search.future');
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.getByText('search.future')).toBeInTheDocument();
  expect(query).toHaveValue('dog');
  expect(api.updateTab).not.toHaveBeenCalled();
  expect(api.clearTab).not.toHaveBeenCalled();
  expect(client.getQueryData(['native', base, 'tabs', 'concordance'])).toEqual([
    { ...tab, analysis: { id: 'submitted-analysis', request: original, has_result: false } },
  ]);
  await act(() => {
    client.setQueryData(
      ['native', base, 'tabs', 'concordance'],
      [{ ...tab, analysis: { id: 'submitted-analysis', request, has_result: false } }],
    );
  });
  await waitFor(() =>
    expect(screen.queryByText('These saved settings are not recognized:')).not.toBeInTheDocument(),
  );
  expect(query).toHaveValue('dog');
});
