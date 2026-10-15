import { TooltipProvider } from '@/components/ui/tooltip';
import * as aiApi from '@/features/ai/api';
import { createProjectQueryClient } from '@/features/project/projectErrors';
import * as editingApi from '@/features/table-editing/api';
import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import * as annotationApi from '@/features/tools/annotation/api';
import * as analysesApi from '@/features/tools/common/analysisApi';
import { QueryClientProvider, skipToken, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tableFromArrays, Utf8, vectorFromArray } from 'apache-arrow';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { AnnotationAi } from './AnnotationAi';
vi.mock('@/features/tools/annotation/api', async (original) => ({
  ...(await original<object>()),
  previewAnnotation: vi.fn(),
  runAnnotation: vi.fn(),
  annotationCodebook: vi.fn(),
  annotationRows: vi.fn(),
  getAnnotationResult: vi.fn(),
  beginAnnotationEdit: vi.fn(),
}));
vi.mock('@/features/tools/common/analysisApi', async (original) => ({
  ...(await original<object>()),
  clearTab: vi.fn(),
}));
vi.mock('@/features/ai/api', async (original) => ({
  ...(await original<object>()),
  aiCapabilities: vi.fn(),
  aiConnections: vi.fn(),
  aiModels: vi.fn(),
  rememberAnnotationConcurrency: vi.fn(),
}));
vi.mock('@/features/table-editing/api', async (original) => ({
  ...(await original<object>()),
  cellEditPage: vi.fn(),
  saveCellEdit: vi.fn(),
  cancelCellEdit: vi.fn(),
}));
const setup: annotationApi.AnnotationSetup = {
  source: { schema: 'data', name: 'docs' },
  document: 'text',
  annotation: 'label',
  correction: null,
  codebook: { source: { schema: 'data', name: 'codes' }, code: 'code', description: 'description' },
};
const request = {
  ...decodeAnalysisRequest('annotation', undefined).request,
  setup,
  inference: {
    ...decodeAnalysisRequest('annotation', undefined).request.inference,
    provider: 'local',
    model: 'system',
  },
};
const page: annotationApi.AnnotationPreview = {
  table: tableFromArrays({
    text: vectorFromArray(['The new bus route.'], new Utf8()),
    label: vectorFromArray(['A'], new Utf8()),
    reference: vectorFromArray(['A'], new Utf8()),
  }),
  predictions: [{ status: 'success', label: 'A' }],
  row_refs: ['01'],
  mutation_stamp: { all: 0, object: 0 } as unknown as annotationApi.MutationStamp,
  outdated: false,
  has_next: true,
  page: 1,
  skipped: 0,
  excluded_examples: 0,
};
const empty: analysesApi.Tab = {
  id: 'tab',
  kind: 'annotation',
  name: 'Annotation 1',
  position: 0,
  settings: {},
  analysis: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiApi.aiConnections).mockResolvedValue([
    {
      id: 'local',
      revision: '1',
      name: 'Apple Foundation Models',
      provider: 'apple',
      endpoint: null,
      credential_mode: 'none',
      has_credential: false,
      credential_error: null,
      built_in: true,
    },
  ]);
  vi.mocked(aiApi.aiModels).mockResolvedValue(['system']);
  vi.mocked(aiApi.aiCapabilities).mockResolvedValue({
    thinking: [],
    efforts: [],
    budget_min: 0,
    budget_max: 0,
    temperature_with_thinking: true,
    max_concurrency: 1,
    default_concurrency: 1,
  });
  vi.mocked(annotationApi.annotationCodebook).mockResolvedValue([
    { code: 'A', description: 'First' },
  ]);
  vi.mocked(annotationApi.previewAnnotation).mockResolvedValue(page);
  vi.mocked(annotationApi.runAnnotation).mockResolvedValue(undefined);
  vi.mocked(analysesApi.clearTab).mockResolvedValue(undefined);
});
function mount(tab = empty, initial = request) {
  const cache = createProjectQueryClient();
  const tabKey = ['native', 'http://annotation-ai', 'tabs', 'annotation'];
  cache.setQueryData(tabKey, [tab]);
  function Host() {
    const [draft, change] = useState(initial);
    const tabs = useQuery<analysesApi.Tab[]>({ queryKey: tabKey, queryFn: skipToken });
    return (
      <AnnotationAi
        base="http://annotation-ai"
        tab={tabs.data?.[0] ?? tab}
        request={draft}
        onChange={change}
        nodes={[
          {
            table_name: 'docs',
            kind: 'table',
            visible: true,
            color: null,
            document_column: 'text',
            column_count: 3,
            can_undo: false,
          },
        ]}
        tasks={[]}
        onCancel={vi.fn()}
        active
      />
    );
  }
  render(
    <QueryClientProvider client={cache}>
      <TooltipProvider>
        <EditingNavigation>
          <Host />
        </EditingNavigation>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return cache;
}
it('removes cleared output immediately without waiting for the change observer', async () => {
  const user = userEvent.setup();
  const saved: annotationApi.AnnotationResult = {
    request_status: { status: 'supported', request: { kind: 'annotation', request: request } },
    id: 'saved',
    request,
    report: {
      processed: 1,
      preserved: 0,
      skipped: 0,
      failed: 0,
      context: 'context',
      diagnostics: 'diagnostics',
    },
  };
  vi.mocked(annotationApi.getAnnotationResult).mockResolvedValue(saved);
  vi.mocked(annotationApi.annotationRows).mockResolvedValue({
    table: page.table,
    summary: { total_rows: 1, filtered_rows: 1, includes_unsaved_changes: false, comparisons: [] },
    live: { row_refs: page.row_refs, mutation_stamp: page.mutation_stamp, outdated: false },
  });
  const cache = mount({
    ...empty,
    analysis: {
      request_status: { status: 'supported', request: { kind: 'annotation', request: request } },
      id: saved.id,
      request,
      has_result: true,
    },
  });
  await screen.findByText(/Historical Run: 1 processed/);
  await user.click(screen.getByRole('button', { name: 'Clear results' }));
  await waitFor(() => expect(analysesApi.clearTab).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByText(/Historical Run:/)).not.toBeInTheDocument());
  expect(
    cache.getQueryData(['native', 'http://annotation-ai', 'analyses', saved.id]) ?? null,
  ).toBeNull();
  expect(annotationApi.getAnnotationResult).toHaveBeenCalledOnce();
});
it('uses backend model controls and lets an incompatible temperature be cleared', async () => {
  const user = userEvent.setup();
  vi.mocked(aiApi.aiCapabilities).mockResolvedValue({
    thinking: ['reasoning_effort'],
    efforts: ['low'],
    budget_min: 0,
    budget_max: 0,
    temperature_with_thinking: false,
    max_concurrency: 32,
    default_concurrency: 10,
  });
  mount(empty, {
    ...request,
    inference: {
      ...request.inference,
      thinking: { control: 'reasoning_effort', value: 'low' },
      temperature: 1,
    },
  });
  await user.click(screen.getByText('Advanced settings and examples'));
  const temperature = await screen.findByRole('spinbutton', { name: 'Temperature' });
  await waitFor(() => expect(temperature).toBeEnabled());
  await user.click(screen.getByRole('combobox', { name: 'Reasoning effort' }));
  expect(screen.getByRole('option', { name: 'low' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'off' })).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  await user.clear(temperature);
  expect(temperature).toBeDisabled();
});
it('restores and remembers concurrency independently for each provider configuration', async () => {
  const user = userEvent.setup();
  const rows: aiApi.AiConnection[] = [
    {
      id: 'custom',
      revision: '1',
      name: 'Local Custom',
      provider: 'custom',
      endpoint: 'http://fixture/v1',
      credential_mode: 'none',
      has_credential: false,
      credential_error: null,
      built_in: false,
      annotation_concurrency: 2,
    },
    {
      id: 'remote',
      revision: '1',
      name: 'Remote OpenAI',
      provider: 'openai',
      endpoint: null,
      credential_mode: 'session',
      has_credential: true,
      credential_error: null,
      built_in: false,
      annotation_concurrency: 17,
    },
  ];
  vi.mocked(aiApi.aiConnections).mockImplementation(async () => structuredClone(rows));
  vi.mocked(aiApi.aiCapabilities).mockResolvedValue({
    thinking: [],
    efforts: [],
    budget_min: 0,
    budget_max: 0,
    temperature_with_thinking: true,
    max_concurrency: 32,
    default_concurrency: 10,
  });
  vi.mocked(aiApi.rememberAnnotationConcurrency).mockImplementation(
    async (_base, id, concurrency) => {
      const row = rows.find((row) => row.id === id)!;
      row.annotation_concurrency = concurrency;
      return structuredClone(row);
    },
  );
  mount(empty, {
    ...request,
    inference: { ...request.inference, provider: 'custom', concurrency: 2 },
  });
  await user.click(screen.getByText('Advanced settings and examples'));
  await user.click(screen.getByRole('combobox', { name: 'AI connection' }));
  await user.click(await screen.findByRole('option', { name: 'Remote OpenAI' }));
  const concurrency = screen.getByRole('spinbutton', { name: 'Concurrent requests' });
  expect(concurrency).toHaveValue(17);
  expect(concurrency).toHaveAttribute('max', '32');
  await user.clear(concurrency);
  await user.type(concurrency, '32');
  await user.tab();
  await waitFor(() =>
    expect(aiApi.rememberAnnotationConcurrency).toHaveBeenCalledWith(
      'http://annotation-ai',
      'remote',
      32,
    ),
  );
  await user.click(screen.getByRole('combobox', { name: 'AI connection' }));
  await user.click(screen.getByRole('option', { name: 'Local Custom' }));
  expect(concurrency).toHaveValue(2);
  await user.click(screen.getByRole('combobox', { name: 'AI connection' }));
  await user.click(screen.getByRole('option', { name: 'Remote OpenAI' }));
  expect(concurrency).toHaveValue(32);
});
it('keeps Preview explicit, clears predictions immediately, and suppresses superseded responses', async () => {
  const user = userEvent.setup();
  mount();
  expect(annotationApi.previewAnnotation).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const panel = await screen.findByRole('region', { name: 'Annotation Preview' });
  expect(within(panel).getByText('Prediction')).toBeInTheDocument();
  await user.type(
    screen.getByRole('textbox', { name: 'Annotation instruction' }),
    'Changed prompt',
  );
  expect(annotationApi.previewAnnotation).toHaveBeenCalledTimes(1);
  let finish: (value: annotationApi.AnnotationPreview) => void = () => {
    /* Superseded response resolver. */
  };
  vi.mocked(annotationApi.previewAnnotation).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  expect(screen.queryByText('Prediction')).not.toBeInTheDocument();
  const signal = vi.mocked(annotationApi.previewAnnotation).mock.calls[1]?.[5];
  await user.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(signal?.aborted).toBe(true);
  finish(page);
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Annotation Preview' })).not.toBeInTheDocument(),
  );
});
it('reports page comparisons without prediction work on presentation changes', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const panel = await screen.findByRole('region', { name: 'Annotation Preview' });
  await user.click(within(panel).getByRole('button', { name: 'Compare To (0)' }));
  await user.click(screen.getByLabelText('reference'));
  expect(annotationApi.previewAnnotation).toHaveBeenCalledTimes(1);
  expect(within(panel).getByText('Hidden')).toBeInTheDocument();
});

