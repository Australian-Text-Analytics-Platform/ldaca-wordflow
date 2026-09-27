import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { Field, Utf8 } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  FrequencyAnalysisResult,
  Tab,
  FrequencyRequest,
  NativeTask,
  ProjectNode,
} from '@/features/project/api';
import * as api from '@/features/project/api';
import TokenFrequencyFeature from './TokenFrequencyFeature';
import { getFrequencyDraft, useFrequencyState } from './frequencyState';
import { useNodeInputRequestsStore } from '@/stores/nodeInputRequestsStore';
import { refreshProjectQueries } from '@/features/project/projectChanges';

vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('./FrequencyResults', () => ({
  FrequencyResults: ({ outdated }: { outdated: boolean }) => (
    <p>Saved result{outdated ? ' outdated' : ''}</p>
  ),
}));
vi.mock('../common/language/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: () => ({ data: 'en', isFetching: false, isError: false }),
}));
vi.mock('@/features/project/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  listTabs: vi.fn(),
  createTab: vi.fn(),
  updateTab: vi.fn(),
  reorderTabs: vi.fn(),
  deleteTab: vi.fn(),
  clearTab: vi.fn(),
  runFrequency: vi.fn(),
  getFrequencyResult: vi.fn(),
  getTokenizers: vi.fn(),
  nodeSchema: vi.fn(),
}));
const base = 'http://project';
const tab: Tab = {
  id: 'tab',
  kind: 'frequency',
  name: 'Frequency 1',
  position: 0,
  settings: {},
  analysis: null,
};
const request: FrequencyRequest = {
  inputs: [
    {
      source: { schema: 'data', name: 'Corpus' },
      column: 'text',
      tokenizer: 'plain_words',
    },
  ],
};
const saved: FrequencyAnalysisResult = {
  id: 'result',
  tab_id: tab.id,
  kind: 'frequency',
  created_at: '2026-01-01',
  request,
  result: {
    version: 1,
    payload: { corpora: [], comparison_artifact_id: null },
    finished_at: '2026-01-01',
  },
};
const nodes = [
  {
    table_name: 'Corpus',
    object_kind: 'TABLE',
    column_count: 1,
    document_column: 'text',
    color: '#2563eb',
  },
] as ProjectNode[];
function mount(
  tasks: NativeTask[] = [],
  projectNodes: ProjectNode[] = nodes,
  options: { active?: boolean; editing?: boolean; client?: QueryClient; strict?: boolean } = {},
) {
  const client =
    options.client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  const content = (active = true, editing = false) => (
    <QueryClientProvider client={client}>
      <TokenFrequencyFeature
        base={base}
        nodes={projectNodes}
        tasks={tasks}
        onCancel={vi.fn()}
        active={active}
        editing={editing}
      />
    </QueryClientProvider>
  );
  const tree = (active?: boolean, editing?: boolean) =>
    options.strict ? <StrictMode>{content(active, editing)}</StrictMode> : content(active, editing);
  const view = render(tree(options.active, options.editing));
  return {
    ...view,
    client,
    show: (active: boolean, editing = false) => view.rerender(tree(active, editing)),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  useFrequencyState.setState({ active: {}, drafts: {} });
  useNodeInputRequestsStore.getState().clear();
  vi.mocked(api.listTabs).mockResolvedValue([tab]);
  vi.mocked(api.createTab).mockResolvedValue(tab);
  vi.mocked(api.getTokenizers).mockResolvedValue([
    { model_id: 'plain_words', label: 'Plain words', languages: ['en'] },
  ]);
  vi.mocked(api.nodeSchema).mockResolvedValue([
    { name: 'text', field: new Field('text', new Utf8(), true) },
  ]);
  vi.mocked(api.getFrequencyResult).mockResolvedValue(saved);
});
it('keeps graph additions carried when saved results expose the stopword selector', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  mount([], [...nodes, { ...nodes[0]!, table_name: 'Words' }]);
  await screen.findByText('Saved result');
  act(() => {
    useNodeInputRequestsStore.getState().requestAdd(base, 'token-frequency', 'Words');
  });
  expect(screen.getByRole('button', { name: 'Add to Frequency inputs' })).toBeInTheDocument();
  expect(useNodeInputRequestsStore.getState().pendingRequests).toHaveLength(1);
  expect(screen.getByText('Frequency inputs (1/2)')).toBeInTheDocument();
  expect(getFrequencyDraft(useFrequencyState.getState(), base, tab.id)).toBeUndefined();
});
it('automatically creates the first tab once across Strict Mode and a pending remount', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([]);
  const operation = Promise.withResolvers<Tab>();
  vi.mocked(api.createTab).mockReturnValue(operation.promise);
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(['native', base, 'tabs', 'frequency'], []);
  const first = mount([], nodes, { client, strict: true });
  await screen.findByText('Creating Frequency analysis…');
  expect(api.createTab).toHaveBeenCalledOnce();
  first.show(false);
  first.show(true);
  first.unmount();
  mount([], nodes, { client, strict: true });
  expect(api.createTab).toHaveBeenCalledOnce();
  await act(async () => operation.resolve(tab));
  await screen.findByRole('tab', { name: 'Frequency 1' });
  expect(api.createTab).toHaveBeenCalledOnce();
  expect(client.getQueryData(['native', base, 'tabs', 'frequency'])).toEqual([tab]);
  expect(api.runFrequency).not.toHaveBeenCalled();
});
it.each([
  { active: false, editing: false },
  { active: true, editing: true },
])('defers automatic creation while inactive or editing: %j', async (options) => {
  vi.mocked(api.listTabs).mockResolvedValue([]);
  const view = mount([], nodes, options);
  await screen.findByRole('button', { name: 'New Frequency analysis' });
  expect(api.createTab).not.toHaveBeenCalled();
  view.show(true);
  await screen.findByRole('tab', { name: 'Frequency 1' });
  expect(api.createTab).toHaveBeenCalledOnce();
});
it('waits for a stale empty list to refresh before deciding to create a tab', async () => {
  const operation = Promise.withResolvers<Tab[]>();
  vi.mocked(api.listTabs).mockReturnValue(operation.promise);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['native', base, 'tabs', 'frequency'], []);
  mount([], nodes, { client });
  await screen.findByText('Loading analyses…');
  expect(api.createTab).not.toHaveBeenCalled();
  await act(async () => operation.resolve([tab]));
  await screen.findByRole('tab', { name: 'Frequency 1' });
  expect(api.createTab).not.toHaveBeenCalled();
});
it('does not create a tab after a list error and reuses the saved tab on retry', async () => {
  vi.mocked(api.listTabs).mockRejectedValueOnce(new Error('Offline'));
  mount();
  await screen.findByText('Could not load Frequency analyses.');
  expect(api.createTab).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('tab', { name: 'Frequency 1' });
  expect(api.createTab).not.toHaveBeenCalled();
});
it('offers an explicit retry after automatic creation fails without retrying on refresh', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([]);
  vi.mocked(api.createTab).mockRejectedValueOnce(new Error('Conflict'));
  const { client } = mount();
  await screen.findByText('Could not create a Frequency analysis.');
  await act(async () =>
    client.invalidateQueries({ queryKey: ['native', base, 'tabs', 'frequency'] }),
  );
  expect(api.createTab).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('tab', { name: 'Frequency 1' });
  expect(api.createTab).toHaveBeenCalledTimes(2);
});
it.each(['button', 'reopen'])(
  'leaves the final closed tab empty until %s creates another',
  async (action) => {
    const replacement = { ...tab, id: 'replacement' };
    vi.mocked(api.deleteTab).mockImplementation(async () => {
      vi.mocked(api.listTabs).mockResolvedValue([]);
    });
    vi.mocked(api.createTab).mockResolvedValue(replacement);
    const view = mount();
    await screen.findByRole('tab', { name: 'Frequency 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Close tab' }));
    const create = await screen.findByRole('button', { name: 'New Frequency analysis' });
    await act(async () =>
      view.client.invalidateQueries({ queryKey: ['native', base, 'tabs', 'frequency'] }),
    );
    expect(api.createTab).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    if (action === 'button') fireEvent.click(create);
    else {
      view.show(false);
      view.show(true);
    }
    await screen.findByRole('tab', { name: 'Frequency 1' });
    expect(api.createTab).toHaveBeenCalledOnce();
    expect(api.runFrequency).not.toHaveBeenCalled();
  },
);
it('keeps the named tab rail outside the scrollable request and results panels', async () => {
  mount();
  const tabs = await screen.findByRole('tablist', { name: 'Frequency analyses' });
  const content = screen.getByTestId('frequency-content');
  expect(content).not.toContainElement(tabs);
  expect(content).toContainElement(screen.getByRole('region', { name: 'Frequency request' }));
  expect(screen.queryByRole('region', { name: 'Frequency results' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Token Frequency Analysis' })).toBeVisible();

  expect(screen.queryByRole('button', { name: 'Delete analysis' })).not.toBeInTheDocument();
  expect(api.createTab).not.toHaveBeenCalled();
});

it('captures a run without overwriting a newer local draft when it completes', async () => {
  useFrequencyState.getState().setDraft(base, tab.id, { inputs: request.inputs, study: null });
  const operation = Promise.withResolvers<FrequencyAnalysisResult>();
  vi.mocked(api.runFrequency).mockReturnValue(operation.promise);
  const { client } = mount();
  const run = await screen.findByRole('button', { name: 'Run', exact: true });
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(run);
  await waitFor(() => expect(api.runFrequency).toHaveBeenCalledWith(base, tab.id, request));
  expect(run).toHaveAttribute('aria-disabled', 'true');
  act(() => {
    useFrequencyState.getState().setDraft(base, tab.id, { inputs: [], study: null });
  });
  await act(async () => operation.resolve(saved));
  expect(getFrequencyDraft(useFrequencyState.getState(), base, tab.id)?.inputs).toEqual([]);
  expect(client.getQueryData(['native', base, 'analyses', saved.id])).toBeUndefined();
  expect(api.updateTab).not.toHaveBeenCalled();
});
it('keeps the result on admission failure with changed parameters', async () => {
  const changed = request.inputs.map((input) => ({ ...input, tokenizer: 'other' }));
  useFrequencyState.getState().setDraft(base, tab.id, { inputs: changed, study: null });
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  vi.mocked(api.runFrequency).mockRejectedValue(new Error('Conflict'));
  mount();
  await screen.findByText('Saved result outdated');
  const run = screen.getByRole('button', { name: 'Run', exact: true });
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(run);
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
  expect(screen.getByText('Saved result outdated')).toBeInTheDocument();
  expect(run).toHaveAttribute('aria-disabled', 'false');
  expect(getFrequencyDraft(useFrequencyState.getState(), base, tab.id)?.inputs).toEqual(changed);
  expect(api.runFrequency).toHaveBeenCalledOnce();
});
it('leaves hidden result reads inactive during broad refresh and tab deletion', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  const view = mount();
  await screen.findByText('Saved result');
  expect(api.getFrequencyResult).toHaveBeenCalledOnce();
  view.show(false);
  await act(async () => refreshProjectQueries(view.client, base, { all: true }));
  expect(api.getFrequencyResult).toHaveBeenCalledOnce();
  view.show(true);
  await waitFor(() => expect(api.getFrequencyResult).toHaveBeenCalledTimes(2));
  view.show(false);
  vi.mocked(api.listTabs).mockResolvedValue([]);
  await act(async () => refreshProjectQueries(view.client, base, { all: true }));
  expect(api.getFrequencyResult).toHaveBeenCalledTimes(2);
});
it('allows deleting a running analysis while Clear and Run stay disabled', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  vi.mocked(api.deleteTab).mockResolvedValue();
  const task = {
    id: 'task',
    tab_id: tab.id,
    state: 'running',
    finished_at: null,
  } as NativeTask;
  mount([task]);
  await screen.findByRole('region', { name: 'Analysis progress' });
  expect(await screen.findByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Clear results' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Close tab' }));
  await waitFor(() => expect(api.deleteTab).toHaveBeenCalledWith(base, tab.id));
});

