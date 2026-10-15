import * as concordanceApi from '@/features/tools/concordance/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vite-plus/test';
import { ConcordancePublishDialog } from './ConcordancePublishDialog';
import { emptyConcordance } from './concordanceState';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/features/tools/concordance/api', async (original) => ({
  ...(await original<object>()),
  publishConcordance: vi.fn().mockResolvedValue([]),
}));

it('publishes captured result and filters when a newer run arrives while the dialog is open', async () => {
  const result: concordanceApi.ConcordanceAnalysisResult = {
    request_status: {
      status: 'supported',
      request: { kind: 'concordance', request: emptyConcordance },
    },
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
  result.result.payload.corpora.push(structuredClone(result.result.payload.corpora[0]!));
  const filter: concordanceApi.ConcordanceFilter = {
    excluded_terms: ['dog'],
    uncased: true,
    bins: [2],
    bin_count: 20,
  };
  const client = new QueryClient();
  client.setQueryData(['native', 'http://test', 'graph', 'logical'], {
    nodes: [{ table_name: 'CORPUS_CC_1' }],
  });
  const close = vi.fn();
  const view = (value: concordanceApi.ConcordanceAnalysisResult) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ConcordancePublishDialog
          base="http://test"
          result={value}
          projection="matches"
          filters={[filter]}
          onClose={close}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view(result));
  const names = screen.getAllByRole('textbox', { name: 'Data Block name' });
  expect(names[0]).toHaveValue('Corpus_cc_2');
  expect(names[1]).toHaveValue('Corpus_cc_3');
  fireEvent.change(names[0]!, { target: { value: 'My explicit name' } });
  vi.mocked(concordanceApi.publishConcordance).mockRejectedValueOnce(
    new Error('Name already exists'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
  await waitFor(() => expect(concordanceApi.publishConcordance).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add', exact: true })).toBeEnabled(),
  );
  expect(close).not.toHaveBeenCalled();
  expect(names[0]).toHaveValue('My explicit name');
  rerender(view({ ...result, id: 'newer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(concordanceApi.publishConcordance).toHaveBeenCalledWith(
    'http://test',
    'original',
    'matches',
    [
      expect.objectContaining({ source_index: 0, filter, name: 'My explicit name' }),
      expect.objectContaining({ source_index: 1, name: 'Corpus_cc_3' }),
    ],
  );
});