it('edits Preview corrections by captured identity, includes draft comparisons, and retains them after Clear', async () => {
  const user = userEvent.setup();
  const input = { ...request, setup: { ...setup, annotation: '', correction: 'correction' } };
  vi.mocked(annotationApi.previewAnnotation).mockResolvedValue({
    ...page,
    table: tableFromArrays({
      text: vectorFromArray(['The new bus route.'], new Utf8()),
      correction: vectorFromArray([null], new Utf8()),
    }),
  });
  vi.mocked(annotationApi.beginAnnotationEdit).mockResolvedValue({
    session_id: 'corrections',
    table_name: 'docs',
    row_count: 1,
    columns: [
      { name: 'text', data_type: 'VARCHAR', editable: false },
      { name: 'correction', data_type: 'VARCHAR', editable: true },
    ],
  });
  vi.mocked(editingApi.saveCellEdit).mockResolvedValue(undefined);
  vi.mocked(editingApi.cancelCellEdit).mockResolvedValue(undefined);
  mount(empty, input);
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  await user.click(await screen.findByRole('button', { name: 'Edit corrections' }));
  const choice = await screen.findByRole('combobox', { name: 'Edit correction' });
  await user.click(choice);
  await user.click(screen.getByRole('option', { name: 'A', exact: true }));
  expect(await screen.findByText(/Includes unsaved changes/)).toBeInTheDocument();
  expect(editingApi.cellEditPage).not.toHaveBeenCalled();
  expect(annotationApi.previewAnnotation).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.queryByText('Prediction')).not.toBeInTheDocument();
  expect(screen.getByText(/correction draft is retained/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(editingApi.saveCellEdit).toHaveBeenCalledWith('http://annotation-ai', 'corrections', {
      changes: [{ row_ref: '01', column: 'correction', value: 'A' }],
      deletions: [],
      insertions: [],
    }),
  );
  expect(annotationApi.runAnnotation).not.toHaveBeenCalled();
});
