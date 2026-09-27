import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Utf8, Float64, Struct, List, vectorFromArray, tableFromArrays } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { refreshProjectQueries } from '@/features/project/projectChanges';
import QuotationFeature from './QuotationFeature';
import { useQuotationState } from './quotationState';
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  listTabs: vi.fn(),
  createTab: vi.fn(),
  deleteTab: vi.fn(),
  nodeSchema: vi.fn(),
  previewQuotation: vi.fn(),
  updateTab: vi.fn(),
  runQuotation: vi.fn(),
  getQuotationResult: vi.fn(),
  queryQuotation: vi.fn(),
  clearTab: vi.fn(),
}));
const base = 'http://quotation';
const tab: api.Tab = {
  id: 'tab',
  kind: 'quotation',
  name: 'Quotation 1',
  position: 0,
  settings: {},
  analysis: null,
};
const request: api.QuotationRequest = {
  input: { source: { schema: 'data', name: 'Corpus' }, column: 'text' },
};
const quote = {
  quote: 'Hello',
  quote_start_idx: 2,
  quote_end_idx: 7,
  speaker: null,
  speaker_start_idx: null,
  speaker_end_idx: null,
  verb: null,
  verb_start_idx: null,
  verb_end_idx: null,
  quote_row_idx: 0,
};
const quoteType = new Struct(
  Object.entries(quote).map(
    ([key, value]) => new Field(key, typeof value === 'string' ? new Utf8() : new Float64(), true),
  ),
);
const page = {
  table: tableFromArrays({
    document_id: [1],
    source: vectorFromArray(
      [{ text: '😀 Hello world' }],
      new Struct([new Field('text', new Utf8())]),
    ),
    quotes: vectorFromArray([[quote]], new List(new Field('item', quoteType))),
  }),
  totalRows: 1,
  documentCount: 1,
  matchCount: 1,
  hasNext: true,
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
const preview = () =>
  within(screen.getByRole('region', { name: 'Quotation request' })).getByRole('button', {
    name: 'Preview',
    exact: true,
  });
beforeEach(() => {
  vi.clearAllMocks();
  useQuotationState.setState({ active: {}, drafts: {}, previews: {} });
  vi.mocked(api.listTabs).mockResolvedValue([tab]);
  vi.mocked(api.createTab).mockResolvedValue(tab);
  vi.mocked(api.nodeSchema).mockResolvedValue([
    { name: 'text', field: new Field('text', new Utf8()) },
  ]);
  vi.mocked(api.previewQuotation).mockResolvedValue(page);
  vi.mocked(api.updateTab).mockImplementation(async (_base, _id, changes) => ({
    ...tab,
    ...changes,
  }));
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <QuotationFeature base={base} nodes={nodes} tasks={[]} active onCancel={vi.fn()} />
        </TooltipProvider>
      </QueryClientProvider>,
    ),
  };
}
it('extracts on explicit Preview, reuses context changes, and invalidates only dependent sources', async () => {
  useQuotationState.getState().setDraft(base, tab.id, request);
  const { client } = mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  expect(api.previewQuotation).not.toHaveBeenCalled();
  fireEvent.click(preview());
  await screen.findByRole('button', { name: 'Inspect document 1' });
  expect(api.previewQuotation).toHaveBeenCalledOnce();
  expect(vi.mocked(api.previewQuotation).mock.calls[0]?.[2].page_size).toBe(50);
  const context = screen.getByRole('spinbutton', { name: 'Quotation context length' });
  fireEvent.change(context, { target: { value: '0' } });
  fireEvent.blur(context);
  await waitFor(() =>
    expect(api.updateTab).toHaveBeenLastCalledWith(base, tab.id, {
      settings: { context: 0 },
    }),
  );
  expect(api.previewQuotation).toHaveBeenCalledOnce();
  await act(() =>
    refreshProjectQueries(client, base, {
      objects: [{ schema: 'data', name: 'Unrelated' }],
    }),
  );
  expect(api.previewQuotation).toHaveBeenCalledOnce();
  await act(() => refreshProjectQueries(client, base, { objects: [request.input.source] }));
  await waitFor(() => expect(api.previewQuotation).toHaveBeenCalledTimes(2));
  vi.mocked(api.previewQuotation).mockRejectedValueOnce(new Error('missing'));
  fireEvent.click(preview());
  await screen.findByText(/Outdated results/);
  expect(screen.getByRole('button', { name: 'Inspect document 1' })).toBeInTheDocument();
});
it('creates the initial tab only on entry, not after closing the last one', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([]);
  const { client } = mount();
  await screen.findByRole('tab', { name: /Quotation 1/ });
  expect(api.createTab).toHaveBeenCalledOnce();
  await act(() => {
    client.setQueryData(['native', base, 'tabs', 'quotation'], []);
  });
  await screen.findByRole('button', { name: 'New Quotation analysis' });
  expect(api.createTab).toHaveBeenCalledOnce();
});

