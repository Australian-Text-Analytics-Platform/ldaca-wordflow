import { TooltipProvider } from '@/components/ui/tooltip';
import * as projectApi from '@/features/project/api';
import { refreshProjectQueries } from '@/features/project/projectChanges';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as quotationApi from '@/features/tools/quotation/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Float64, List, Struct, tableFromArrays, Utf8, vectorFromArray } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import QuotationFeature from './QuotationFeature';
import { useQuotationState } from './quotationState';
vi.mock('@/features/tools/common/analysisApi', async (original) => ({
  ...(await original<object>()),
  listTabs: vi.fn(),
  createTab: vi.fn(),
  deleteTab: vi.fn(),
  updateTab: vi.fn(),
  clearTab: vi.fn(),
}));
vi.mock('@/features/tools/quotation/api', async (original) => ({
  ...(await original<object>()),
  previewQuotation: vi.fn(),
  runQuotation: vi.fn(),
  resumeQuotation: vi.fn(),
  getQuotationResult: vi.fn(),
  queryQuotation: vi.fn(),
}));
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<object>()),
  nodeSchema: vi.fn(),
}));
const base = 'http://quotation';
const tab: analysesApi.Tab = {
  id: 'tab',
  kind: 'quotation',
  name: 'Quotation 1',
  position: 0,
  settings: {},
  analysis: null,
};
const request: quotationApi.QuotationRequest = {
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
const preview = () =>
  within(screen.getByRole('region', { name: 'Quotation request' })).getByRole('button', {
    name: 'Preview',
    exact: true,
  });
beforeEach(() => {
  vi.clearAllMocks();
  useQuotationState.setState({ active: {}, drafts: {}, previews: {} });
  vi.mocked(analysesApi.listTabs).mockResolvedValue([tab]);
  vi.mocked(analysesApi.createTab).mockResolvedValue(tab);
  vi.mocked(projectApi.nodeSchema).mockResolvedValue([
    { name: 'text', field: new Field('text', new Utf8()) },
  ]);
  vi.mocked(quotationApi.previewQuotation).mockResolvedValue(page);
  vi.mocked(analysesApi.updateTab).mockImplementation(async (_base, _id, changes) => ({
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
  expect(quotationApi.previewQuotation).not.toHaveBeenCalled();
  fireEvent.click(preview());
  await screen.findByRole('button', { name: 'Inspect document 1' });
  expect(quotationApi.previewQuotation).toHaveBeenCalledOnce();
  expect(vi.mocked(quotationApi.previewQuotation).mock.calls[0]?.[2].page_size).toBe(50);
  const context = screen.getByRole('spinbutton', { name: 'Quotation context length' });
  fireEvent.change(context, { target: { value: '0' } });
  fireEvent.blur(context);
  await waitFor(() =>
    expect(analysesApi.updateTab).toHaveBeenLastCalledWith(base, tab.id, {
      settings: { context: 0 },
    }),
  );
  expect(quotationApi.previewQuotation).toHaveBeenCalledOnce();
  await act(() =>
    refreshProjectQueries(client, base, {
      objects: [{ schema: 'data', name: 'Unrelated' }],
    }),
  );
  expect(quotationApi.previewQuotation).toHaveBeenCalledOnce();
  await act(() => refreshProjectQueries(client, base, { objects: [request.input.source] }));
  await waitFor(() => expect(quotationApi.previewQuotation).toHaveBeenCalledTimes(2));
  vi.mocked(quotationApi.previewQuotation).mockRejectedValueOnce(new Error('missing'));
  fireEvent.click(preview());
  await screen.findByText(/Outdated results/);
  expect(screen.getByRole('button', { name: 'Inspect document 1' })).toBeInTheDocument();
});
it('creates the initial tab only on entry, not after closing the last one', async () => {
  vi.mocked(analysesApi.listTabs).mockResolvedValue([]);
  const { client } = mount();
  await screen.findByRole('tab', { name: /Quotation 1/ });
  expect(analysesApi.createTab).toHaveBeenCalledOnce();
  await act(async () => {
    client.setQueryData(['native', base, 'tabs', 'quotation'], []);
  });
  await screen.findByRole('button', { name: 'New Quotation analysis' });
  expect(analysesApi.createTab).toHaveBeenCalledOnce();
});

it('keeps request controls usable and reruns after incompatible saved output fails to render', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      analysis: {
        request_status: { status: 'supported', request: { kind: 'quotation', request: request } },
        id: 'broken',
        request,
        has_result: true,
      },
    },
  ]);
  vi.mocked(quotationApi.getQuotationResult).mockResolvedValue({
    analysis: {
      request_status: { status: 'supported', request: { kind: 'quotation', request: request } },
      id: 'broken',
      tab_id: tab.id,
      kind: 'quotation',
      created_at: '',
      request,
      result: { version: 1, payload: null, finished_at: '' },
    },
    version: 1,
    manifest: null,
    partial: null,
  } as unknown as quotationApi.QuotationAnalysisResult);
  vi.mocked(quotationApi.runQuotation).mockRejectedValue(new Error('Test execution failure'));
  try {
    mount();
    await screen.findByText(/Could not display saved results/);
    const rerun = screen.getByRole('button', { name: 'Rerun', exact: true });
    await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.click(rerun);
    await waitFor(() =>
      expect(quotationApi.runQuotation).toHaveBeenCalledWith(base, tab.id, request),
    );
  } finally {
    logged.mockRestore();
  }
});
it('cancels request-scoped Preview and suppresses late data', async () => {
  useQuotationState.getState().setDraft(base, tab.id, request);
  let signal: AbortSignal | undefined;
  let resolve: ((value: typeof page) => void) | undefined;
  vi.mocked(quotationApi.previewQuotation).mockImplementation((_base, _id, _input, abort) => {
    signal = abort;
    return new Promise((done) => {
      resolve = done;
    });
  });
  mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(preview());
  await waitFor(() => expect(quotationApi.previewQuotation).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => {
    resolve?.(page);
    await Promise.resolve();
  });
  expect(screen.queryByRole('button', { name: 'Inspect document 1' })).not.toBeInTheDocument();
  expect(quotationApi.runQuotation).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Quotation results' })).not.toBeInTheDocument();
});

