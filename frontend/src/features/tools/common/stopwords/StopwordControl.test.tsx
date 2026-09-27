import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { StopwordDialog } from './StopwordControl';
import { saveStopwords } from './stopwordData';
import type * as StopwordData from './stopwordData';
vi.mock('./stopwordData', async (original) => ({
  ...(await original<typeof StopwordData>()),
  saveStopwords: vi.fn(),
  stopwordQuery: (base: string, selected: StopwordData.StopwordSource) => ({
    queryKey: ['words', base, selected],
    staleTime: Infinity,
    queryFn: async () => [...mocks.words],
  }),
}));
import type * as StopwordsModule from '../language/stopwords';

const mocks = vi.hoisted(() => ({
  words: [] as string[],
  data: null as string | null,
  fetching: false,
  error: false,
  refetch: vi.fn(),
  load: vi.fn(),
}));
vi.mock('../language/useDetectedColumnLanguage', () => ({
  useDetectedColumnLanguage: ({ target }: { target: unknown }) => ({
    data: target ? mocks.data : null,
    isFetching: Boolean(target) && mocks.fetching,
    isError: Boolean(target) && mocks.error,
    refetch: mocks.refetch,
  }),
}));
vi.mock('../language/stopwords', async (original) => ({
  ...(await original<typeof StopwordsModule>()),
  loadMergedStopwords: mocks.load,
}));

