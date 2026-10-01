import { TooltipProvider } from '@/components/ui/tooltip';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as concordanceApi from '@/features/tools/concordance/api';
import * as downloads from '@/lib/download';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Float64, List, Struct, tableFromArrays, Utf8, vectorFromArray } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import * as chartExport from '../common/chartExport';
import { ConcordanceResults } from './ConcordanceResults';
import { emptyConcordance } from './concordanceState';
vi.mock('../common/captureChart', () => ({
  captureChart: (host: HTMLElement) => host.querySelector('svg')!.cloneNode(true),
}));

vi.mock('./ConcordanceChart', () => ({
  ConcordanceChart: ({
    onSelect,
    toolbarStart,
    toolbarEnd,
  }: {
    onSelect?: (index: number, shift: boolean) => void;
    toolbarStart: React.ReactNode;
    toolbarEnd: React.ReactNode;
  }) => (
    <div data-testid="chart">
      {toolbarStart}
      {toolbarEnd}
      <div aria-roledescription="interactive chart">
        <svg width="600" height="240">
          <path d="M0,0L10,10" />
        </svg>
      </div>
      <button
        disabled={!onSelect}
        onClick={() => {
          onSelect?.(0, false);
        }}
      >
        Select first bin
      </button>
    </div>
  ),
}));
vi.mock('@/features/tools/concordance/api', async (original) => ({
  ...(await original<object>()),
  queryConcordance: vi.fn(),
  previewConcordance: vi.fn(),
  concordanceDensity: vi.fn(),
}));
vi.mock('@/features/tools/common/analysisApi', async (original) => ({
  ...(await original<object>()),
}));
const input = {
  source: { schema: 'data', name: 'Corpus' },
  column: 'text',
  tokenizer: null,
};
const request = {
  ...emptyConcordance,
  inputs: [input],
  search: { ...emptyConcordance.search, query: 'cat' },
};
const hit = {
  match_order: 0,
  left_context: '',
  matched_text: 'cat',
  right_context: ' dog',
  start_idx: 0,
  end_idx: 3,
  l1: '',
  r1: 'dog',
  l1_frequency: 1,
  r1_frequency: 1,
  extraction: 'cat dog',
};
const page = {
  table: tableFromArrays({
    document_id: [1],
    source: vectorFromArray([{ text: 'cat dog' }], new Struct([new Field('text', new Utf8())])),
    matches: vectorFromArray(
      [[hit]],
      new List(
        new Field(
          'item',
          new Struct(
            Object.entries(hit).map(
              ([name, value]) =>
                new Field(name, typeof value === 'number' ? new Float64() : new Utf8()),
            ),
          ),
        ),
      ),
    ),
  }),
  totalRows: 1,
  documentCount: 1,
  matchCount: 1,
  hasNext: false,
};
const result: concordanceApi.ConcordanceAnalysisResult = {
  request_status: { status: 'supported', request: { kind: 'concordance', request: request } },
  id: 'result1',
  tab_id: 'tab',
  kind: 'concordance',
  created_at: '',
  request,
  result: {
    version: 1,
    payload: {
      corpora: [
        {
          input,
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
const tab: analysesApi.Tab = {
  id: 'tab',
  kind: 'concordance',
  name: 'Concordance 1',
  position: 0,
  settings: { presentation: 'dispersion' },
  analysis: {
    request_status: { status: 'supported', request: { kind: 'concordance', request: request } },
    id: result.id,
    request,
    has_result: true,
  },
};
const onSettings = vi.fn();
function Harness({
  savedResult = result,
  mode,
}: {
  savedResult?: concordanceApi.ConcordanceAnalysisResult;
  mode: 'preview' | 'saved';
}) {
  return (
    <ConcordanceResults
      base="http://test"
      tab={tab}
      result={savedResult}
      submitted={{ request: savedResult.request, generation: 1 }}
      draft={savedResult.request}
      active
      stopped={false}
      view={mode}
      colors={{}}
      editing={false}
      onSettings={onSettings}
    />
  );
}
function mount(initialResult = result, mode: 'preview' | 'saved' = 'saved') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (savedResult = initialResult) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Harness savedResult={savedResult} mode={mode} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { client, ...view, replace: () => view.rerender(tree({ ...result, id: 'result2' })) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(concordanceApi.queryConcordance).mockResolvedValue(page);
  vi.mocked(concordanceApi.previewConcordance).mockResolvedValue(page);
  vi.mocked(concordanceApi.concordanceDensity).mockResolvedValue(
    tableFromArrays({ term: ['cat'], bin: [0], count: [1] }),
  );
});
it('uses presentation tabs and a dismissible metadata popup without a Preview/Saved switch', async () => {
  const corpus = result.result.payload.corpora[0]!;
  mount({
    ...result,
    result: {
      version: 1,
      finished_at: '',
      payload: { corpora: [{ ...corpus, columns: [...corpus.columns, ['category', 'VARCHAR']] }] },
    },
  });
  await screen.findByTestId('dispersion-documents');
  expect(screen.queryByRole('button', { name: 'Saved results' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Preview', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'category' })).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Metadata (0)' }));
  const popup = screen.getByRole('dialog', { name: 'Concordance metadata columns' });
  await user.click(within(popup).getByRole('checkbox', { name: 'category' }));
  await user.keyboard('{Escape}');
  expect(popup).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Metadata (1)' })).toHaveFocus();
  await user.click(screen.getByRole('tab', { name: 'Table', exact: true }));
  expect(screen.getByRole('tab', { name: 'Table', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await screen.findByRole('columnheader', { name: /category/ });
});
it('puts document rows and pagination before the legend and summary; proportional hides only the chart', async () => {
  mount();
  const chart = await screen.findByTestId('chart');
  const docs = screen.getByTestId('dispersion-documents');
  const legend = screen.getByRole('button', { name: 'cat (1)' });
  expect(docs.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(legend.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Select first bin' }));
  await screen.findByRole('button', { name: 'cat (1/1)' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Bar length proportional to text length' }));
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clear selection' })).toBeEnabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Bar length proportional to text length' }));
  expect(screen.getByRole('button', { name: 'cat (1/1)' })).toBeInTheDocument();
  expect(concordanceApi.concordanceDensity).toHaveBeenCalledOnce();
});
it('keeps filters in saved Dispersion only and resets them on replacement, without refetching density', async () => {
  const view = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'cat (1)' }));
  await waitFor(() =>
    expect(concordanceApi.queryConcordance).toHaveBeenLastCalledWith(
      'http://test',
      'result1',
      expect.objectContaining({ filter: expect.objectContaining({ excluded_terms: ['cat'] }) }),
      expect.anything(),
    ),
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Table', exact: true }));
  await waitFor(() =>
    expect(concordanceApi.queryConcordance).toHaveBeenLastCalledWith(
      'http://test',
      'result1',
      expect.objectContaining({
        projection: 'matches',
        filter: expect.objectContaining({ excluded_terms: [], bins: [] }),
      }),
      expect.anything(),
    ),
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Dispersion', exact: true }));
  expect(screen.getByRole('button', { name: 'cat (1)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Preview', exact: true })).not.toBeInTheDocument();
  expect(concordanceApi.previewConcordance).not.toHaveBeenCalled();
  expect(concordanceApi.concordanceDensity).toHaveBeenCalledOnce();
  fireEvent.click(await screen.findByRole('button', { name: 'Select first bin' }));
  await screen.findByRole('button', { name: 'cat (1/1)' });
  view.replace();
  await screen.findByRole('button', { name: 'cat (1)' });
  expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
});
it('retains density after a failed refresh and disables exports', async () => {
  const { client } = mount();
  await screen.findByTestId('chart');
  vi.mocked(concordanceApi.concordanceDensity).mockRejectedValue(new Error('unavailable'));
  await act(() =>
    client.invalidateQueries({
      queryKey: ['native', 'http://test', 'analyses', 'result1', 'density'],
    }),
  );
  await screen.findByText(/The chart is outdated/);
  expect(screen.getByTestId('chart')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download chart' })).toBeDisabled();
});

it.each(['preview', 'saved'] as const)(
  'combines %s pages locally without queries, density refetches or preference writes',
  async (mode) => {
    const second = { ...input, source: { ...input.source, name: 'Second' } };
    const corpus = result.result.payload.corpora[0]!;
    mount(
      {
        ...result,
        request: { ...request, inputs: [input, second] },
        result: {
          version: 1,
          finished_at: '',
          payload: { corpora: [corpus, { ...corpus, input: second }] },
        },
        request_status: {
          status: 'supported',
          request: { kind: 'concordance', request: { ...request, inputs: [input, second] } },
        },
      },
      mode,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'cat (1)' })).toHaveLength(2));
    const before = {
      preview: vi.mocked(concordanceApi.previewConcordance).mock.calls.length,
      query: vi.mocked(concordanceApi.queryConcordance).mock.calls.length,
      density: vi.mocked(concordanceApi.concordanceDensity).mock.calls.length,
    };
    expect(before).toEqual(
      mode === 'saved'
        ? { preview: 0, query: 2, density: 2 }
        : { preview: 2, query: 0, density: 0 },
    );
    const user = userEvent.setup();
    const layout = screen.getByRole('tablist', { name: 'Concordance source layout' });
    const separated = within(layout).getByRole('tab', { name: 'Separated' });
    const combined = within(layout).getByRole('tab', { name: 'Combined' });
    expect(separated).toHaveAttribute('aria-selected', 'true');
    expect(separated).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
    await user.click(combined);
    expect(combined).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('dispersion-documents')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'cat (2)' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(separated).toHaveFocus();
    expect(separated).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('dispersion-documents')).toHaveLength(2);
    expect(concordanceApi.previewConcordance).toHaveBeenCalledTimes(before.preview);
    expect(concordanceApi.queryConcordance).toHaveBeenCalledTimes(before.query);
    expect(concordanceApi.concordanceDensity).toHaveBeenCalledTimes(before.density);
    expect(onSettings).not.toHaveBeenCalled();
  },
);

it('shares term visibility but keeps separated and combined bin selections independent', async () => {
  const second = { ...input, source: { ...input.source, name: 'Second' } };
  const corpus = result.result.payload.corpora[0];
  if (!corpus) throw new Error('fixture missing');
  mount({
    ...result,
    request: { ...request, inputs: [input, second] },
    result: {
      version: 1,
      finished_at: '',
      payload: { corpora: [corpus, { ...corpus, input: second }] },
    },
    request_status: {
      status: 'supported',
      request: { kind: 'concordance', request: { ...request, inputs: [input, second] } },
    },
  });
  const controls = await screen.findAllByRole('button', { name: 'Select first bin' });
  await waitFor(() => expect(controls[0]).toBeEnabled());
  fireEvent.click(controls[0]!);
  await screen.findByRole('button', { name: 'cat (1/1)' });
  expect(screen.getByRole('button', { name: 'cat (1)' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'cat (1/1)' }));
  expect(screen.getByRole('button', { name: 'cat (1)' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('tab', { name: 'Combined', exact: true }));
  expect(await screen.findByRole('button', { name: 'cat (2)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
  await userEvent.click(screen.getByRole('tab', { name: 'Separated', exact: true }));
  expect(await screen.findByRole('button', { name: 'cat (1/1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(concordanceApi.concordanceDensity).toHaveBeenCalledTimes(2);
});

it('captures the displayed SVG with source, scope, query and colored legend before saving', async () => {
  const user = userEvent.setup();
  const encoded = new Blob(['image'], { type: 'image/svg+xml' });
  const build = vi.spyOn(chartExport, 'buildChartExport').mockResolvedValue(encoded);
  const save = vi.spyOn(downloads, 'saveGeneratedExport').mockResolvedValue('saved.svg');
  mount();
  await user.click(await screen.findByRole('button', { name: 'Download chart' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Chart download format' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(await screen.findByRole('option', { name: 'SVG' }));
  await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(encoded, 'concordance-line.svg'));
  expect(build).toHaveBeenCalledWith(expect.any(SVGSVGElement), 'svg');
  const svg = build.mock.calls[0]?.[0];
  expect(svg?.textContent).toContain('Concordance: cat');
  expect(svg?.textContent).toContain('Corpus');
  expect(svg?.textContent).toContain('Complete saved result');
  expect(svg?.textContent).toContain('cat (1)');
  expect(svg?.outerHTML).toContain('d="M0,0L10,10"');
  build.mockRestore();
  save.mockRestore();
});

it('keeps initial loading outside Results and offers Retry on projection failure', async () => {
  const pending = Promise.withResolvers<typeof page>();
  vi.mocked(concordanceApi.queryConcordance).mockReturnValueOnce(pending.promise);
  mount();
  await screen.findByRole('region', { name: 'Analysis progress' });
  expect(screen.queryByRole('region', { name: 'Concordance results' })).not.toBeInTheDocument();
  await act(async () => pending.reject(new Error('Read failed')));
  await screen.findByRole('alert');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('region', { name: 'Concordance results' });
  expect(screen.queryByRole('region', { name: 'Analysis progress' })).not.toBeInTheDocument();
});
it('keeps the Results card mounted when another presentation is loading', async () => {
  mount();
  const card = await screen.findByRole('region', { name: 'Concordance results' });
  await screen.findByTestId('dispersion-documents');
  const pending = Promise.withResolvers<typeof page>();
  vi.mocked(concordanceApi.queryConcordance).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('tab', { name: 'Table', exact: true }));
  expect(screen.getByRole('region', { name: 'Concordance results' })).toBe(card);
  expect(screen.queryByRole('region', { name: 'Analysis progress' })).not.toBeInTheDocument();
  await act(async () => pending.resolve(page));
});
