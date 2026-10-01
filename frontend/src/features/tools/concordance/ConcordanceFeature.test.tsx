import { TooltipProvider } from '@/components/ui/tooltip';
import * as projectApi from '@/features/project/api';
import { refreshProjectQueries } from '@/features/project/projectChanges';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as concordanceApi from '@/features/tools/concordance/api';
import * as frequencyApi from '@/features/tools/token-frequency/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Float64, List, Struct, tableFromArrays, Utf8, vectorFromArray } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import ConcordanceFeature from './ConcordanceFeature';
import { concordanceKey, emptyConcordance, useConcordanceState } from './concordanceState';
vi.mock('./ConcordanceDispersion', () => ({
  ConcordanceDispersion: () => <p>Dispersion chart</p>,
}));
vi.mock('../common/language/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ data: 'en', isFetching: false, isError: false }),
}));
vi.mock('@/features/tools/common/analysisApi', async (original) => ({
  ...(await original<object>()),
  listTabs: vi.fn(),
  createTab: vi.fn(),
  deleteTab: vi.fn(),
  updateTab: vi.fn(),
  clearTab: vi.fn(),
}));
vi.mock('@/features/tools/concordance/api', async (original) => ({
  ...(await original<object>()),
  previewConcordance: vi.fn(),
  runConcordance: vi.fn(),
  getConcordanceResult: vi.fn(),
  queryConcordance: vi.fn(),
}));
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<object>()),
  nodeSchema: vi.fn(),
}));
vi.mock('@/features/tools/token-frequency/api', async (original) => ({
  ...(await original<object>()),
  getTokenizers: vi.fn(),
}));
const base = 'http://concordance';
const tab: analysesApi.Tab = {
  id: 'tab',
  kind: 'concordance',
  name: 'Concordance 1',
  position: 0,
  settings: {},
  analysis: null,
};
const request: concordanceApi.ConcordanceRequest = {
  ...emptyConcordance,
  inputs: [{ source: { schema: 'data', name: 'Corpus' }, column: 'text', tokenizer: null }],
  search: { ...emptyConcordance.search, query: 'cat' },
};
const nodes: projectApi.ProjectNode[] = [
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

const completed: concordanceApi.ConcordanceAnalysisResult = {
  request_status: { status: 'supported', request: { kind: 'concordance', request: request } },
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
  vi.mocked(analysesApi.listTabs).mockResolvedValue([tab]);
  vi.mocked(analysesApi.createTab).mockResolvedValue(tab);
  vi.mocked(frequencyApi.getTokenizers).mockResolvedValue([]);
  vi.mocked(projectApi.nodeSchema).mockResolvedValue([
    { name: 'text', field: new Field('text', new Utf8()) },
  ]);
  vi.mocked(concordanceApi.previewConcordance).mockResolvedValue(page);
  vi.mocked(analysesApi.updateTab).mockImplementation(async (_base, _id, change) => ({
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
  expect(concordanceApi.previewConcordance).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Concordance query' }), {
    target: { value: 'dog' },
  });
  expect(concordanceApi.previewConcordance).not.toHaveBeenCalled();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(concordanceApi.previewConcordance).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('tab', { name: 'Dispersion', exact: true }));
  await screen.findByText('Dispersion chart');
  expect(concordanceApi.previewConcordance).toHaveBeenCalledTimes(1);
  await act(() =>
    refreshProjectQueries(client, base, {
      objects: [{ schema: 'data', name: 'Unrelated' }],
    }),
  );
  expect(concordanceApi.previewConcordance).toHaveBeenCalledTimes(1);
  await act(() =>
    refreshProjectQueries(client, base, { objects: [{ schema: 'data', name: 'Corpus' }] }),
  );
  await waitFor(() => expect(concordanceApi.previewConcordance).toHaveBeenCalledTimes(2));
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
  vi.mocked(concordanceApi.previewConcordance).mockRejectedValueOnce(
    new Error('Source unavailable'),
  );
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByText(/Refresh failed/);
  expect(screen.getByRole('button', { name: 'cat', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toBeInTheDocument();
});

it('offers Rerun for a broken saved projection and returns to Run after Retry succeeds', async () => {
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      analysis: {
        request_status: { status: 'supported', request: { kind: 'concordance', request: request } },
        id: completed.id,
        request,
        has_result: true,
      },
    },
  ]);
  vi.mocked(concordanceApi.getConcordanceResult).mockResolvedValue(completed);
  vi.mocked(concordanceApi.queryConcordance).mockRejectedValue(new Error('Missing artifact table'));
  mount();
  const rerun = await screen.findByRole('button', { name: 'Rerun', exact: true });
  await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
  vi.mocked(concordanceApi.queryConcordance).mockResolvedValue(page);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(concordanceApi.runConcordance).not.toHaveBeenCalled();
});
it('creates once on tool entry and does not recreate a closed last tab', async () => {
  vi.mocked(analysesApi.listTabs).mockResolvedValue([]);
  const { client } = mount();
  await screen.findByRole('tab', { name: /Concordance 1/ });
  expect(analysesApi.createTab).toHaveBeenCalledTimes(1);
  await act(async () => {
    client.setQueryData(['native', base, 'tabs', 'concordance'], []);
  });
  await screen.findByRole('button', { name: 'New Concordance analysis' });
  expect(analysesApi.createTab).toHaveBeenCalledTimes(1);
});