const sources = [
  {
    source: { schema: 'data', name: 'words' },
    column: 'text',
    tokenizer: 'native:plain_words_en',
  },
];
beforeEach(() => {
  vi.mocked(saveStopwords)
    .mockReset()
    .mockImplementation(async (_base, _target, before, after, sort) => {
      mocks.words = mocks.words.filter(
        (word) => !before.some((remove) => remove.toLowerCase() === word.toLowerCase()),
      );
      for (const word of after)
        if (!mocks.words.some((existing) => existing.toLowerCase() === word.toLowerCase()))
          mocks.words.push(word.toLowerCase());
      if (sort) mocks.words.sort();
    });
  mocks.data = null;
  mocks.fetching = false;
  mocks.error = false;
  mocks.refetch.mockReset();
  mocks.load.mockReset();
});
function setup(value = ['hello']) {
  mocks.words = [...value];
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onClose = vi.fn();
  const content = () => (
    <QueryClientProvider client={client}>
      <StopwordDialog
        base=""
        target={sources[0]!}
        words={value}
        inputs={[...sources]}
        onClose={onClose}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(content());
  return { onChange: vi.mocked(saveStopwords), onClose, rerender: () => rerender(content()) };
}

it('keeps database order and persists complete-row sorting through the shared operation', async () => {
  const { onChange } = setup(['zebra', 'apple', 'banana']);
  const bubbles = () =>
    screen
      .getAllByRole('button', { name: /^Remove stopword/ })
      .map((button) => button.getAttribute('aria-label'));
  expect(bubbles()).toEqual([
    'Remove stopword zebra',
    'Remove stopword apple',
    'Remove stopword banana',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
  await waitFor(() =>
    expect(bubbles()).toEqual([
      'Remove stopword apple',
      'Remove stopword banana',
      'Remove stopword zebra',
    ]),
  );
  expect(onChange).toHaveBeenCalledWith('', sources[0], [], [], true);
});
it('writes small membership deltas immediately and closes without another write', async () => {
  const { onChange, onClose } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Remove stopword hello' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Remove stopword hello' })).not.toBeInTheDocument(),
  );
  const input = screen.getByRole('textbox', { name: 'Add stopword' });
  fireEvent.change(input, { target: { value: 'Cat' } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('button', { name: 'Remove stopword cat' });
  expect(onChange.mock.calls).toEqual([
    ['', sources[0], ['hello'], [], false],
    ['', sources[0], [], ['Cat'], false],
  ]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Close', exact: true })[0]!);
  expect(onClose).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenCalledTimes(2);
});
it('pastes a deduplicated batch and requires confirmation to clear the shared list', async () => {
  const { onChange } = setup([]);
  const user = userEvent.setup();
  fireEvent.pointerDown(screen.getByRole('group', { name: 'Stopword bubbles' }));
  const input = screen.getByRole('textbox', { name: 'Add stopword' });
  expect(input).toHaveFocus();
  await user.paste('Apple, banana\nAPPLE\n中文');
  await screen.findByRole('button', { name: 'Remove stopword 中文' });
  expect(onChange).toHaveBeenCalledWith('', sources[0], [], ['Apple', 'banana', '中文'], false);
  fireEvent.click(screen.getByRole('button', { name: 'Clear', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(onChange).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Clear', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all', exact: true }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /^Remove stopword/ })).not.toBeInTheDocument(),
  );
});
it('does not commit during IME composition or rewrite existing delimited cells', async () => {
  const { onChange } = setup(['a,b', 'one\ntwo']);
  const input = screen.getByRole('textbox', { name: 'Add stopword' });
  fireEvent.change(input, { target: { value: '中文' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('button', { name: 'Remove stopword 中文' });
  expect(onChange).toHaveBeenCalledWith('', sources[0], [], ['中文'], false);
  expect(screen.getByRole('button', { name: 'Remove stopword a,b' })).toBeInTheDocument();
});

it('preserves a manual multilingual selection when a later recommendation arrives, and appends only after confirmation', async () => {
  mocks.fetching = true;
  mocks.load.mockResolvedValue({ merged: ['the', 'and'] });
  const { onChange, rerender } = setup(['The']);
  fireEvent.click(screen.getByRole('button', { name: 'Add language preset…' }));
  expect(screen.getByText(/Detecting input languages/)).toHaveTextContent(
    'Detecting input languages',
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'English', exact: true }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'French', exact: true }));
  mocks.data = 'zh';
  mocks.fetching = false;
  rerender();
  expect(
    screen.getByRole('checkbox', { name: 'Chinese (Recommended)', exact: true }),
  ).not.toBeChecked();
  expect(screen.getAllByRole('checkbox')[0]).toHaveAccessibleName('Chinese (Recommended)');
  expect(screen.getByRole('checkbox', { name: 'English', exact: true })).toBeChecked();
  expect(mocks.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Add language preset' })).not.toBeInTheDocument(),
  );
  expect(mocks.load).toHaveBeenCalledWith({ languages: ['en', 'fr'] });
  expect(onChange).toHaveBeenCalledWith('', sources[0], [], ['the', 'and'], false);
  expect(screen.getByRole('button', { name: 'Remove stopword The' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove stopword and' })).toBeInTheDocument();
});

it('preselects an available recommendation and keeps load errors inline with retry', async () => {
  mocks.data = 'zh';
  mocks.load
    .mockRejectedValueOnce(new Error('Chunk unavailable'))
    .mockResolvedValueOnce({ merged: ['的'] });
  setup([]);
  fireEvent.click(screen.getByRole('button', { name: 'Add language preset…' }));
  expect(
    screen.getByRole('checkbox', { name: 'Chinese (Recommended)', exact: true }),
  ).toBeChecked();
  expect(screen.getAllByRole('checkbox')[0]).toHaveAccessibleName('Chinese (Recommended)');
  fireEvent.change(screen.getByRole('textbox', { name: 'Search stopword languages' }), {
    target: { value: 'Chinese' },
  });
  expect(screen.queryByRole('checkbox', { name: 'English', exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The words were not added');
  fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Add language preset' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Remove stopword 的' })).toBeInTheDocument();
});

it('retains unsubmitted input after a failed write without optimistic bubbles', async () => {
  const { onClose } = setup();
  vi.mocked(saveStopwords).mockRejectedValueOnce(new Error('Constraint'));
  const input = screen.getByRole('textbox', { name: 'Add stopword' });
  fireEvent.change(input, { target: { value: 'replacement' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(input).toBeEnabled());
  expect(input).toHaveValue('replacement');
  expect(
    screen.queryByRole('button', { name: 'Remove stopword replacement' }),
  ).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Close', exact: true })[0]!);
  expect(onClose).toHaveBeenCalledOnce();
  expect(saveStopwords).toHaveBeenCalledOnce();
});