it('retains both automatic recommendations when two inputs detect language together', async () => {
  const paired = ['Corpus', 'Second'].map((name) => ({
    source: { schema: 'data', name },
    column: 'text',
    tokenizer: '',
  }));
  useFrequencyState.getState().setDraft(base, tab.id, { inputs: paired, study: 'Second' });
  mount([], [...nodes, { ...nodes[0], table_name: 'Second' } as ProjectNode]);
  await waitFor(() =>
    expect(
      getFrequencyDraft(useFrequencyState.getState(), base, tab.id)?.inputs.map(
        (input) => input.tokenizer,
      ),
    ).toEqual(['plain_words', 'plain_words']),
  );
  expect(api.updateTab).not.toHaveBeenCalled();
});
it('keeps deletion available when a saved result is unsupported or unreadable', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'unsupported', request, has_result: true } },
  ]);
  vi.mocked(api.getFrequencyResult).mockRejectedValue(new Error('Unsupported version'));
  mount();
  await screen.findByText('Could not load results.');
  expect(screen.getByRole('button', { name: 'Rerun', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close tab' })).toBeEnabled();
});

it('offers Retry without running and Rerun with the saved request after a load failure', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  vi.mocked(api.getFrequencyResult).mockRejectedValue(new Error('Unsupported version'));
  vi.mocked(api.runFrequency).mockResolvedValue(saved);
  const view = mount();
  const rerun = await screen.findByRole('button', { name: 'Rerun', exact: true });
  await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  await waitFor(() => expect(api.getFrequencyResult).toHaveBeenCalledTimes(2));
  expect(api.runFrequency).not.toHaveBeenCalled();
  vi.mocked(api.getFrequencyResult).mockResolvedValue(saved);
  vi.mocked(api.runFrequency).mockImplementation(async () => {
    await refreshProjectQueries(view.client, base, {
      analysis_ids: [saved.id],
      resources: ['tabs'],
    });
    return saved;
  });
  fireEvent.click(rerun);
  await waitFor(() => expect(api.runFrequency).toHaveBeenCalledWith(base, tab.id, request));
  await screen.findByText('Saved result');
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

it('keeps manifest Retry reachable when a failed reload retains previously cached data', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  const { client } = mount();
  await screen.findByText('Saved result');
  vi.mocked(api.getFrequencyResult).mockRejectedValue(new Error('Unsupported version'));
  await act(() => client.invalidateQueries({ queryKey: ['native', base, 'analyses', saved.id] }));
  await screen.findByRole('button', { name: 'Rerun', exact: true });
  expect(screen.queryByText('Saved result')).not.toBeInTheDocument();
  vi.mocked(api.getFrequencyResult).mockResolvedValue(saved);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Saved result');
  expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(api.runFrequency).not.toHaveBeenCalled();
});

it('keeps colours on input cards and resolves legacy colours before a rerun changes roles', async () => {
  const legacy = {
    ...tab,
    settings: { colors: ['#ff0000', '#0000ff'] },
    analysis: { id: saved.id, request, has_result: true },
  };
  const corpora = ['Corpus', 'Second'].map((name) => ({
    ...request.inputs[0],
    source: { schema: 'data', name },
    label: name,
    artifact_id: name,
    color: null,
    document_count: '1',
    total_tokens: '1',
    vocabulary_size: '1',
  }));
  vi.mocked(api.listTabs).mockResolvedValue([legacy]);
  vi.mocked(api.getFrequencyResult).mockResolvedValue({
    ...saved,
    result: {
      version: 1,
      finished_at: '',
      payload: { corpora, comparison_artifact_id: 'comparison' },
    },
  });
  vi.mocked(api.updateTab).mockImplementation(async (_base, _id, update) => ({
    ...legacy,
    ...update,
  }));
  vi.mocked(api.runFrequency).mockResolvedValue(saved);
  useFrequencyState.getState().setDraft(base, tab.id, {
    inputs: corpora.map(({ source, column, tokenizer }) => ({ source, column, tokenizer })),
    study: 'Corpus',
  });
  mount([], [...nodes, { ...nodes[0]!, table_name: 'Second' }]);
  await screen.findByText('Saved result outdated');
  const requestPanel = screen.getByRole('region', { name: 'Frequency request' });
  expect(
    within(requestPanel).getByRole('button', { name: 'Change color for Corpus' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
  await waitFor(() => expect(api.runFrequency).toHaveBeenCalled());
  expect(api.updateTab).toHaveBeenCalledWith(
    base,
    tab.id,
    expect.objectContaining({
      settings: expect.objectContaining({
        colors: {
          '["data","Corpus"]': '#ff0000',
          '["data","Second"]': '#0000ff',
        },
      }),
    }),
  );
  expect(vi.mocked(api.updateTab).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(api.runFrequency).mock.invocationCallOrder[0]!,
  );
  expect(
    vi.mocked(api.runFrequency).mock.calls[0]?.[2].inputs.map((input) => input.source.name),
  ).toEqual(['Second', 'Corpus']);
});

it('blocks matching saved settings during loading and after reload, but allows changes and Clear', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  const manifest = Promise.withResolvers<FrequencyAnalysisResult>();
  vi.mocked(api.getFrequencyResult).mockReturnValue(manifest.promise);
  const { client } = mount();
  const run = await screen.findByRole('button', { name: 'Run', exact: true });
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'true'));
  fireEvent.click(run);
  expect(api.runFrequency).not.toHaveBeenCalled();
  await act(async () => manifest.resolve(saved));
  await screen.findByText('Saved result');
  const changed = {
    inputs: request.inputs.map((input) => ({ ...input, tokenizer: 'other' })),
    study: null,
  };
  act(() => useFrequencyState.getState().setDraft(base, tab.id, changed));
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
  act(() =>
    useFrequencyState.getState().setDraft(base, tab.id, { inputs: request.inputs, study: null }),
  );
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'true'));
  // Display settings and source refreshes do not invalidate execution equality.
  await act(async () => {
    client.setQueryData(
      ['native', base, 'tabs', 'frequency'],
      [
        {
          ...tab,
          settings: { colors: ['#ff0000'], stopwords_enabled: true },
          analysis: { id: saved.id, request, has_result: true },
        },
      ],
    );
    await refreshProjectQueries(client, base, { all: true });
  });
  expect(run).toHaveAttribute('aria-disabled', 'true');
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'submitted-analysis', request, has_result: false } },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Clear results' }));
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
  expect(api.runFrequency).not.toHaveBeenCalled();
});