it('keeps request controls usable and reruns after incompatible saved output fails to render', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'broken', request, has_result: true } },
  ]);
  vi.mocked(api.getQuotationResult).mockResolvedValue({
    id: 'broken',
    tab_id: tab.id,
    kind: 'quotation',
    created_at: '',
    request,
    result: { version: 1, payload: null, finished_at: '' },
  } as unknown as api.QuotationAnalysisResult);
  vi.mocked(api.runQuotation).mockRejectedValue(new Error('Test execution failure'));
  try {
    mount();
    await screen.findByText(/Could not display saved results/);
    const rerun = screen.getByRole('button', { name: 'Rerun', exact: true });
    await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.click(rerun);
    await waitFor(() => expect(api.runQuotation).toHaveBeenCalledWith(base, tab.id, request));
  } finally {
    logged.mockRestore();
  }
});
it('cancels request-scoped Preview and suppresses late data', async () => {
  useQuotationState.getState().setDraft(base, tab.id, request);
  let signal: AbortSignal | undefined;
  let resolve: ((value: typeof page) => void) | undefined;
  vi.mocked(api.previewQuotation).mockImplementation((_base, _id, _input, abort) => {
    signal = abort;
    return new Promise((done) => {
      resolve = done;
    });
  });
  mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(preview());
  await waitFor(() => expect(api.previewQuotation).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => {
    resolve?.(page);
    await Promise.resolve();
  });
  expect(screen.queryByRole('button', { name: 'Inspect document 1' })).not.toBeInTheDocument();
  expect(api.runQuotation).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Quotation results' })).not.toBeInTheDocument();
});

it.each([0, 1])(
  'blocks saved requests with %i matches until parameters change or results clear',
  async (count) => {
    vi.mocked(api.nodeSchema).mockResolvedValue(
      ['text', 'other'].map((name) => ({ name, field: new Field(name, new Utf8()) })),
    );
    vi.mocked(api.listTabs).mockResolvedValue([
      { ...tab, analysis: { id: 'result', request, has_result: true } },
    ]);
    vi.mocked(api.getQuotationResult).mockResolvedValue({
      id: 'result',
      tab_id: tab.id,
      kind: 'quotation',
      created_at: '',
      request,
      result: {
        version: 1,
        payload: {
          input: request.input,
          columns: [['text', 'VARCHAR']],
          documents: 'documents',
          matches: 'matches',
          projection: 'projection',
          document_count: 1,
          matching_documents: count,
          match_count: count,
        },
        finished_at: '',
      },
    });
    vi.mocked(api.queryQuotation).mockResolvedValue(page);
    const { client } = mount();
    await screen.findByRole('button', { name: 'Inspect document 1' });
    const run = screen.getByRole('button', { name: 'Run', exact: true });
    expect(run).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(run);
    expect(api.runQuotation).not.toHaveBeenCalled();
    act(() =>
      useQuotationState
        .getState()
        .setDraft(base, tab.id, { input: { ...request.input, column: 'other' } }),
    );
    await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
    // Restore the execution request without persisting any dirty state.
    act(() => useQuotationState.getState().setDraft(base, tab.id, request));
    expect(run).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
    await waitFor(() => expect(api.clearTab).toHaveBeenCalled());
    await act(() => {
      client.setQueryData(['native', base, 'tabs', 'quotation'], [tab]);
    });
    await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
    await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.click(preview());
    await waitFor(() => expect(api.previewQuotation).toHaveBeenCalled());
    expect(vi.mocked(api.previewQuotation).mock.calls[0]?.[2].input).toEqual(request.input);
  },
);

