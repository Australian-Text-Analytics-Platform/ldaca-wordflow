import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { ConcordancePublishDialog } from './ConcordancePublishDialog';
import { emptyConcordance } from './concordanceState';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  publishConcordance: vi.fn().mockResolvedValue([]),
}));

it('publishes captured result and filters when a newer run arrives while the dialog is open', async () => {
  const result: api.ConcordanceAnalysisResult = {
    id: 'original',
    tab_id: 'tab',
    kind: 'concordance',
    created_at: '',
    request: emptyConcordance,
    result: {
      version: 1,
      payload: {
        corpora: [
          {
            input: {
              source: { schema: 'data', name: 'Corpus' },
              column: 'text',
              tokenizer: null,
            },
            columns: [['text', 'VARCHAR']],
            documents: 'documents',
            matches: 'matches',
            projection: 'projection',
            document_count: 2,
            matching_documents: 2,
            match_count: 3,
          },
        ],
      },
      finished_at: '',
    },
  };
  const filter: api.ConcordanceFilter = {
    excluded_terms: ['dog'],
    uncased: true,
    bins: [2],
    bin_count: 20,
  };
  const client = new QueryClient();
  const close = vi.fn();
  const view = (value: api.ConcordanceAnalysisResult) => (
    <QueryClientProvider client={client}>
      <ConcordancePublishDialog
        base="http://test"
        result={value}
        projection="matches"
        filters={[filter]}
        onClose={close}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(view(result));
  rerender(view({ ...result, id: 'newer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(api.publishConcordance).toHaveBeenCalledWith('http://test', 'original', 'matches', [
    expect.objectContaining({ source_index: 0, filter }),
  ]);
});
