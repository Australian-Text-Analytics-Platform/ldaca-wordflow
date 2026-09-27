import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tableFromArrays } from 'apache-arrow';
import { expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { TopicDocuments } from './TopicDocuments';
vi.mock('@/features/project/api', () => ({ queryTopicDocuments: vi.fn() }));
vi.mock('@/lib/arrow/decodeArrowTable', () => ({
  decodeArrowData: () => ({
    rows: [
      { document_id: 1, coverage: 0.5, source: { text: 'Repeated 😀 document', label: 'First' } },
      { document_id: 2, coverage: 0.5, source: { text: 'Repeated 😀 document', label: 'Second' } },
    ],
  }),
}));
it('pages a captured model, keeps duplicate text and selects original metadata', async () => {
  vi.mocked(api.queryTopicDocuments).mockResolvedValue({
    table: tableFromArrays({}),
    totalRows: 45,
    hasNext: true,
    documentCount: 20,
    matchCount: 0,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cancel = vi.spyOn(client, 'cancelQueries');
  const summary = {
    natural_topic_count: 2,
    segment_count: 50,
    resolved_model: 'test',
    sources: [
      {
        input: { source: { schema: 'data', name: 'Corpus' }, column: 'text' },
        columns: [
          ['text', 'VARCHAR'],
          ['label', 'VARCHAR'],
        ],
        documents: null,
        document_count: 45,
        total_count: 45,
      },
    ],
  } satisfies api.TopicSummary;
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <TopicDocuments
        base="/api/project"
        owner={{ analysis: 'saved-model' }}
        summary={summary}
        topic={0}
        count={2}
        topN={1}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('45 matching documents')).toBeInTheDocument();
  expect(screen.getAllByText('Repeated 😀 document')).toHaveLength(4);
  expect(api.queryTopicDocuments).toHaveBeenLastCalledWith(
    '/api/project',
    { analysis: 'saved-model' },
    expect.objectContaining({ source: 0, page: 1, page_size: 20, metadata: [], top_n: 1 }),
    expect.any(AbortSignal),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  await waitFor(() =>
    expect(api.queryTopicDocuments).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    ),
  );
  await user.click(screen.getByRole('button', { name: /Metadata/ }));
  await user.click(screen.getByRole('checkbox', { name: 'label' }));
  await waitFor(() =>
    expect(api.queryTopicDocuments).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ page: 1, metadata: ['label'] }),
      expect.any(AbortSignal),
    ),
  );
  unmount();
  expect(cancel).toHaveBeenCalledWith({
    queryKey: ['native', '/api/project', 'analyses', 'saved-model', 'topic-modeling', 'documents'],
  });
});