it('ignores legacy Preview on reload and restores the saved Run request only', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    {
      ...tab,
      settings: { preview: { request, analysisId: null } },
      analysis: { id: 'submitted-analysis', request, has_result: false },
    },
  ]);
  mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  expect(api.previewQuotation).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Quotation results' })).not.toBeInTheDocument();
  fireEvent.click(preview());
  await screen.findByRole('button', { name: 'Inspect document 1' });
  expect(api.updateTab).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.queryByRole('region', { name: 'Quotation results' })).not.toBeInTheDocument();
});

it('expands Preview documents into individual quotations without extracting again', async () => {
  useQuotationState.getState().setDraft(base, tab.id, request);
  vi.mocked(api.previewQuotation).mockResolvedValue({
    ...page,
    matchCount: 2,
    table: tableFromArrays({
      document_id: [1],
      source: vectorFromArray(
        [{ text: '😀 Hello world' }],
        new Struct([new Field('text', new Utf8())]),
      ),
      quotes: vectorFromArray(
        [[quote, { ...quote, quote_row_idx: 1 }]],
        new List(new Field('item', quoteType)),
      ),
    }),
  });
  mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(preview());
  await screen.findByRole('button', { name: 'Inspect document 1' });
  expect(screen.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Quotations', exact: true }));
  expect(screen.getByRole('tab', { name: 'Quotations', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getAllByRole('button', { name: 'Inspect document 1' })).toHaveLength(2);
  expect(api.previewQuotation).toHaveBeenCalledOnce();
  expect(screen.getByText('Documents per page')).toBeInTheDocument();
});

it('selects result columns in a popup without recalculating Preview', async () => {
  useQuotationState.getState().setDraft(base, tab.id, request);
  mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(preview());
  await screen.findByRole('button', { name: 'Inspect document 1' });
  const results = within(screen.getByRole('region', { name: 'Quotation results' }));
  expect(results.queryByRole('button', { name: 'Preview', exact: true })).not.toBeInTheDocument();
  expect(results.queryByRole('button', { name: 'Saved results' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'quote', exact: true })).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(results.getByRole('button', { name: 'Metadata and fields (0)' }));
  const popup = screen.getByRole('dialog', { name: 'Quotation result columns' });
  await user.click(within(popup).getByRole('checkbox', { name: 'quote', exact: true }));
  await user.keyboard('{Escape}');
  expect(popup).not.toBeInTheDocument();
  await results.findByRole('columnheader', { name: 'quote', exact: true });
  expect(api.previewQuotation).toHaveBeenCalledOnce();
});

it('restores supported fields, retaining compatibility warnings through Preview', async () => {
  const incompatible = { ...request, future_option: true };
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'submitted-analysis', request: incompatible, has_result: false } },
  ]);
  mount();
  expect(await screen.findByText('These saved settings are not recognized:')).toBeInTheDocument();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(preview());
  await waitFor(() => expect(api.previewQuotation).toHaveBeenCalled());
  expect(vi.mocked(api.previewQuotation).mock.calls[0]?.[2]).not.toHaveProperty('future_option');
  expect(screen.getByText('These saved settings are not recognized:')).toBeInTheDocument();
  expect(api.updateTab).not.toHaveBeenCalled();
});
