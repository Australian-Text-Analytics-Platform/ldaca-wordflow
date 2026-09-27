import { TooltipProvider } from '@/components/ui/tooltip';
import { useConcordanceState, concordanceKey } from '../concordance/concordanceState';
import { useFrequencyState } from './frequencyState';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { tableFromArrays } from 'apache-arrow';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import type { FrequencyAnalysisResult, Tab, FrequencyQuery } from '@/features/project/api';
import { FrequencyResults } from './FrequencyResults';
import { FrequencyCorpusCloud, FrequencyJuxtorpusCloud } from './FrequencyCharts';

vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('./FrequencyCharts', () => ({
  FrequencyCorpusCloud: vi.fn(() => <div>Cloud</div>),
  FrequencyJuxtorpusCloud: vi.fn(() => <div>Juxtorpus</div>),
}));
vi.mock('@/features/project/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  queryFrequency: vi.fn(),
  createTab: vi.fn(),
  updateTab: vi.fn(),
  exportFrequency: vi.fn(),
}));
const base = 'http://project';
const tab: Tab = {
  id: 'tab',
  kind: 'frequency',
  name: 'Frequency',
  position: 0,
  settings: { display: 'list', listLimit: 50 },
  analysis: { id: 'result', request: null, has_result: true },
};
const result: FrequencyAnalysisResult = {
  id: 'result',
  tab_id: tab.id,
  kind: 'frequency',
  created_at: '2026-01-01',
  request: {
    inputs: [
      {
        source: { schema: 'data', name: 'Corpus' },
        column: 'text',
        tokenizer: 'plain_words',
      },
    ],
  },
  result: {
    version: 1,
    payload: {
      corpora: [
        {
          source: { schema: 'data', name: 'Corpus' },
          column: 'text',
          tokenizer: 'plain_words',
          label: 'Corpus',
          color: '#2563eb',
          artifact_id: 'artifact',
          document_count: '2',
          total_tokens: '9007199254740993',
          vocabulary_size: '1',
        },
      ],
      comparison_artifact_id: null,
    },
    finished_at: '2026-01-01',
  },
};
const rows = {
  table: tableFromArrays({ token: ['alpha'], frequency: [9007199254740993n] }),
  totalRows: 1,
};
let persisted = tab;
function Harness({
  editing,
  saved = result,
}: {
  editing: boolean;
  saved?: FrequencyAnalysisResult;
}) {
  const tabs = useQuery({
    queryKey: ['native', base, 'tabs', 'frequency'],
    queryFn: () => [persisted],
    initialData: [persisted],
  });
  return (
    <FrequencyResults
      base={base}
      tab={tabs.data[0] ?? tab}
      result={saved}
      outdated={false}
      active
      editing={editing}
      nodes={[]}
      inputs={saved.request.inputs}
    />
  );
}
function mount(editing = false, saved = result) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <Harness editing={editing} saved={saved} />
        </TooltipProvider>
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(384);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(500);
  persisted = structuredClone(tab);
  useFrequencyState.setState({ display: {} });
  useConcordanceState.setState({ active: {}, drafts: {}, previews: {} });
  useFrequencyState.getState().setDisplay(base, tab.id, { display: 'list', listLimit: 50 });
  vi.mocked(api.queryFrequency).mockResolvedValue(rows);
  vi.mocked(api.updateTab).mockImplementation(async (_base, _id, update) => {
    persisted = { ...persisted, ...update };
    return persisted;
  });
  vi.mocked(api.exportFrequency).mockResolvedValue('Corpus.csv');
});
afterEach(() => vi.restoreAllMocks());
it('retains decoded projection rows through unrelated renders and unchanged refreshes', async () => {
  useFrequencyState.getState().setDisplay(base, tab.id, { display: 'cloud' });
  const { client, rerender } = mount();
  await waitFor(() => expect(FrequencyCorpusCloud).toHaveBeenCalled());
  const cloudRows = () => vi.mocked(FrequencyCorpusCloud).mock.calls.at(-1)?.[0].rows;
  await waitFor(() =>
    expect(cloudRows()).toEqual([{ token: 'alpha', frequency: 9007199254740993n }]),
  );
  const original = cloudRows();
  rerender(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Harness editing />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  expect(cloudRows()).toBe(original);
  expect(api.queryFrequency).toHaveBeenCalledOnce();

  vi.mocked(api.queryFrequency).mockResolvedValue({
    table: tableFromArrays({ token: ['alpha'], frequency: [9007199254740993n] }),
    totalRows: 1,
  });
  await act(() => client.refetchQueries({ queryKey: ['native', base, 'analyses'] }));
  expect(cloudRows()).toBe(original);

  vi.mocked(api.queryFrequency).mockResolvedValue({
    table: tableFromArrays({ token: ['beta'], frequency: [2n] }),
    totalRows: 1,
  });
  await act(() => client.refetchQueries({ queryKey: ['native', base, 'analyses'] }));
  await waitFor(() => expect(cloudRows()).toEqual([{ token: 'beta', frequency: 2n }]));
  expect(cloudRows()).not.toBe(original);
});
it('shows exact saved totals and exports the complete filtered list independently of display limits', async () => {
  mount();
  await screen.findByText('alpha');
  expect(screen.getByText(BigInt('9007199254740993').toLocaleString())).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Export Corpus list' }));
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
  await waitFor(() =>
    expect(api.exportFrequency).toHaveBeenCalledWith(
      base,
      result.id,
      { view: 'corpus', corpus_index: 0, filter: '', stopword_source: undefined },
      'csv',
      'Corpus.csv',
    ),
  );
});
it('keeps preceding rows but disables exports until the current filter finishes', async () => {
  mount();
  await screen.findByText('alpha');
  const replacement = Promise.withResolvers<typeof rows>();
  vi.mocked(api.queryFrequency).mockImplementation((_base, _id, query: FrequencyQuery) =>
    query.filter ? replacement.promise : Promise.resolve(rows),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter tokens' }), {
    target: { value: 'beta*' },
  });
  await waitFor(() =>
    expect(api.queryFrequency).toHaveBeenCalledWith(
      base,
      result.id,
      expect.objectContaining({ filter: 'beta*' }),
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByText('alpha')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export Corpus list' })).toBeDisabled();
  await act(async () =>
    replacement.resolve({
      table: tableFromArrays({ token: ['beta'], frequency: [3n] }),
      totalRows: 1,
    }),
  );
  await screen.findByText('beta');
  expect(screen.getByRole('button', { name: 'Export Corpus list' })).toBeEnabled();
});
it('keeps saved reads and exports available during editing without preference writes', async () => {
  mount(true);
  await screen.findByText('alpha');
  expect(screen.getByRole('textbox', { name: 'Filter tokens' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Word clouds' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Export Corpus list' })).toBeEnabled();
  expect(api.updateTab).not.toHaveBeenCalled();
});

it('keeps every character during rapid typing and keeps browsing settings local after complete entry', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText('alpha');
  const filter = screen.getByRole('textbox', { name: 'Filter tokens' });
  await user.type(filter, 'a*');
  expect(filter).toHaveValue('a*');
  await waitFor(() =>
    expect(api.queryFrequency).toHaveBeenCalledWith(
      base,
      result.id,
      expect.objectContaining({ filter: 'a*' }),
      expect.any(AbortSignal),
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Word clouds' }));
  const limit = await screen.findByRole('spinbutton', { name: 'Words per cloud' });
  await user.clear(limit);
  await user.type(limit, '20');
  expect(limit).toHaveValue(20);
  await user.tab();
  expect(api.updateTab).not.toHaveBeenCalled();
  expect(useFrequencyState.getState().display[JSON.stringify([base, tab.id])]).toMatchObject({
    cloudLimit: 20,
    filter: 'a*',
  });
});

it('retains the previous display on a failed enabled list and blocks export instead of treating it as empty', async () => {
  vi.spyOn(api, 'nodeSchema').mockResolvedValue([]);
  const words = vi.spyOn(api, 'readStopwords').mockResolvedValue(['banana']);
  persisted.settings = {
    ...persisted.settings,
    stopwordSource: { source: { schema: 'data', name: 'words' }, column: 'word' },
    stopwordsEnabled: true,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Harness editing={false} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('alpha');
  await waitFor(() =>
    expect(api.queryFrequency).toHaveBeenLastCalledWith(
      base,
      result.id,
      expect.objectContaining({
        stopword_source: { source: { schema: 'data', name: 'words' }, column: 'word' },
      }),
      expect.any(AbortSignal),
    ),
  );
  words.mockRejectedValue(new Error('Missing column'));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['native', base, 'rows'] });
  });
  expect(screen.getByText('alpha')).toBeInTheDocument();
  expect(await screen.findByText(/display is outdated/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export Corpus list' })).toBeDisabled();
  expect(api.queryFrequency).not.toHaveBeenCalledWith(
    base,
    result.id,
    expect.objectContaining({ stopword_source: undefined }),
    expect.any(AbortSignal),
  );
});

it('does not fall back to a cached unfiltered result when switching to an unreadable list', async () => {
  vi.spyOn(api, 'nodeSchema').mockResolvedValue([]);
  const words = vi.spyOn(api, 'readStopwords').mockResolvedValue(['banana']);
  vi.mocked(api.queryFrequency).mockImplementation(async (_base, _id, query) =>
    query.stopword_source
      ? rows
      : {
          table: tableFromArrays({ token: ['unfiltered'], frequency: [9n] }),
          totalRows: 1,
        },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Harness editing={false} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('unfiltered');
  const select = (name: string) => {
    persisted = {
      ...persisted,
      settings: {
        ...persisted.settings,
        stopwordsEnabled: true,
        stopwordSource: { source: { schema: 'data', name }, column: 'word' },
      },
    };
    client.setQueryData(['native', base, 'tabs', 'frequency'], [persisted]);
  };
  act(() => {
    select('valid');
  });
  await screen.findByText('alpha');
  words.mockRejectedValue(new Error('missing list'));
  act(() => {
    select('missing');
  });
  await screen.findByText('missing list');
  expect(screen.getByText('alpha')).toBeInTheDocument();
  expect(screen.queryByText('unfiltered')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export Corpus list' })).toBeDisabled();
});

it('pages through all comparison rows and resets the page when filtering or sorting changes', async () => {
  const saved: FrequencyAnalysisResult = {
    ...result,
    result: {
      version: 1,
      finished_at: '',
      payload: {
        corpora: [
          result.result.payload.corpora[0],
          {
            ...result.result.payload.corpora[0],
            source: { schema: 'data', name: 'Study corpus' },
            label: 'Study corpus',
          },
        ],
        comparison_artifact_id: 'comparison',
      },
    },
  };
  vi.mocked(api.queryFrequency).mockImplementation(async (_base, _id, query) =>
    query.view === 'comparison'
      ? { table: tableFromArrays({ token: [`page ${String(query.page)}`] }), totalRows: 120 }
      : rows,
  );
  mount(false, saved);
  await screen.findByText('page 1');
  fireEvent.click(screen.getByRole('link', { name: 'Go to next page' }));
  await screen.findByText('page 2');
  expect(api.queryFrequency).toHaveBeenCalledWith(
    base,
    result.id,
    expect.objectContaining({
      view: 'comparison',
      page: 2,
      page_size: 50,
      sort: 'log_likelihood_llv',
    }),
    expect.any(AbortSignal),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter tokens' }), {
    target: { value: 'a*' },
  });
  await screen.findByText('page 1');
  fireEvent.click(screen.getByRole('link', { name: 'Go to next page' }));
  await screen.findByText('page 2');
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Signed LL' }));
  await screen.findByText('page 1');
  expect(api.queryFrequency).toHaveBeenCalledWith(
    base,
    result.id,
    expect.objectContaining({
      view: 'comparison',
      page: 1,
      filter: 'a*',
      sort: 'signed_ll',
    }),
    expect.any(AbortSignal),
  );
  expect(api.queryFrequency).not.toHaveBeenCalledWith(
    base,
    result.id,
    expect.objectContaining({ view: 'comparison', limit: expect.any(Number) }),
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Word clouds' }));
  expect(await screen.findByLabelText('Reference to Study color scale')).toBeInTheDocument();
  fireEvent.focus(screen.getAllByLabelText('Study: Study corpus')[0]);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Study corpus');
});

it('opens a Concordance Preview using the saved source and clicked token', async () => {
  const created: Tab = {
    ...tab,
    id: 'new-concordance',
    kind: 'concordance',
    name: 'Concordance 1',
    analysis: null,
  };
  vi.mocked(api.createTab).mockResolvedValue(created);
  vi.mocked(api.updateTab).mockImplementationOnce(async (_base, _id, changes) => ({
    ...created,
    ...changes,
  }));
  mount();
  const token = await screen.findByText('alpha');
  fireEvent.click(token);
  await waitFor(() => expect(api.createTab).toHaveBeenCalledExactlyOnceWith(base, 'concordance'));
  await waitFor(() => expect(useConcordanceState.getState().active[base]).toBe(created.id));
  const preview = useConcordanceState.getState().previews[concordanceKey(base, created.id)];
  expect(preview?.request.inputs).toEqual(result.request.inputs);
  expect(api.updateTab).not.toHaveBeenCalled();
  expect(preview?.request.search).toMatchObject({
    query: 'alpha',
    mode: 'text',
    whole_word: true,
    regex: false,
  });
});

it.each([
  ['cloud', 0],
  ['cloud', 1],
  ['list', 0],
  ['list', 1],
  ['juxtorpus', 0],
  ['comparison', 0],
] as const)('hands off both saved inputs from %s %i', async (presentation, index) => {
  const saved = structuredClone(result);
  const study = {
    source: { schema: 'other', name: 'Study "corpus"' },
    column: 'document',
    tokenizer: 'study-tokenizer',
  };
  saved.request.inputs.push(study);
  saved.result.payload.corpora.push({
    ...saved.result.payload.corpora[0],
    ...study,
    label: 'Study corpus',
  });
  saved.result.payload.comparison_artifact_id = 'comparison';
  const created: Tab = { ...tab, id: 'concordance', kind: 'concordance', analysis: null };
  vi.mocked(api.createTab).mockResolvedValue(created);
  vi.mocked(api.updateTab).mockImplementationOnce(async (_base, _id, changes) => ({
    ...created,
    ...changes,
  }));
  useFrequencyState.getState().setDisplay(base, tab.id, {
    display: presentation === 'cloud' || presentation === 'juxtorpus' ? 'cloud' : 'list',
  });
  mount(false, saved);
  if (presentation === 'cloud') {
    const label = index === 0 ? 'Corpus word cloud' : 'Study corpus word cloud';
    await waitFor(() => expect(FrequencyCorpusCloud).toHaveBeenCalled());
    act(() =>
      vi
        .mocked(FrequencyCorpusCloud)
        .mock.calls.find(([props]) => props.label === label)?.[0]
        .onTokenClick?.('alpha'),
    );
  } else if (presentation === 'juxtorpus') {
    await waitFor(() => expect(FrequencyJuxtorpusCloud).toHaveBeenCalled());
    act(() => vi.mocked(FrequencyJuxtorpusCloud).mock.calls.at(-1)?.[0].onTokenClick?.('alpha'));
  } else {
    const label =
      presentation === 'comparison'
        ? 'Keyness statistics'
        : index === 0
          ? 'Corpus frequencies'
          : 'Study corpus frequencies';
    fireEvent.click(
      await within(await screen.findByRole('region', { name: label })).findByText('alpha'),
    );
  }
  await waitFor(() => expect(api.createTab).toHaveBeenCalledExactlyOnceWith(base, 'concordance'));
  await waitFor(() => expect(useConcordanceState.getState().active[base]).toBe(created.id));
  const key = concordanceKey(base, created.id);
  const state = useConcordanceState.getState();
  expect(state.drafts[key]?.inputs).toEqual(saved.request.inputs);
  expect(state.previews[key]?.request).toEqual({
    inputs: saved.request.inputs,
    search: expect.objectContaining({
      query: 'alpha',
      mode: 'text',
      whole_word: true,
      regex: false,
    }),
  });
});