it('Stop aborts only the pending Preview and ignores its late response', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  let signal: AbortSignal | undefined;
  let resolve: ((value: typeof page) => void) | undefined;
  vi.mocked(concordanceApi.previewConcordance).mockImplementation((_base, _id, _request, abort) => {
    signal = abort;
    return new Promise((done) => {
      resolve = done;
    });
  });
  mount();
  await screen.findByRole('textbox', { name: 'Concordance query' });
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await waitFor(() => expect(concordanceApi.previewConcordance).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => {
    resolve?.(page);
    await Promise.resolve();
  });
  expect(screen.queryByRole('button', { name: 'cat', exact: true })).not.toBeInTheDocument();
  expect(concordanceApi.runConcordance).not.toHaveBeenCalled();
});

it('discards Preview on leaving, keeps the draft, and ignores legacy persisted Preview', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  const session = mount();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  expect(screen.queryByRole('region', { name: 'Concordance results' })).not.toBeInTheDocument();
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  session.show(false);
  await waitFor(() => expect(useConcordanceState.getState().previews).toEqual({}));
  session.show(true);
  expect(screen.queryByRole('region', { name: 'Concordance results' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(concordanceApi.previewConcordance).toHaveBeenCalledOnce();
  session.unmount();
  useConcordanceState.setState({ active: {}, drafts: {}, previews: {} });
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      settings: { preview: { request, analysisId: null } },
      analysis: {
        request_status: { status: 'supported', request: { kind: 'concordance', request: request } },
        id: 'submitted-analysis',
        request,
        has_result: false,
      },
    },
  ]);
  mount();
  await screen.findByRole('textbox', { name: 'Concordance query' });
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(concordanceApi.previewConcordance).toHaveBeenCalledOnce();
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
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Concordance query' })).toHaveValue('cat');
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
});

