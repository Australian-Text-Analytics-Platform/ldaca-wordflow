import { QueryClientProvider, skipToken, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tableFromArrays, vectorFromArray, Utf8 } from 'apache-arrow';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import * as api from '@/features/project/api';
import { createProjectQueryClient } from '@/features/project/projectErrors';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import { AnnotationAi } from './AnnotationAi';
vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  aiConnections: vi.fn(),
  aiModels: vi.fn(),
  previewAnnotation: vi.fn(),
  runAnnotation: vi.fn(),
  annotationCodebook: vi.fn(),
  annotationRows: vi.fn(),
  getAnnotationResult: vi.fn(),
  clearTab: vi.fn(),
  beginAnnotationEdit: vi.fn(),
  cellEditPage: vi.fn(),
  saveCellEdit: vi.fn(),
  cancelCellEdit: vi.fn(),
}));
const setup: api.AnnotationSetup = {
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
const page: api.AnnotationPreview = {
  table: tableFromArrays({
    text: vectorFromArray(['The new bus route.'], new Utf8()),
    label: vectorFromArray(['A'], new Utf8()),
    reference: vectorFromArray(['A'], new Utf8()),
  }),
  predictions: [{ status: 'success', label: 'A' }],
  row_refs: ['01'],
  mutation_stamp: { all: 0, object: 0 } as unknown as api.MutationStamp,
  outdated: false,
  has_next: true,
  page: 1,
  skipped: 0,
  excluded_examples: 0,
};
const empty: api.Tab = {
  id: 'tab',
  kind: 'annotation',
  name: 'Annotation 1',
  position: 0,
  settings: {},
  analysis: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.aiConnections).mockResolvedValue([
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
  vi.mocked(api.aiModels).mockResolvedValue(['system']);
  vi.mocked(api.annotationCodebook).mockResolvedValue([{ code: 'A', description: 'First' }]);
  vi.mocked(api.previewAnnotation).mockResolvedValue(page);
  vi.mocked(api.runAnnotation).mockResolvedValue(undefined);
  vi.mocked(api.clearTab).mockResolvedValue(undefined);
});
function mount(tab = empty, initial = request) {
  const cache = createProjectQueryClient();
  const tabKey = ['native', 'http://annotation-ai', 'tabs', 'annotation'];
  cache.setQueryData(tabKey, [tab]);
  function Host() {
    const [draft, change] = useState(initial);
    const tabs = useQuery<api.Tab[]>({ queryKey: tabKey, queryFn: skipToken });
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
  const saved: api.AnnotationResult = {
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
  vi.mocked(api.getAnnotationResult).mockResolvedValue(saved);
  vi.mocked(api.annotationRows).mockResolvedValue({
    table: page.table,
    summary: { total_rows: 1, filtered_rows: 1, includes_unsaved_changes: false, comparisons: [] },
    live: { row_refs: page.row_refs, mutation_stamp: page.mutation_stamp, outdated: false },
  });
  const cache = mount({ ...empty, analysis: { id: saved.id, request, has_result: true } });
  await screen.findByText(/Historical Run: 1 processed/);
  await user.click(screen.getByRole('button', { name: 'Clear results' }));
  await waitFor(() => expect(api.clearTab).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByText(/Historical Run:/)).not.toBeInTheDocument());
  expect(
    cache.getQueryData(['native', 'http://annotation-ai', 'analyses', saved.id]) ?? null,
  ).toBeNull();
  expect(api.getAnnotationResult).toHaveBeenCalledOnce();
});
it('keeps Preview explicit, clears predictions immediately, and suppresses superseded responses', async () => {
  const user = userEvent.setup();
  mount();
  expect(api.previewAnnotation).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const panel = await screen.findByRole('region', { name: 'Annotation Preview' });
  expect(within(panel).getByText('Prediction')).toBeInTheDocument();
  await user.type(
    screen.getByRole('textbox', { name: 'Annotation instruction' }),
    'Changed prompt',
  );
  expect(api.previewAnnotation).toHaveBeenCalledTimes(1);
  let finish: (value: api.AnnotationPreview) => void = () => {
    /* Superseded response resolver. */
  };
  vi.mocked(api.previewAnnotation).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  expect(screen.queryByText('Prediction')).not.toBeInTheDocument();
  const signal = vi.mocked(api.previewAnnotation).mock.calls[1]?.[5];
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
  expect(api.previewAnnotation).toHaveBeenCalledTimes(1);
  expect(within(panel).getByText('Hidden')).toBeInTheDocument();
});

it('edits Preview corrections by captured identity, includes draft comparisons, and retains them after Clear', async () => {
  const user = userEvent.setup();
  const input = { ...request, setup: { ...setup, annotation: '', correction: 'correction' } };
  vi.mocked(api.previewAnnotation).mockResolvedValue({
    ...page,
    table: tableFromArrays({
      text: vectorFromArray(['The new bus route.'], new Utf8()),
      correction: vectorFromArray([null], new Utf8()),
    }),
  });
  vi.mocked(api.beginAnnotationEdit).mockResolvedValue({
    session_id: 'corrections',
    table_name: 'docs',
    row_count: 1,
    columns: [
      { name: 'text', data_type: 'VARCHAR', editable: false },
      { name: 'correction', data_type: 'VARCHAR', editable: true },
    ],
  });
  vi.mocked(api.saveCellEdit).mockResolvedValue(undefined);
  vi.mocked(api.cancelCellEdit).mockResolvedValue(undefined);
  mount(empty, input);
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  await user.click(await screen.findByRole('button', { name: 'Edit corrections' }));
  const choice = await screen.findByRole('combobox', { name: 'Edit correction' });
  await user.click(choice);
  await user.click(screen.getByRole('option', { name: 'A', exact: true }));
  expect(await screen.findByText(/Includes unsaved changes/)).toBeInTheDocument();
  expect(api.cellEditPage).not.toHaveBeenCalled();
  expect(api.previewAnnotation).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Clear results' }));
  expect(screen.queryByText('Prediction')).not.toBeInTheDocument();
  expect(screen.getByText(/correction draft is retained/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(api.saveCellEdit).toHaveBeenCalledWith('http://annotation-ai', 'corrections', {
      changes: [{ row_ref: '01', column: 'correction', value: 'A' }],
      deletions: [],
      insertions: [],
    }),
  );
  expect(api.runAnnotation).not.toHaveBeenCalled();
});