it.each([0, 1])(
  'blocks saved requests with %i matches until parameters change or results clear',
  async (count) => {
    vi.mocked(projectApi.nodeSchema).mockResolvedValue(
      ['text', 'other'].map((name) => ({ name, field: new Field(name, new Utf8()) })),
    );
    vi.mocked(analysesApi.listTabs).mockResolvedValue([
      {
        ...tab,
        analysis: {
          request_status: { status: 'supported', request: { kind: 'quotation', request: request } },
          id: 'result',
          request,
          has_result: true,
        },
      },
    ]);
    vi.mocked(quotationApi.getQuotationResult).mockResolvedValue({
      analysis: {
        request_status: { status: 'supported', request: { kind: 'quotation', request: request } },
        id: 'result',
        tab_id: tab.id,
        kind: 'quotation',
        created_at: '',
        request,
        result: null,
      },
      version: 1,
      partial: null,
      manifest: {
        input: request.input,
        columns: [['text', 'VARCHAR']],
        documents: 'documents',
        matches: 'matches',
        projection: 'projection',
        document_count: 1,
        matching_documents: count,
        match_count: count,
      },
    });
    vi.mocked(quotationApi.queryQuotation).mockResolvedValue(page);
    const { client } = mount();
    await screen.findByRole('button', { name: 'Inspect document 1' });
    const run = screen.getByRole('button', { name: 'Run', exact: true });
    expect(run).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(run);
    expect(quotationApi.runQuotation).not.toHaveBeenCalled();
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
    await waitFor(() => expect(analysesApi.clearTab).toHaveBeenCalled());
    await act(async () => {
      client.setQueryData(['native', base, 'tabs', 'quotation'], [tab]);
    });
    await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
    await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.click(preview());
    await waitFor(() => expect(quotationApi.previewQuotation).toHaveBeenCalled());
    expect(vi.mocked(quotationApi.previewQuotation).mock.calls[0]?.[2].input).toEqual(
      request.input,
    );
  },
);

