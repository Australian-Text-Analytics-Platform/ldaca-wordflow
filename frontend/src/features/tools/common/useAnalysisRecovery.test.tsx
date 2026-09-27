import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useAnalysisRecovery } from './useAnalysisRecovery';
import { AnalysisResultBoundary } from './components/AnalysisResultBoundary';

afterEach(() => vi.restoreAllMocks());

function mount(resource = 'analyses', queriedId = 'saved') {
  const read = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('Broken artifact'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Output({ broken }: { broken: boolean }) {
    const query = useQuery({
      queryKey: ['native', 'base', resource, queriedId, 'rows'],
      queryFn: read,
    });
    if (broken) throw new Error('Obsolete result shape');
    if (query.isError)
      return (
        <button
          onClick={() => {
            void query.refetch();
          }}
        >
          Retry
        </button>
      );
    return <p>{query.data}</p>;
  }
  function Harness({ id, broken }: { id: string | null; broken: boolean }) {
    const recovery = useAnalysisRecovery('base', id);
    return (
      <>
        <button>{recovery.failed ? 'Rerun' : 'Run'}</button>
        <AnalysisResultBoundary
          base="base"
          analysisId={id}
          name="Analysis"
          onError={recovery.onRenderError}
          onReset={recovery.reset}
        >
          <Output broken={broken} />
        </AnalysisResultBoundary>
      </>
    );
  }
  const tree = (id: string | null, broken = false) => (
    <QueryClientProvider client={client}>
      <Harness id={id} broken={broken} />
    </QueryClientProvider>
  );
  const view = render(tree('saved'));
  return {
    read,
    client,
    show: (id: string | null) => view.rerender(tree(id)),
    breakRendering: () => {
      view.rerender(tree('saved', true));
    },
    repair: () => {
      view.rerender(tree('saved'));
    },
  };
}

it('derives recovery from projection errors and resolves it after a successful Retry', async () => {
  const { read } = mount();
  await screen.findByRole('button', { name: 'Rerun' });
  read.mockResolvedValue('Saved output');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Saved output');
  expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(2);
});

it.each([
  ['analysis-preview', 'saved'],
  ['analyses', 'other'],
])('ignores errors from %s / %s', async (resource, id) => {
  mount(resource, id);
  await screen.findByRole('button', { name: 'Retry' });
  expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
});

it('does not carry old result failures into a replacement or cleared result', async () => {
  const view = mount();
  await screen.findByRole('button', { name: 'Rerun' });
  view.show('replacement');
  expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  view.show(null);
  expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
});

it('keeps request actions outside rendering failures and retries the existing output', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const view = mount();
  view.read.mockResolvedValue('Saved output');
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await screen.findByText('Saved output');
  view.breakRendering();
  await screen.findByText(/Could not display saved results/);
  expect(screen.getByRole('button', { name: 'Rerun' })).toBeInTheDocument();
  view.repair();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Saved output');
  expect(await screen.findByRole('button', { name: 'Run' })).toBeInTheDocument();
});