it('treats absent output during a stale summary read as cleared while preserving the request', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  vi.mocked(api.getFrequencyResult).mockResolvedValue(null);
  const { client } = mount();
  const run = await screen.findByRole('button', { name: 'Run', exact: true });
  await waitFor(() => expect(run).toHaveAttribute('aria-disabled', 'false'));
  expect(screen.queryByText('Saved result')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading results…')).not.toBeInTheDocument();
  expect(client.getQueryData<Tab[]>(['native', base, 'tabs', 'frequency'])?.[0]?.analysis).toEqual({
    id: saved.id,
    request,
    has_result: false,
  });
  expect(api.runFrequency).not.toHaveBeenCalled();
  expect(api.clearTab).not.toHaveBeenCalled();
});

it('cancels pending saved-result reads before Clear deletes their artifacts', async () => {
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: saved.id, request, has_result: true } },
  ]);
  let signal: AbortSignal | undefined;
  const pending = Promise.withResolvers<FrequencyAnalysisResult>();
  vi.mocked(api.getFrequencyResult).mockImplementation((_base, _id, abort) => {
    signal = abort;
    return pending.promise;
  });
  vi.mocked(api.clearTab).mockImplementation(async () => {
    expect(signal?.aborted).toBe(true);
    vi.mocked(api.listTabs).mockResolvedValue([
      { ...tab, analysis: { id: 'submitted-analysis', request, has_result: false } },
    ]);
  });
  mount();
  const clear = await screen.findByRole('button', { name: 'Clear results' });
  await waitFor(() => expect(signal).toBeDefined());
  fireEvent.click(clear);
  await waitFor(() => expect(api.clearTab).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Run', exact: true })).toHaveAttribute(
      'aria-disabled',
      'false',
    ),
  );
});

it('restores supported saved fields and enables compatibility Rerun without rewriting JSON', async () => {
  const incompatible = { ...request, future_option: { value: '<b>future</b>' } };
  vi.mocked(api.listTabs).mockResolvedValue([
    { ...tab, analysis: { id: 'result', request: incompatible, has_result: true } },
  ]);
  vi.mocked(api.getFrequencyResult).mockResolvedValue(saved);
  mount();
  expect(await screen.findByText('These saved settings are not recognized:')).toBeInTheDocument();
  const rerun = await screen.findByRole('button', { name: 'Rerun', exact: true });
  await waitFor(() => expect(rerun).toHaveAttribute('aria-disabled', 'false'));
  expect(api.updateTab).not.toHaveBeenCalled();
  expect(incompatible.future_option.value).toBe('<b>future</b>');
});