it('ignores legacy Preview on reload and restores the saved Run request only', async () => {
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...tab,
      settings: { preview: { request, analysisId: null } },
      analysis: {
        request_status: { status: 'supported', request: { kind: 'quotation', request: request } },
        id: 'submitted-analysis',
        request,
        has_result: false,
      },
    },
  ]);
  mount();
  await waitFor(() => expect(preview()).toHaveAttribute('aria-disabled', 'false'));
  expect(quotationApi.previewQuotation).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Quotation results' })).not.toBeInTheDocument();
  fireEvent.click(preview());
  await screen.findByRole('button', { name: 'Inspect document 1' });
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.queryByRole('region', { name: 'Quotation results' })).not.toBeInTheDocument();
});

it('expands Preview documents into individual quotations without extracting again', async () => {
  useQuotationState.getState().setDraft(base, tab.id, request);
  vi.mocked(quotationApi.previewQuotation).mockResolvedValue({
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
  expect(quotationApi.previewQuotation).toHaveBeenCalledOnce();
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
  expect(quotationApi.previewQuotation).toHaveBeenCalledOnce();
});

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
  expect(preview()).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(reset);
  expect(
    screen.queryByRole('button', { name: 'Start with current defaults' }),
  ).not.toBeInTheDocument();
  expect(analysesApi.updateTab).not.toHaveBeenCalled();
  expect(original.future_option.value).toBe('future');
});

it('keeps the current page through partial refresh, Resume and completion', async () => {
  const user = userEvent.setup();
  const partial = { checked_texts: 8, total_texts: 100 };
  const summary: analysesApi.Tab = {
    ...tab,
    analysis: {
      id: 'partial',
      created_at: '',
      request,
      request_status: { status: 'supported', request: { kind: 'quotation', request } },
      has_result: false,
      quotation_partial: partial,
    },
  };
  const output: quotationApi.QuotationAnalysisResult = {
    analysis: {
      id: 'partial',
      tab_id: tab.id,
      kind: 'quotation',
      created_at: '',
      request,
      request_status: summary.analysis!.request_status,
      result: null,
    },
    version: 2,
    manifest: {
      input: request.input,
      columns: [['text', 'VARCHAR']],
      documents: 'documents',
      matches: 'matches',
      projection: 'projection',
      document_count: 8,
      matching_documents: 8,
      match_count: 45,
      processed_column: 'text',
    },
    partial,
  };
  vi.mocked(analysesApi.listTabs).mockResolvedValue([summary]);
  vi.mocked(quotationApi.getQuotationResult).mockResolvedValue(output);
  vi.mocked(quotationApi.queryQuotation).mockResolvedValue({ ...page, totalRows: 45 });
  let complete: (() => void) | undefined;
  vi.mocked(quotationApi.resumeQuotation).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = () =>
          resolve({
            ...output.analysis,
            result: { version: 2, payload: output.manifest, finished_at: '' },
          });
      }),
  );
  const { client } = mount();
  await screen.findByRole('region', { name: 'Quotation results' });
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  await waitFor(() =>
    expect(vi.mocked(quotationApi.queryQuotation).mock.lastCall?.[2].page).toBe(2),
  );
  expect(screen.getByRole('combobox', { name: 'Quotations per page' })).toHaveValue('20');
  await user.click(screen.getByRole('button', { name: 'Resume', exact: true }));
  await waitFor(() =>
    expect(quotationApi.resumeQuotation).toHaveBeenCalledWith(base, tab.id, request),
  );
  expect(screen.getByRole('region', { name: 'Quotation results' })).toBeInTheDocument();
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['native', base, 'analyses', 'partial'] });
  });
  expect(vi.mocked(quotationApi.queryQuotation).mock.lastCall?.[2].page).toBe(2);
  vi.mocked(analysesApi.listTabs).mockResolvedValue([
    {
      ...summary,
      analysis: { ...summary.analysis!, has_result: true, quotation_partial: undefined },
    },
  ]);
  vi.mocked(quotationApi.getQuotationResult).mockResolvedValue({ ...output, partial: null });
  await act(async () => {
    complete?.();
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Resume', exact: true })).not.toBeInTheDocument(),
  );
  expect(vi.mocked(quotationApi.queryQuotation).mock.lastCall?.[2].page).toBe(2);
});