it('keeps Text options when changing modes and restores Preview fields and document-page counts', async () => {
  useConcordanceState.getState().setDraft(base, tab.id, request);
  vi.mocked(concordanceApi.previewConcordance).mockResolvedValue({ ...page, documentCount: 20 });
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
  const pending = Promise.withResolvers<concordanceApi.ConcordanceAnalysisResult>();
  vi.mocked(concordanceApi.runConcordance).mockReturnValueOnce(pending.promise);
  vi.mocked(concordanceApi.getConcordanceResult).mockResolvedValue(completed);
  vi.mocked(concordanceApi.queryConcordance).mockResolvedValue(page);
  const { client } = mount();
  await waitFor(() => expect(previewButton()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(previewButton());
  await screen.findByRole('button', { name: 'cat', exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  await waitFor(() => expect(concordanceApi.runConcordance).toHaveBeenCalledOnce());
  expect(previewButton()).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(previewButton());
  expect(concordanceApi.previewConcordance).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByRole('textbox', { name: 'Concordance query' }), {
    target: { value: 'dog' },
  });
  await act(async () => {
    pending.resolve(completed);
  });
  await act(async () => {
    client.setQueryData(
      ['native', base, 'tabs', 'concordance'],
      [
        {
          ...tab,
          analysis: {
            request_status: {
              status: 'supported',
              request: { kind: 'concordance', request: request },
            },
            id: 'result',
            request,
            has_result: true,
          },
        },
      ],
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
  await waitFor(() => expect(analysesApi.clearTab).toHaveBeenCalledOnce());
  await act(async () => {
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
    vi.mocked(analysesApi.listTabs).mockResolvedValue([
      {
        ...tab,
        analysis: {
          request_status: {
            status: 'supported',
            request: { kind: 'concordance', request: request },
          },
          id: completed.id,
          request,
          has_result: true,
        },
      },
    ]);
    vi.mocked(concordanceApi.getConcordanceResult).mockResolvedValue({
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
    vi.mocked(concordanceApi.queryConcordance).mockResolvedValue({
      ...page,
      totalRows: count,
      matchCount: count,
    });
    mount();
    const query = await screen.findByRole('textbox', { name: 'Concordance query' });
    const run = screen.getByRole('button', { name: 'Run', exact: true });
    await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(run);
    expect(concordanceApi.runConcordance).not.toHaveBeenCalled();
    fireEvent.change(query, { target: { value: 'dog' } });
    expect(run).toHaveAttribute('aria-disabled', 'false');
    fireEvent.change(query, { target: { value: request.search.query } });
    expect(run).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Highlight L1 / R1' }));
    expect(run).toHaveAttribute('aria-disabled', 'true');
  },
);

it('requires explicit defaults for unsupported requests and retains original JSON until Run', async () => {
  const original = { ...request, future_option: { value: 'future' } };
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      analysis: {
        id: 'unsupported',
        request: original,
        request_status: { status: 'unsupported', reason: 'Unknown field future_option' },
        has_result: false,
      },
    },
  ]);
  mount();
  const reset = await screen.findByRole('button', { name: 'Start with current defaults' });
  expect(previewButton()).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(reset);
  expect(
    screen.queryByRole('button', { name: 'Start with current defaults' }),
  ).not.toBeInTheDocument();
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  expect(original.future_option.value).toBe('future');
});

it('reset creates a local current draft while Clear preserves original unsupported provenance', async () => {
  const original = { ...request, future: 7 };
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      analysis: {
        id: 'submitted-analysis',
        request: original,
        request_status: { status: 'unsupported', reason: 'Unknown field future' },
        has_result: false,
      },
    },
  ]);
  const { client } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Start with current defaults' }));
  act(() =>
    useConcordanceState
      .getState()
      .setDraft(base, tab.id, { ...request, search: { ...request.search, query: 'dog' } }),
  );
  fireEvent.click(previewButton());
  await waitFor(() => expect(concordanceApi.previewConcordance).toHaveBeenCalledOnce());
  expect(vi.mocked(concordanceApi.previewConcordance).mock.calls[0]?.[2]).not.toHaveProperty(
    'future',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.getByRole('complementary', { name: 'Saved settings compatibility' })).toBeVisible();
  expect(client.getQueryData(['native', base, 'tabs', 'concordance'])).toEqual([
    {
      ...tab,
      analysis: {
        id: 'submitted-analysis',
        request: original,
        request_status: { status: 'unsupported', reason: 'Unknown field future' },
        has_result: false,
      },
    },
  ]);
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
});
