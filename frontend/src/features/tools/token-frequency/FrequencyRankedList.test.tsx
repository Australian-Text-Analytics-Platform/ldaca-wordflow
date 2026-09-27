import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tableFromArrays } from 'apache-arrow';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { FrequencyRankedList, FREQUENCY_LIST_CHUNK_SIZE } from './FrequencyRankedList';

vi.mock('@/features/project/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  queryFrequency: vi.fn(),
}));
const page = (number: number) => ({
  table: tableFromArrays({
    token: Array.from(
      { length: FREQUENCY_LIST_CHUNK_SIZE },
      (_, index) => `word${(number - 1) * FREQUENCY_LIST_CHUNK_SIZE + index}`,
    ),
    rank: Array.from({ length: FREQUENCY_LIST_CHUNK_SIZE }, (_, index) =>
      BigInt(317 + (number - 1) * FREQUENCY_LIST_CHUNK_SIZE + index),
    ),
    frequency: Array.from({ length: FREQUENCY_LIST_CHUNK_SIZE }, (_, index) =>
      BigInt(1000 - (number - 1) * FREQUENCY_LIST_CHUNK_SIZE - index),
    ),
  }),
  totalRows: 10_000,
});
function mount(firstPage = page(1), onTokenContextMenu = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FrequencyRankedList
        base="http://project"
        analysisId="saved"
        query={{ view: 'corpus', corpus_index: 0, filter: 'word*' }}
        firstPage={firstPage}
        active
        label="Corpus frequencies"
        color="#2563eb"
        registerScrollElement={() => undefined}
        onScroll={() => undefined}
        onTokenContextMenu={onTokenContextMenu}
      />
    </QueryClientProvider>,
  );
  return { ...view, list: screen.getByRole('list', { name: 'Corpus frequencies' }), client };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(384);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(500);
  vi.mocked(api.queryFrequency).mockImplementation(async (_base, _id, query) =>
    page(query.page ?? 1),
  );
});
afterEach(() => vi.restoreAllMocks());

it('keeps the full scroll range while fetching only nearby chunks and retaining the first-row scale', async () => {
  const { list } = mount();
  expect(within(list).getByText('word0')).toBeInTheDocument();
  expect(within(list).getByText('317.')).toBeInTheDocument();
  expect(within(list).getAllByRole('listitem').length).toBeLessThan(40);
  expect(api.queryFrequency).not.toHaveBeenCalled();
  expect(within(list).getAllByRole('listitem')[0]).toHaveAttribute('aria-setsize', '10000');
  fireEvent.scroll(list, { target: { scrollTop: 400 * 40 } });
  await within(list).findByText('word400');
  expect(api.queryFrequency).toHaveBeenCalledWith(
    'http://project',
    'saved',
    expect.objectContaining({ page: 3, page_size: 200, filter: 'word*' }),
    expect.any(AbortSignal),
  );
  expect(within(list).getAllByRole('listitem').length).toBeLessThan(40);
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText('word400'));
  if (!row) throw new Error('The scrolled row is missing');
  expect(row).toHaveAttribute('aria-posinset', '401');
  expect(within(row).getByTestId('frequency-bar')).toHaveStyle({ width: '60%' });
  expect(within(list).queryByText('word0')).not.toBeInTheDocument();
  expect(api.queryFrequency).toHaveBeenCalledTimes(2); // Visible rows span chunks 2 and 3.
  fireEvent.scroll(list, { target: { scrollTop: 0 } });
  await within(list).findByText('word0');
  fireEvent.scroll(list, { target: { scrollTop: 400 * 40 } });
  await within(list).findByText('word400');
  expect(api.queryFrequency).toHaveBeenCalledTimes(2);
});

it('keeps exact counts and keyboard/context stopword actions', () => {
  const onToken = vi.fn();
  const { list } = mount(
    {
      table: tableFromArrays({
        token: ['precise', 'smaller'],
        frequency: new BigUint64Array([18446744073709551615n, 9007199254740993n]),
      }),
      totalRows: 2,
    },
    onToken,
  );
  expect(within(list).getByText('18446744073709551615')).toBeInTheDocument();
  expect(within(list).getByText('9007199254740993')).toBeInTheDocument();
  const rows = within(list).getAllByRole('listitem');
  fireEvent.contextMenu(rows[0]);
  fireEvent.keyDown(rows[1], { key: 'F10', shiftKey: true });
  expect(onToken.mock.calls).toEqual([['precise'], ['smaller']]);
});

it('leaves unloaded positions visible and supports retry without resetting the scroll range', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof page>>();
  vi.mocked(api.queryFrequency).mockImplementation((_base, _id, query) =>
    query.page === 3 ? pending.promise : Promise.resolve(page(2)),
  );
  const { list } = mount();
  fireEvent.scroll(list, { target: { scrollTop: 400 * 40 } });
  await waitFor(() => expect(api.queryFrequency).toHaveBeenCalledTimes(2));
  expect(within(list).getAllByText('Loading…').length).toBeGreaterThan(0);
  await act(async () => pending.reject(new Error('Read failed')));
  await screen.findByRole('alert');
  vi.mocked(api.queryFrequency).mockResolvedValue(page(3));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await within(list).findByText('word400');
  expect(list.scrollTop).toBe(400 * 40);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
